import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CalendarDays, CheckCircle2, MessageSquareWarning, Send, ShieldCheck, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { disputesApi, ordersApi } from '@/api/index';
import OrderEvidencePanel from '@/components/orders/OrderEvidencePanel';
import { useAuth } from '@/auth/useAuth';
import { formatDate } from '@/utils/format';
import { PageSpinner } from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABELS } from '@/config/constants';

const CLOSED_STATUSES = ['RESOLVED', 'CLOSED'];
const EMPTY_DISPUTES = [];
const STATUS_FILTERS = [
  { value: 'ALL', label: 'All cases' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'RESOLVED', label: 'Resolved' },
];

const statusVariant = (status) => CLOSED_STATUSES.includes(status) ? 'green' : status === 'ESCALATED' ? 'red' : 'amber';
const formatLabel = (value) => value?.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || '—';

const Disputes = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const messageListRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [messageDrafts, setMessageDrafts] = useState({});
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeOrderId, setDisputeOrderId] = useState('');
  const [disputeType, setDisputeType] = useState('QUALITY_MISMATCH');
  const [disputeTitle, setDisputeTitle] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');

  const list = useQuery({
    queryKey: ['disputes', 'mine'],
    queryFn: disputesApi.getMine,
    select: (response) => response.data.data.disputes || [],
  });
  const disputes = list.data || EMPTY_DISPUTES;
  const ordersList = useQuery({
    queryKey: ['orders', 'mine', 'dispute-center'],
    queryFn: () => ordersApi.getMine({ limit: 100 }),
    select: (response) => response.data.data.orders || [],
  });
  const myOrders = ordersList.data || EMPTY_DISPUTES;
  const eligibleOrders = myOrders.filter((order) =>
    ['DELIVERED', 'WEIGHT_VERIFIED'].includes(order.status) && !order.dispute
  );
  const recentOtherOrders = myOrders.filter((order) => !eligibleOrders.some((eligible) => eligible._id === order._id)).slice(0, 4);
  const ordersToShow = [...eligibleOrders, ...recentOtherOrders];
  const filteredDisputes = useMemo(() => {
    if (statusFilter === 'ACTIVE') return disputes.filter((item) => !CLOSED_STATUSES.includes(item.status));
    if (statusFilter === 'RESOLVED') return disputes.filter((item) => CLOSED_STATUSES.includes(item.status));
    return disputes;
  }, [disputes, statusFilter]);
  const activeId = filteredDisputes.some((item) => item._id === selectedId)
    ? selectedId
    : filteredDisputes[0]?._id;
  const message = activeId ? messageDrafts[activeId] || '' : '';
  const detail = useQuery({
    queryKey: ['dispute', activeId],
    queryFn: () => disputesApi.getOne(activeId),
    enabled: Boolean(activeId),
    select: (response) => response.data.data.dispute,
  });

  const sendMutation = useMutation({
    mutationFn: ({ disputeId, content }) => disputesApi.addMessage(disputeId, content),
    onSuccess: (_response, { disputeId }) => {
      setMessageDrafts((current) => ({ ...current, [disputeId]: '' }));
      qc.invalidateQueries({ queryKey: ['dispute', disputeId] });
      qc.invalidateQueries({ queryKey: ['disputes', 'mine'] });
      toast.success('Reply added to the case');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not send your reply'),
  });

  const openDisputeForm = (orderId = eligibleOrders[0]?._id) => {
    setDisputeOrderId(orderId || '');
    setDisputeType('QUALITY_MISMATCH');
    setDisputeTitle('');
    setDisputeDescription('');
    setDisputeModalOpen(true);
  };

  const createDisputeMutation = useMutation({
    mutationFn: () => disputesApi.create({
      orderId: disputeOrderId,
      type: disputeType,
      title: disputeTitle.trim(),
      description: disputeDescription.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disputes', 'mine'] });
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
      qc.invalidateQueries({ queryKey: ['order', disputeOrderId] });
      setDisputeModalOpen(false);
      toast.success('Dispute submitted. The order is now under review.');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not submit dispute'),
  });

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [detail.data?.messages?.length, activeId]);

  if (list.isLoading) return <PageSpinner />;
  if (list.isError) {
    return <div className="page"><div className="card p-8 text-center">
      <h1 className="font-semibold">Could not load disputes</h1>
      <p className="text-sm text-gray-500 mt-1">{list.error?.response?.data?.message || 'Refresh and try again.'}</p>
      <Button className="mt-4" variant="secondary" onClick={() => list.refetch()}>Try again</Button>
    </div></div>;
  }

  const activeCount = disputes.filter((item) => !CLOSED_STATUSES.includes(item.status)).length;
  const resolvedCount = disputes.length - activeCount;
  const ordersPath = user?.role === 'FARMER' ? '/farmer/orders' : '/buyer/orders';
  const caseData = detail.data;
  const isClosed = CLOSED_STATUSES.includes(caseData?.status);
  const raisedById = caseData?.raisedBy?._id || caseData?.raisedBy;
  const raisedByMe = raisedById?.toString() === user?._id?.toString();
  const otherParty = raisedByMe ? caseData?.against : caseData?.raisedBy;

  return (
    <div className="page animate-fade-in">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="page-kicker">ORDER SUPPORT / CASE MANAGEMENT</span>
          <h1 className="section-title mt-1">Disputes</h1>
          <p className="mt-1 text-sm text-gray-500">Raise an issue on an order and follow every update through resolution.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={ordersPath} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
            View all orders <ArrowUpRight size={15} />
          </Link>
          {eligibleOrders.length > 0 && <Button onClick={() => openDisputeForm()}><MessageSquareWarning size={16} /> New dispute</Button>}
        </div>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Dispute overview">
        <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active cases</span><span className="rounded-lg bg-amber-50 p-2 text-amber-700"><ShieldCheck size={17} /></span></div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{activeCount}</p>
          <p className="mt-0.5 text-xs text-gray-500">Waiting for a response or decision</p>
        </article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resolved</span><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><CheckCircle2 size={17} /></span></div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{resolvedCount}</p>
          <p className="mt-0.5 text-xs text-gray-500">Closed with a recorded outcome</p>
        </article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Eligible orders</span><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><MessageSquareWarning size={17} /></span></div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{ordersList.isLoading ? '—' : eligibleOrders.length}</p>
          <p className="mt-0.5 text-xs text-gray-500">Delivered, before payment is finalized</p>
        </article>
      </section>

      <div className="mb-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)]">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-labelledby="dispute-orders-heading">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
            <div>
              <h2 id="dispute-orders-heading" className="font-semibold text-gray-900">Orders</h2>
              <p className="mt-1 text-sm text-gray-500">Check delivery progress and open an eligible case.</p>
            </div>
            {eligibleOrders.length > 0 && <Badge variant="green">{eligibleOrders.length} eligible</Badge>}
          </header>

          {ordersList.isLoading ? <p className="px-5 py-8 text-center text-sm text-gray-500">Loading orders…</p> : ordersList.isError ? (
            <div className="m-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
              Could not load order statuses. <button type="button" className="font-semibold underline" onClick={() => ordersList.refetch()}>Try again</button>
            </div>
          ) : ordersToShow.length === 0 ? (
            <div className="px-5 py-9 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-500"><Truck size={20} /></span>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">No orders to review</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Your order delivery status and dispute options will appear here once you place or receive an order.</p>
              <Link to={ordersPath} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">Browse all orders <ArrowUpRight size={14} /></Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {ordersToShow.map((order) => {
                const canRaise = eligibleOrders.some((eligible) => eligible._id === order._id);
                const canRaiseAfterDelivery = !canRaise && !order.dispute && !['PAYMENT_SETTLED', 'COMPLETED', 'CANCELLED', 'DISPUTED'].includes(order.status);
                const deliveryLabel = order.deliveryDate?.actual
                  ? `Delivered ${formatDate(order.deliveryDate.actual)}`
                  : order.status === 'IN_TRANSIT'
                    ? 'In transit · awaiting delivery confirmation'
                    : order.deliveryDate?.scheduled
                      ? `Scheduled ${formatDate(order.deliveryDate.scheduled)}`
                      : 'Delivery date not set';
                return <article key={order._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${canRaise ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {order.deliveryDate?.actual ? <CheckCircle2 size={17} /> : order.status === 'IN_TRANSIT' ? <Truck size={17} /> : <CalendarDays size={17} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-gray-900">{order.crop?.name || 'Produce order'}</h3>
                        <Badge variant={ORDER_STATUS_COLOR[order.status]?.replace('badge-', '') || 'gray'}>{ORDER_STATUS_LABELS[order.status] || order.status?.replaceAll('_', ' ')}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Order #{order.orderNumber} <span className="px-1">·</span> Placed {formatDate(order.createdAt)}</p>
                      <p className={`mt-1.5 text-xs ${order.deliveryDate?.actual ? 'font-medium text-emerald-700' : 'text-gray-500'}`}>{deliveryLabel}</p>
                      {['PAYMENT_SETTLED', 'COMPLETED'].includes(order.status) && <p className="mt-1 text-xs text-gray-500">Payment finalized · dispute window closed</p>}
                      {order.dispute && <p className="mt-1 text-xs text-gray-500">A case is already open for this order</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
                    <Link to={`/orders/${order._id}`} className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50">Order details</Link>
                    {canRaise && <Button size="sm" onClick={() => openDisputeForm(order._id)}><MessageSquareWarning size={14} /> Raise case</Button>}
                    {canRaiseAfterDelivery && <span className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">Available after delivery</span>}
                  </div>
                </article>;
              })}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="dispute-window-heading">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><ShieldCheck size={18} /></span>
            <div>
              <h2 id="dispute-window-heading" className="font-semibold text-gray-900">Dispute window</h2>
              <p className="mt-1 text-sm text-gray-500">When a case can be opened</p>
            </div>
          </div>
          <ol className="mt-5 space-y-4">
            <li className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">1</span><p className="text-sm leading-relaxed text-gray-600"><b className="text-gray-800">Delivered</b> or <b className="text-gray-800">Weight verified</b> — raise a case while payment is pending.</p></li>
            <li className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-800">2</span><p className="text-sm leading-relaxed text-gray-600"><b className="text-gray-800">In transit</b> — delivery must be confirmed from order details first.</p></li>
            <li className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600">3</span><p className="text-sm leading-relaxed text-gray-600"><b className="text-gray-800">Payment finalized</b> — new cases can’t be opened, but existing cases stay available.</p></li>
          </ol>
          <Link to={ordersPath} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">View order workflow <ArrowUpRight size={14} /></Link>
        </aside>
      </div>

      <section aria-labelledby="your-cases-heading">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="page-kicker">CASE HISTORY</span>
            <h2 id="your-cases-heading" className="mt-1 text-xl font-semibold text-gray-900">Your cases</h2>
          </div>
          <span className="text-sm text-gray-500">{disputes.length} total {disputes.length === 1 ? 'case' : 'cases'}</span>
        </header>

      {disputes.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-8 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-500"><MessageSquareWarning size={22} /></span>
          <div className="mt-3 flex-1 sm:mt-0">
            <h3 className="font-semibold text-gray-900">No cases opened yet</h3>
            <p className="mt-1 text-sm text-gray-500">Cases you raise or need to respond to will appear here with messages and outcomes.</p>
          </div>
          {eligibleOrders.length > 0 && <Button className="mt-4 sm:mt-0" onClick={() => openDisputeForm()}><MessageSquareWarning size={15} /> Start a case</Button>}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter disputes">
            {STATUS_FILTERS.map((filter) => {
              const count = filter.value === 'ALL'
                ? disputes.length
                : disputes.filter((item) => filter.value === 'ACTIVE' ? !CLOSED_STATUSES.includes(item.status) : CLOSED_STATUSES.includes(item.status)).length;
              return <button
                key={filter.value}
                type="button"
                aria-pressed={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${statusFilter === filter.value ? 'bg-primary-700 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >{filter.label} <span className="ml-1 opacity-75">{count}</span></button>;
            })}
          </div>

          {filteredDisputes.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">There are no {statusFilter.toLowerCase()} cases.</div>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.7fr)]">
              <nav className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm" aria-label="Your dispute cases">
                <div className="max-h-[70vh] space-y-1 overflow-y-auto">
                  {filteredDisputes.map((dispute) => (
                    <button
                      key={dispute._id}
                      type="button"
                      aria-pressed={activeId === dispute._id}
                      onClick={() => setSelectedId(dispute._id)}
                      className={`w-full rounded-xl p-3 text-left transition-colors ${activeId === dispute._id ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-gray-50'}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-semibold text-gray-900">{dispute.title}</span>
                        <Badge variant={statusVariant(dispute.status)}>{formatLabel(dispute.status)}</Badge>
                      </span>
                      <span className="mt-2 block text-xs text-gray-500">Order #{dispute.order?.orderNumber || '—'} · {formatDate(dispute.createdAt)}</span>
                      <span className="mt-1 block text-xs text-gray-500">{formatLabel(dispute.type)}</span>
                    </button>
                  ))}
                </div>
              </nav>

              <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Selected dispute">
                {detail.isLoading ? <div className="p-8"><PageSpinner /></div> : detail.isError || !caseData ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-gray-600">Could not load this dispute.</p>
                    <Button className="mt-3" size="sm" variant="secondary" onClick={() => detail.refetch()}>Try again</Button>
                  </div>
                ) : <>
                  <div className="border-b border-gray-100 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order #{caseData.order?.orderNumber || '—'} · {formatLabel(caseData.type)}</p>
                        <h2 className="mt-1 text-xl font-semibold text-gray-900">{caseData.title}</h2>
                      </div>
                      <Badge variant={statusVariant(caseData.status)}>{formatLabel(caseData.status)}</Badge>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{caseData.description}</p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                      <span>Opened by <b className="font-semibold text-gray-700">{raisedByMe ? 'You' : caseData.raisedBy?.name || 'Order participant'}</b></span>
                      <span>Other party <b className="font-semibold text-gray-700">{otherParty?.name || 'Order participant'}</b></span>
                      <span>Opened {formatDate(caseData.createdAt)}</span>
                    </div>
                    {caseData.order?._id && <Link to={`/orders/${caseData.order._id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">Open order details <ArrowUpRight size={14} /></Link>}
                    {caseData.resolution?.decision && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
                      <p className="font-semibold">Resolution</p>
                      <p className="mt-1">{caseData.resolution.decision}</p>
                      {caseData.resolution.notes && <p className="mt-2 whitespace-pre-wrap text-emerald-900/80">{caseData.resolution.notes}</p>}
                      {caseData.resolution.resolvedAt && <p className="mt-2 text-xs text-emerald-900/70">Resolved {formatDate(caseData.resolution.resolvedAt)}</p>}
                    </div>}
                  </div>

                  {caseData.order?._id && <div className="border-b border-gray-100 p-4 sm:p-5"><OrderEvidencePanel orderId={caseData.order._id} evidence={caseData.order.evidence || []} /></div>}

                  <div className="p-5 sm:p-6">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-gray-900">Case messages</h3>
                      <span className="text-xs text-gray-500">{caseData.messages?.length || 0} updates</span>
                    </div>
                    <div ref={messageListRef} className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl bg-gray-50 p-3" aria-live="polite" aria-relevant="additions text">
                      {(caseData.messages || []).map((entry) => {
                        const senderId = entry.from?._id || entry.from;
                        const isMine = senderId?.toString() === user?._id?.toString();
                        return <div key={entry._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <article className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[80%] ${isMine ? 'bg-primary-600 text-white' : 'border border-gray-100 bg-white text-gray-800'}`}>
                            <p className={`mb-1 text-[11px] ${isMine ? 'text-white/75' : 'text-gray-500'}`}>{isMine ? 'You' : entry.from?.name || 'Case participant'} · {formatDate(entry.createdAt)}</p>
                            <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>
                          </article>
                        </div>;
                      })}
                      {!caseData.messages?.length && <p className="py-5 text-center text-sm text-gray-500">No messages yet. Use this space to share an update with the other party.</p>}
                    </div>
                  </div>

                  {isClosed ? <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-sm text-gray-500">This case is closed, so new replies are unavailable.</div> : (
                    <form className="border-t border-gray-100 p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); sendMutation.mutate({ disputeId: activeId, content: message.trim() }); }}>
                      <label className="sr-only" htmlFor="dispute-reply">Write a case reply</label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <textarea
                          id="dispute-reply"
                          className="form-input min-h-20 flex-1 resize-y"
                          value={message}
                          maxLength={3000}
                          onChange={(event) => setMessageDrafts((current) => ({ ...current, [activeId]: event.target.value }))}
                          placeholder="Write a reply to the case…"
                        />
                        <Button type="submit" loading={sendMutation.isPending} disabled={!message.trim() || sendMutation.isPending}>
                          <Send size={15} /> Send reply
                        </Button>
                      </div>
                      <p className="mt-1 text-right text-xs text-gray-400">{message.length}/3000</p>
                    </form>
                  )}
                </>}
              </section>
            </div>
          )}
        </div>
      )}
      </section>

      <Modal isOpen={disputeModalOpen} onClose={() => setDisputeModalOpen(false)} title="Raise an order dispute" size="md">
        <form className="space-y-4 p-6" onSubmit={(event) => { event.preventDefault(); createDisputeMutation.mutate(); }}>
          <p className="text-sm text-gray-600">Choose the delivered order and explain what happened. You can raise a case before payment is finalized.</p>
          <label className="block"><span className="form-label">Order</span>
            <select className="form-select" value={disputeOrderId} onChange={(event) => setDisputeOrderId(event.target.value)} required>
              {eligibleOrders.map((order) => <option key={order._id} value={order._id}>#{order.orderNumber} · {order.crop?.name || 'Produce order'}</option>)}
            </select>
          </label>
          <label className="block"><span className="form-label">Issue type</span>
            <select className="form-select" value={disputeType} onChange={(event) => setDisputeType(event.target.value)}>
              <option value="QUANTITY_MISMATCH">Quantity mismatch</option>
              <option value="QUALITY_MISMATCH">Quality mismatch</option>
              <option value="PAYMENT">Payment</option>
              <option value="DELIVERY">Delivery</option>
              <option value="CANCELLATION">Cancellation</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <Input label="Title" required maxLength={120} value={disputeTitle} onChange={(event) => setDisputeTitle(event.target.value)} placeholder="Short summary of the issue" />
          <label className="block"><span className="form-label">Details</span>
            <textarea className="form-input min-h-32 resize-y" required minLength={20} maxLength={5000} value={disputeDescription} onChange={(event) => setDisputeDescription(event.target.value)} placeholder="Include what happened and what resolution you are seeking." />
            <span className="text-xs text-gray-500">{disputeDescription.trim().length}/5000 characters (minimum 20)</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDisputeModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createDisputeMutation.isPending} disabled={!disputeOrderId || !disputeTitle.trim() || disputeDescription.trim().length < 20}>Submit dispute</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Disputes;
