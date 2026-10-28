import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingBag, ClipboardList, Package, Bell, TrendingUp, ArrowUpRight, Sparkles, MessageSquare, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { ordersApi, requirementsApi, notificationsApi, analyticsApi } from '@/api/index';
import { formatINR, formatDate, formatQty } from '@/utils/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLOR } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';
import QuickMatchModal from '@/components/marketplace/QuickMatchModal';

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="stat-card buyer-dashboard-stat">
    <div className={`buyer-stat-icon w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
      <Icon size={20} />
    </div>
    <p className="font-display font-bold text-2xl text-gray-900">{value}</p>
    <p className="text-sm text-gray-500">{label}</p>
  </div>
);

const BuyerDashboard = () => {
  const { user } = useAuth();
  const [isQuickMatchOpen, setIsQuickMatchOpen] = useState(false);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', 'mine', 'buyer'],
    queryFn: () => ordersApi.getMine({ limit: 100 }),
    select: (r) => r.data.data,
  });

  const { data: requirementsData } = useQuery({
    queryKey: ['requirements', 'mine'],
    queryFn: () => requirementsApi.getMine({ limit: 100 }),
    select: (r) => r.data.data,
  });

  const { data: notifsData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.getAll({ unread: 'true', limit: 5 }),
    select: (r) => r.data.data,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'mine', 'BUYER'],
    queryFn: () => analyticsApi.getMine(),
    select: (r) => r.data.data,
  });

  if (isLoading) return <PageSpinner />;

  const orders = ordersData?.orders || [];
  const recentOrders = orders.slice(0, 5);
  const requirements = requirementsData?.requirements || [];
  const notifs = notifsData?.notifications || [];
  const unreadCount = notifsData?.unreadCount || 0;

  const activeRequirements = requirements.filter((r) => ['OPEN', 'RECEIVING_BIDS'].includes(r.status));
  const activeOrders = analyticsData?.summary?.activeOrders ?? orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const totalSpend = analyticsData?.summary?.settledValue ?? orders
    .filter((o) => ['PAYMENT_SETTLED', 'COMPLETED'].includes(o.status))
    .reduce((s, o) => s + (o.price.actualTotal || o.price.expectedTotal || 0), 0);
  const buyerQuickRoutes = [
    { label: 'My requirements', detail: 'Review your open buying requests', href: '/buyer/requirements', icon: ClipboardList, tone: '' },
    { label: 'Messages', detail: 'Continue a buyer conversation', href: '/chat', icon: MessageSquare, tone: 'blue' },
    { label: 'Dispute center', detail: 'Review an order issue', href: '/disputes', icon: ShieldAlert, tone: 'amber' },
  ];

  return (
    <div className="page animate-fade-in buyer-dashboard">
      <header className="buyer-dashboard-masthead">
        <div className="buyer-dashboard-welcome">
          <h1>Welcome, {user?.name ? user.name.split(' ')[0] : 'Buyer'}</h1>
          <p>Source produce, compare offers, and keep delivery on track.</p>
        </div>
      </header>

      <div className="buyer-dashboard-stats">
        <StatCard label="Active Requirements" value={activeRequirements.length} icon={ClipboardList} color="bg-amber-100 text-amber-600" />
        <StatCard label="Active Orders" value={activeOrders} icon={Package} color="bg-blue-100 text-blue-600" />
        <StatCard label="Total Purchases" value={analyticsData?.summary?.totalOrders ?? orders.length} icon={ShoppingBag} color="bg-primary-100 text-primary-600" />
        <StatCard label="Total Spend" value={formatINR(totalSpend, 0)} icon={TrendingUp} color="bg-green-100 text-green-600" />
      </div>

      <section className="buyer-match-prompt" aria-label="Find matching farmer listings">
        <span className="buyer-match-prompt-icon"><Sparkles size={20} /></span>
        <div className="buyer-match-prompt-copy">
          <h2>What are you looking for?</h2>
          <p>Enter a crop, quantity, budget, and delivery date to find suitable active farmer listings.</p>
        </div>
        <button type="button" className="buyer-match-prompt-button" onClick={() => setIsQuickMatchOpen(true)}>
          Find matches <ArrowUpRight size={15} />
        </button>
      </section>
      <QuickMatchModal isOpen={isQuickMatchOpen} onClose={() => setIsQuickMatchOpen(false)} />

      <div className="buyer-dashboard-layout">
        <main className="buyer-dashboard-main">
          <div className="buyer-dashboard-analytics"><AnalyticsPanel data={analyticsData} role="BUYER" /></div>

          <section className="card buyer-recent-orders">
            <div className="buyer-section-heading"><div><h2>Recent orders</h2></div><Link to="/buyer/orders">All orders <ArrowUpRight size={14} /></Link></div>
          {recentOrders.length === 0 ? (
            <div className="buyer-dashboard-empty"><EmptyState icon={Package} title="No orders yet" description="Use smart sourcing to find a match, or post a request from the header." /></div>
          ) : (
            <div className="buyer-order-list">
              {recentOrders.map((order) => (
                <Link
                  key={order._id}
                  to={`/orders/${order._id}`}
                  className="buyer-order-row"
                >
                  <span className="buyer-order-mark"><Package size={16} /></span>
                  <span className="buyer-order-copy"><strong>{order.crop.name}</strong><small>#{order.orderNumber} · {formatQty(order.quantity.expected, order.quantity.unit)} · From {order.farmer?.name}</small></span>
                  <span className="buyer-order-total"><strong>{formatINR(order.price.actualTotal || order.price.expectedTotal)}</strong><Badge variant={ORDER_STATUS_COLOR[order.status]?.replace('badge-', '') || 'gray'}>
                      {ORDER_STATUS_LABELS[order.status]}
                  </Badge></span>
                  <ArrowUpRight size={14} className="buyer-order-arrow" />
                </Link>
              ))}
            </div>
          )}
          </section>
        </main>

        <aside className="buyer-dashboard-rail">
          <section className="card buyer-quicklinks">
            <div className="buyer-section-heading"><div><h2>Your shortcuts</h2></div></div>
            {buyerQuickRoutes.map(({ label, detail, href, icon: Icon, tone }) => (
              <Link key={href} to={href} className="buyer-quicklink"><span className={`buyer-quick-icon ${tone}`}><Icon size={16} /></span><span><b>{label}</b><small>{detail}</small></span><ArrowUpRight size={14} /></Link>
            ))}
          </section>

          <section className="card buyer-dashboard-notifications">
            <div className="buyer-section-heading"><div><h2>Notifications {unreadCount > 0 && <i>{unreadCount}</i>}</h2></div></div>
          {notifs.length === 0 ? (
            <div className="buyer-dashboard-empty"><EmptyState icon={Bell} title="All caught up" description="New activity will appear here." /></div>
          ) : (
            <div className="buyer-notification-list">
              {notifs.map((n) => (
                <article key={n._id}><span /><div><p>{n.title}</p><small>{n.body}</small><time>{formatDate(n.createdAt)}</time></div></article>
              ))}
            </div>
          )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default BuyerDashboard;
