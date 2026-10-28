import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/index';
import { useAuth } from '@/auth/useAuth';
import { ROLES } from '@/config/constants';
import { formatRelative } from '@/utils/format';
import { PageSpinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { Bell, BellOff, Package, Gavel, MessageSquare, AlertOctagon, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const typeIcon = {
  NEW_BID: Gavel,
  BID_ACCEPTED: CheckCircle,
  BID_REJECTED: BellOff,
  NEW_ORDER: Package,
  ORDER_STATUS_CHANGE: Package,
  NEW_MESSAGE: MessageSquare,
  DISPUTE_RAISED: AlertOctagon,
  DEFAULT: Bell,
};

const typeColor = {
  NEW_BID: 'bg-amber-100 text-amber-600',
  BID_ACCEPTED: 'bg-primary-100 text-primary-600',
  BID_REJECTED: 'bg-red-100 text-red-500',
  NEW_ORDER: 'bg-blue-100 text-blue-600',
  ORDER_STATUS_CHANGE: 'bg-blue-100 text-blue-600',
  NEW_MESSAGE: 'bg-purple-100 text-purple-600',
  DISPUTE_RAISED: 'bg-red-100 text-red-600',
  DEFAULT: 'bg-gray-100 text-gray-500',
};

const Notifications = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');

  const preferencesQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: notificationsApi.getPreferences,
    select: (response) => response.data.data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll({ limit: 50 }),
    select: (r) => r.data.data,
    refetchInterval: 30000,
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All marked as read');
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const preferencesMutation = useMutation({
    mutationFn: (preferences) => notificationsApi.updatePreferences(preferences),
    onSuccess: (response) => {
      qc.setQueryData(['notification-preferences'], response.data.data);
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      toast.success('Notification preferences saved');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not save preferences'),
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;
  const preferences = preferencesQuery.data?.preferences;
  const delivery = preferencesQuery.data?.delivery;
  const visibleNotifications = filter === 'unread'
    ? notifications.filter((notification) => !notification.channels?.inApp?.read)
    : notifications;

  if (isLoading) return <PageSpinner />;

  return (
    <div className="page animate-fade-in notification-page">
      <header className="notification-page-heading">
        <div><span className="notification-page-kicker"><Bell size={13} /> YOUR FARM-E ACCOUNT</span><h1>Notifications</h1><p>Trade updates, order activity, and messages in one place.</p></div>
        <div className="notification-page-summary"><strong>{unreadCount}</strong><span>unread<br />updates</span></div>
      </header>

      <section className="card mb-4 p-4 sm:p-5" aria-labelledby="notification-settings-title">
        <div className="mb-3">
          <h2 id="notification-settings-title" className="text-sm font-semibold text-gray-900">Delivery preferences</h2>
          <p className="mt-1 text-xs text-gray-500">Choose which Farm-E updates you want to receive.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={preferences?.inAppEnabled ?? true}
              disabled={!preferences || preferencesMutation.isPending}
              onChange={(event) => preferencesMutation.mutate({ inAppEnabled: event.target.checked })}
            />
            <span><b className="block text-sm text-gray-800">In-app notifications</b><small className="text-xs text-gray-500">Show updates in your Farm-E inbox and dashboard.</small></span>
          </label>
          <label className={`flex items-start gap-3 rounded-xl border border-gray-100 p-3 ${user?.role !== ROLES.FARMER ? 'opacity-60' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={preferences?.smsOrderAlertsEnabled ?? false}
              disabled={!preferences || user?.role !== ROLES.FARMER || preferencesMutation.isPending}
              onChange={(event) => preferencesMutation.mutate({ smsOrderAlertsEnabled: event.target.checked })}
            />
            <span><b className="block text-sm text-gray-800">SMS for new farmer orders</b><small className="text-xs text-gray-500">{user?.role !== ROLES.FARMER ? 'Available for farmer accounts.' : delivery?.smsMode === 'provider' && delivery?.smsConfigured ? 'Applies to future orders. SMS provider is configured; charges may apply.' : delivery?.smsMode === 'provider' ? 'Applies to future orders. Provider credentials are incomplete, so delivery will fail.' : 'Applies to future orders. Simulation mode: no text is sent to a phone.'}</small></span>
          </label>
        </div>
      </section>

      <div className="notification-toolbar">
        <div className="notification-filters" role="group" aria-label="Filter notifications">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All <span>{notifications.length}</span></button>
          <button type="button" className={filter === 'unread' ? 'is-active' : ''} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread <span>{unreadCount}</span></button>
        </div>
        {unreadCount > 0 && (
          <Button
            className="notification-mark-all"
            variant="secondary"
            size="sm"
            onClick={() => markAllMutation.mutate()}
            loading={markAllMutation.isPending}
          >
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="notification-empty"><EmptyState icon={Bell} title={preferences?.inAppEnabled === false ? 'In-app updates are off' : 'No notifications'} description={preferences?.inAppEnabled === false ? 'Turn on in-app notifications above to show your Farm-E updates here.' : 'Trade updates and important activity will show up here.'} /></div>
      ) : visibleNotifications.length === 0 ? (
        <div className="notification-empty"><EmptyState icon={CheckCircle} title="You're all caught up" description="There are no unread updates right now." /></div>
      ) : (
        <div className="notification-list">
          <div className="notification-list-heading"><span>RECENT ACTIVITY</span><small>{visibleNotifications.length} {filter === 'unread' ? 'unread' : 'updates'}</small></div>
          <div className="notification-list-items">
            {visibleNotifications.map((n) => {
              const Icon = typeIcon[n.type] || typeIcon.DEFAULT;
              const colorClass = typeColor[n.type] || typeColor.DEFAULT;
              const isUnread = !n.channels?.inApp?.read;
              const typeLabel = n.type?.replaceAll('_', ' ').toLowerCase() || 'update';

              return (
                <article
                  key={n._id}
                  onClick={() => isUnread && markOneMutation.mutate(n._id)}
                  onKeyDown={(event) => event.key === 'Enter' && isUnread && markOneMutation.mutate(n._id)}
                  tabIndex={isUnread ? 0 : undefined}
                  role={isUnread ? 'button' : undefined}
                  aria-label={isUnread ? `Mark ${n.title} as read` : undefined}
                  className={clsx(
                    'notification-row flex items-start gap-3 px-5 py-4 transition-colors',
                    isUnread && 'is-unread'
                  )}
                >
                  <div className={clsx('notification-icon w-9 h-9 rounded-xl flex items-center justify-center shrink-0', colorClass)}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="notification-row-top flex items-start justify-between gap-2">
                      <p className={clsx('text-sm', isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                        {n.title}
                      </p>
                      <div className="notification-row-meta"><span>{typeLabel}</span>{isUnread && <i aria-label="Unread" />}</div>
                    </div>
                    {n.body && <p className="notification-body text-sm text-gray-500 mt-0.5">{n.body}</p>}
                    {n.type === 'NEW_ORDER' && n.channels?.sms?.status && (
                      <p className="mt-1 text-xs font-medium text-gray-500" aria-label="Farmer SMS delivery status">
                        Order SMS: {({ QUEUED: 'queued', RETRY: 'retrying', SENT: 'sent', MOCKED: 'simulated; no phone message sent', FAILED: 'failed after retries', NOT_QUEUED: 'not sent (SMS alerts are off or no phone is on file)' })[n.channels.sms.status] || 'pending'}
                      </p>
                    )}
                    <p className="notification-time text-xs text-gray-400 mt-1">{formatRelative(n.createdAt)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
