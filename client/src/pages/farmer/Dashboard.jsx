import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Gavel, DollarSign, ShoppingBag, Bell, ArrowUpRight, MessageSquare } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { ordersApi, listingsApi, bidsApi, notificationsApi, analyticsApi } from '@/api/index';
import { formatINR, formatDate, formatQty } from '@/utils/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLOR } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';

const StatCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className="stat-card farmer-stat-card">
    <div className="farmer-stat-copy">
      <p className="farmer-stat-label">{label}</p>
      <p className="farmer-stat-value">{value}</p>
      {sub && <p className="farmer-stat-sub">{sub}</p>}
    </div>
    <div className={`farmer-stat-icon ${color}`}><Icon size={18} /></div>
  </div>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const FarmerDashboard = () => {
  const { user } = useAuth();

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', 'mine', 'farmer'],
    queryFn: () => ordersApi.getMine({ limit: 100 }),
    select: (r) => r.data.data,
  });

  const { data: listingsData } = useQuery({
    queryKey: ['listings', 'mine'],
    queryFn: () => listingsApi.getMine({ status: 'ACTIVE', limit: 100 }),
    select: (r) => r.data.data,
  });

  const { data: bidsData } = useQuery({
    queryKey: ['bids', 'mine'],
    queryFn: () => bidsApi.getMine(),
    select: (r) => r.data.data,
  });

  const { data: notifsData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.getAll({ unread: 'true', limit: 5 }),
    select: (r) => r.data.data,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'mine', 'FARMER'],
    queryFn: () => analyticsApi.getMine(),
    select: (r) => r.data.data,
  });

  if (ordersLoading) return <PageSpinner />;

  const orders = ordersData?.orders || [];
  const recentOrders = orders.slice(0, 5);
  const listings = listingsData?.listings || [];
  const bids = bidsData?.bids || [];
  const notifs = notifsData?.notifications || [];
  const unreadCount = notifsData?.unreadCount || 0;

  const activeOrders = analyticsData?.summary?.activeOrders ?? orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const pendingBids = bids.filter((b) => ['PENDING', 'SEEN', 'SHORTLISTED'].includes(b.status));
  const totalRevenue = analyticsData?.summary?.settledValue ?? orders
    .filter((o) => ['PAYMENT_SETTLED', 'COMPLETED'].includes(o.status))
    .reduce((s, o) => s + (o.price.actualTotal || o.price.expectedTotal || 0), 0);
  const farmerQuickRoutes = [
    { label: 'Manage listings', detail: 'Review your active harvests', href: '/farmer/listings', icon: ShoppingBag, tone: 'shortcut-green' },
    { label: 'Your offers', detail: 'See bids and buyer replies', href: '/farmer/bids', icon: Gavel, tone: 'shortcut-gold' },
    { label: 'Messages', detail: 'Talk with buyers', href: '/chat', icon: MessageSquare, tone: 'shortcut-blue' },
  ];

  return (
    <div className="page animate-fade-in farmer-dashboard">
      <header className="farmer-dashboard-masthead">
        <div className="farmer-dashboard-welcome">
          <h1>{getGreeting()}, {user?.name ? user.name.split(' ')[0] : 'Farmer'}</h1>
          <p>Listings, buyer offers, and orders from your farm.</p>
        </div>
      </header>

      <div className="farmer-dashboard-stats">
        <StatCard
          label="Active Listings"
          value={listings.length}
          icon={ShoppingBag}
          color="bg-primary-100 text-primary-600"
        />
        <StatCard
          label="Pending Bids"
          value={pendingBids.length}
          icon={Gavel}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          label="Active Orders"
          value={activeOrders}
          icon={Package}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          label="Total Revenue"
          value={formatINR(totalRevenue, 0)}
          icon={DollarSign}
          color="bg-green-100 text-green-600"
          sub="Settled payments"
        />
      </div>

      <div className="farmer-dashboard-layout">
        <main className="farmer-dashboard-main">
          <div className="farmer-dashboard-analytics"><AnalyticsPanel data={analyticsData} role="FARMER" /></div>

          <section className="card farmer-dashboard-orders">
            <div className="farmer-section-heading">
              <div><h2>Recent orders</h2></div>
              <Link to="/farmer/orders" className="farmer-section-link">All orders <ArrowUpRight size={14} /></Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="farmer-dashboard-empty"><EmptyState icon={Package} title="No orders yet" description="New buyer orders will show up here." /></div>
            ) : (
              <div className="farmer-order-list">
                {recentOrders.map((order) => (
                  <Link key={order._id} to={`/orders/${order._id}`} className="farmer-order-row">
                    <span className="farmer-order-mark"><Package size={17} /></span>
                    <span className="farmer-order-copy">
                      <strong>{order.crop.name}</strong>
                      <small>#{order.orderNumber} · {formatQty(order.quantity.expected, order.quantity.unit)} · {formatDate(order.createdAt)}</small>
                    </span>
                    <span className="farmer-order-total">
                      <strong>{formatINR(order.price.actualTotal || order.price.expectedTotal)}</strong>
                      <Badge variant={ORDER_STATUS_COLOR[order.status]?.replace('badge-', '') || 'gray'}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                    </span>
                    <ArrowUpRight className="farmer-order-arrow" size={15} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="farmer-dashboard-rail">
          <section className="card farmer-dashboard-quicklinks" aria-label="Farmer workspace shortcuts">
            <div className="farmer-section-heading">
              <div><h2>Your shortcuts</h2></div>
            </div>
            {farmerQuickRoutes.map(({ label, detail, href, icon: Icon, tone }) => (
              <Link key={href} to={href} className="farmer-quicklink"><span className={`shortcut-icon ${tone}`}><Icon size={16} /></span><span><b>{label}</b><small>{detail}</small></span><ArrowUpRight size={14} /></Link>
            ))}
          </section>

          <section className="card farmer-dashboard-notifications">
            <div className="farmer-section-heading">
              <div><h2>Notifications {unreadCount > 0 && <span className="farmer-notification-count">{unreadCount}</span>}</h2></div>
            </div>
            {notifs.length === 0 ? (
              <div className="farmer-dashboard-empty farmer-notifications-empty"><EmptyState icon={Bell} title="All caught up" description="New updates will appear here." /></div>
            ) : (
              <div className="farmer-notification-list">
                {notifs.map((n) => (
                  <div key={n._id} className="farmer-notification-row">
                    <span className="farmer-notification-dot" />
                    <div><p>{n.title}</p><small>{n.body}</small><time>{formatDate(n.createdAt)}</time></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default FarmerDashboard;
