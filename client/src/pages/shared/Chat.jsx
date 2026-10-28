import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/api/index';
import { useAuth } from '@/auth/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { formatRelative, initials } from '@/utils/format';
import { PageSpinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { MessageSquare, Send, Search, ArrowLeft, Users } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const EMPTY_MESSAGES = [];

const Chat = () => {
  const { user } = useAuth();
  const { socket, connected, emit, on } = useSocket();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const convIdParam = searchParams.get('convId');

  const [draftsByConversation, setDraftsByConversation] = useState({});
  const [conversationSearch, setConversationSearch] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const sendingRef = useRef(false);
  const localTypingTimeoutRef = useRef(null);
  const remoteTypingTimeoutRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const updateViewport = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Load conversations
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationsApi.getAll(),
    select: (r) => r.data.data,
    refetchInterval: 30000,
  });

  const conversations = conversationsQuery.data?.conversations || [];
  const filteredConversations = conversations.filter((conv) => {
    const other = conv.participants?.find((participant) => (participant._id || participant).toString() !== user?._id?.toString());
    const query = conversationSearch.trim().toLowerCase();
    return !query || [other?.name, other?.role, conv.lastMessage?.content].some((value) => value?.toLowerCase().includes(query));
  });
  const selectedConv = conversations.find((conv) => conv._id === convIdParam)
    || (!convIdParam && isDesktop ? conversations[0] : null);
  const selectedConversationId = selectedConv?._id;
  const message = selectedConversationId ? draftsByConversation[selectedConversationId] || '' : '';

  // Load messages for selected conversation
  const { data: msgsData, isLoading: msgsLoading, isError: msgsError, error: msgsErrorValue, refetch: refetchMessages } = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: () => conversationsApi.getMessages(selectedConversationId),
    select: (r) => r.data.data,
    enabled: Boolean(selectedConversationId),
  });

  const messages = msgsData?.messages || EMPTY_MESSAGES;

  // Mark a thread read when it becomes active, including after a page refresh.
  useEffect(() => {
    if (!selectedConversationId) return undefined;
    let active = true;
    conversationsApi.markRead(selectedConversationId)
      .then(() => {
        if (active) qc.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedConversationId, qc]);

  // Join after every socket connection. A browser refresh or a network drop
  // creates a new server-side connection without the old room membership.
  useEffect(() => {
    if (!selectedConversationId || !socket) return undefined;
    const joinConversation = () => {
      emit('join:conversation', selectedConversationId);
      qc.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    const cleanupConnect = on('connect', joinConversation);
    const cleanupJoined = on('joined:conversation', ({ conversationId } = {}) => {
      if (conversationId?.toString() !== selectedConversationId.toString()) return;
      qc.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      conversationsApi.markRead(selectedConversationId)
        .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(() => {});
    });
    const cleanupMessage = on('new:message', ({ conversationId, message: msg }) => {
      if (conversationId?.toString() === selectedConversationId.toString()) {
        setOtherTyping(false);
        window.clearTimeout(remoteTypingTimeoutRef.current);
        qc.setQueryData(['messages', selectedConversationId], (current) => {
          const existing = current?.messages || [];
          if (existing.some((item) => item._id === msg._id)) return current;
          return { ...(current || {}), messages: [...existing, msg] };
        });
        conversationsApi.markRead(selectedConversationId)
          .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
          .catch(() => {});
        qc.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
    });
    const cleanupTyping = on('user:typing', ({ conversationId, userId: typingUserId } = {}) => {
      if (conversationId?.toString() !== selectedConversationId.toString() || typingUserId?.toString() === user?._id?.toString()) return;
      setOtherTyping(true);
      window.clearTimeout(remoteTypingTimeoutRef.current);
      remoteTypingTimeoutRef.current = window.setTimeout(() => setOtherTyping(false), 3000);
    });
    const cleanupStoppedTyping = on('user:stopped-typing', ({ conversationId, userId: typingUserId } = {}) => {
      if (conversationId?.toString() !== selectedConversationId.toString() || typingUserId?.toString() === user?._id?.toString()) return;
      window.clearTimeout(remoteTypingTimeoutRef.current);
      setOtherTyping(false);
    });
    const cleanupRead = on('messages:read', ({ conversationId, readerId, readAt } = {}) => {
      if (conversationId?.toString() !== selectedConversationId.toString() || readerId?.toString() === user?._id?.toString()) return;
      qc.setQueryData(['messages', selectedConversationId], (current) => {
        if (!current?.messages) return current;
        return {
          ...current,
          messages: current.messages.map((item) => {
            const senderId = item.sender?._id || item.sender;
            if (senderId?.toString() !== user?._id?.toString()) return item;
            const readBy = item.readBy || [];
            if (readBy.some((entry) => (entry.user?._id || entry.user)?.toString() === readerId?.toString())) return item;
            return { ...item, readBy: [...readBy, { user: readerId, readAt }] };
          }),
        };
      });
    });
    if (socket.connected) joinConversation();

    return () => {
      window.clearTimeout(localTypingTimeoutRef.current);
      window.clearTimeout(remoteTypingTimeoutRef.current);
      emit('typing:stop', { conversationId: selectedConversationId });
      emit('leave:conversation', selectedConversationId);
      cleanupConnect?.();
      cleanupJoined?.();
      cleanupMessage?.();
      cleanupTyping?.();
      cleanupStoppedTyping?.();
      cleanupRead?.();
    };
  }, [selectedConversationId, socket, emit, on, qc, user?._id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: ({ content, convId }) => conversationsApi.sendMessage(convId, { content }),
    onSuccess: (response, { optimisticId, convId }) => {
      const sentMessage = response.data.data.message;
      qc.setQueryData(['messages', convId], (current) => {
        const withoutOptimistic = (current?.messages || []).filter((item) => item._id !== optimisticId);
        // The server broadcasts the REST-created message. It can arrive before
        // this response, so de-duplicate by its persisted id when reconciling.
        if (withoutOptimistic.some((item) => item._id === sentMessage._id)) {
          return { ...(current || {}), messages: withoutOptimistic };
        }
        return { ...(current || {}), messages: [...withoutOptimistic, sentMessage] };
      });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      sendingRef.current = false;
    },
    onError: (error, { content, optimisticId, convId }) => {
      qc.setQueryData(['messages', convId], (current) => ({
        ...(current || {}),
        messages: (current?.messages || []).filter((item) => item._id !== optimisticId),
      }));
      setDraftsByConversation((current) => ({ ...current, [convId]: current[convId] || content }));
      toast.error(error.response?.data?.message || 'Could not send message. Your draft is saved.');
      sendingRef.current = false;
    },
    onSettled: () => {
      sendingRef.current = false;
    },
  });

  const handleSend = () => {
    if (!message.trim() || !selectedConversationId || sendingRef.current) return;
    const content = message.trim();
    const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.clearTimeout(localTypingTimeoutRef.current);
    emit('typing:stop', { conversationId: selectedConversationId });
    setDraftsByConversation((current) => ({ ...current, [selectedConversationId]: '' }));
    sendingRef.current = true;

    // Optimistic
    const optimistic = {
      _id: optimisticId,
      sender: user,
      content,
      createdAt: new Date().toISOString(),
    };
    qc.setQueryData(['messages', selectedConversationId], (current) => ({
      ...(current || {}),
      messages: [...(current?.messages || []), optimistic],
    }));

    sendMutation.mutate({ content, optimisticId, convId: selectedConversationId });
  };

  const handleComposerChange = (content) => {
    setDraftsByConversation((current) => ({ ...current, [selectedConversationId]: content }));
    if (!selectedConversationId) return;
    emit('typing:start', { conversationId: selectedConversationId });
    window.clearTimeout(localTypingTimeoutRef.current);
    localTypingTimeoutRef.current = window.setTimeout(() => {
      emit('typing:stop', { conversationId: selectedConversationId });
    }, 1000);
  };

  const getOtherParticipant = (conv) =>
    conv.participants?.find((participant) => (participant._id || participant).toString() !== user?._id?.toString());

  const getUnreadCount = (conv) => Number(conv.unreadCount?.[user?._id] ?? conv.unreadCount?.get?.(user?._id) ?? 0);

  const handleSelectConversation = (conversationId) => {
    setOtherTyping(false);
    window.clearTimeout(remoteTypingTimeoutRef.current);
    const next = new URLSearchParams(searchParams);
    next.set('convId', conversationId);
    setSearchParams(next);
  };

  const handleReturnToInbox = () => {
    setOtherTyping(false);
    window.clearTimeout(remoteTypingTimeoutRef.current);
    const next = new URLSearchParams(searchParams);
    next.delete('convId');
    setSearchParams(next, { replace: true });
  };

  if (conversationsQuery.isLoading) return <PageSpinner />;
  if (conversationsQuery.isError) return <div className="page"><div className="card p-8 text-center">
    <h1 className="font-semibold text-gray-900">Could not load your conversations</h1>
    <p className="mt-1 text-sm text-gray-500">{conversationsQuery.error?.response?.data?.message || 'Check your connection and try again.'}</p>
    <Button className="mt-4" variant="secondary" onClick={() => conversationsQuery.refetch()}>Try again</Button>
  </div></div>;

  return (
    <div className="chat-workspace flex h-full min-h-[500px] overflow-hidden animate-fade-in">
      {/* Conversations sidebar */}
      <div className={clsx(
        'chat-inbox w-full lg:w-80 border-r border-gray-100 bg-white flex flex-col',
        selectedConv && 'hidden lg:flex'
      )}>
        <div className="chat-inbox-heading">
          <div><span className="chat-eyebrow"><MessageSquare size={12} /> FIELD NOTES</span><h1>Messages</h1><p>Keep every trade conversation close.</p></div>
          <span className="chat-thread-count"><Users size={13} /> {conversations.length}</span>
        </div>

        <label className="chat-search"><Search size={15} /><input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>

        <div className="chat-conversation-list flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No conversations" description="Start a conversation from an order or listing" />
          ) : filteredConversations.length === 0 ? (
            <div className="chat-no-matches">No conversations match “{conversationSearch}”.</div>
          ) : (
            filteredConversations.map((conv) => {
              const other = getOtherParticipant(conv);
              const unread = getUnreadCount(conv);
              return (
                <button
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv._id)}
                  aria-current={selectedConv?._id === conv._id ? 'true' : undefined}
                  className={clsx(
                    'chat-conversation w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left',
                    selectedConv?._id === conv._id && 'is-active'
                  )}
                >
                  <div className="chat-person-avatar w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700 shrink-0">
                    {initials(other?.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="chat-conversation-top flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 truncate">{other?.name || 'Trade partner'}</p>
                      {conv.lastMessage && (
                        <p className="text-xs text-gray-400 shrink-0">{formatRelative(conv.lastMessage.sentAt)}</p>
                      )}
                    </div>
                    <p className="chat-conversation-preview text-xs text-gray-500 truncate mt-0.5">
                      {conv.lastMessage?.content || 'No messages yet'}
                    </p>
                    <span className="chat-participant-role">{other?.role || 'Farm-E member'}</span>
                  </div>
                  {unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Message area */}
      <div className={clsx(
        'flex-1 flex flex-col bg-gray-50',
        !selectedConv && 'hidden lg:flex'
      )}>
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation from the sidebar to start chatting" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chat-thread-heading flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
              <button aria-label="Back to conversations" className="chat-back lg:hidden p-1 text-gray-500" onClick={() => {
                handleReturnToInbox();
              }}><ArrowLeft size={17} /></button>
              <div className="chat-person-avatar w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700">
                {initials(getOtherParticipant(selectedConv)?.name)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{getOtherParticipant(selectedConv)?.name}</p>
                <p className="text-xs text-gray-500">{getOtherParticipant(selectedConv)?.role || 'Farm-E member'} · Trade conversation</p>
              </div>
              <span className={clsx('chat-secure-label', !connected && 'is-reconnecting')} title={connected ? 'Live connection is active' : 'Reconnecting to live messages'} aria-label={connected ? 'Live connection active' : 'Reconnecting to live messages'}><i /> {connected ? 'Live' : 'Reconnecting'}</span>
            </div>

            {/* Messages */}
            <div className="chat-message-list flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgsLoading ? (
                <PageSpinner />
              ) : msgsError ? (
                <div className="my-auto rounded-xl border border-red-100 bg-white p-5 text-center">
                  <p className="text-sm font-semibold text-gray-800">Could not load message history</p>
                  <p className="mt-1 text-xs text-gray-500">{msgsErrorValue?.response?.data?.message || 'Check your connection and try again.'}</p>
                  <Button className="mt-3" size="sm" variant="secondary" onClick={() => refetchMessages()}>Try again</Button>
                </div>
              ) : messages.length === 0 ? (
                <p className="my-auto rounded-xl bg-white/80 px-4 py-5 text-center text-sm text-gray-500">No messages yet. Send the first message to start the conversation.</p>
              ) : (
                messages.map((msg) => {
                  const senderId = msg.sender?._id || msg.sender;
                  const isMine = senderId?.toString() === user?._id?.toString();
                  const otherParticipant = getOtherParticipant(selectedConv);
                  const otherParticipantId = (otherParticipant?._id || otherParticipant)?.toString();
                  const isRead = isMine && msg.readBy?.some((entry) => (entry.user?._id || entry.user)?.toString() === otherParticipantId);
                  return (
                    <div key={msg._id} className={clsx('flex', isMine ? 'justify-end' : 'justify-start')}>
                      <div className={clsx(
                        'chat-bubble max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm',
                        isMine
                          ? 'is-mine bg-primary-600 text-white rounded-tr-sm'
                          : 'is-theirs bg-white text-gray-900 shadow-card rounded-tl-sm'
                      )}>
                        <p>{msg.content}</p>
                        <p className={clsx('text-xs mt-1', isMine ? 'text-primary-200' : 'text-gray-400')}>
                          {formatRelative(msg.createdAt)}{isMine && <span> · {isRead ? 'Read' : 'Sent'}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              {otherTyping && <p className="chat-typing-indicator" aria-live="polite">{getOtherParticipant(selectedConv)?.name || 'They'} is typing…</p>}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-composer px-4 py-3 bg-white border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  className="form-input flex-1"
                  placeholder="Type a message..."
                  value={message}
                  maxLength={5000}
                  onChange={(event) => handleComposerChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button type="button" aria-label="Send message" title="Send message" onClick={handleSend} disabled={!message.trim() || sendMutation.isPending}>
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Chat;
