import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/index';
import { formatINR } from '@/utils/format';
import { PageSpinner } from '@/components/ui/Spinner';
import { Users, Package, ShoppingBag, AlertOctagon, TrendingUp, Leaf } from 'lucide-react';
import { Link } from 'react-router-dom';
import RegionalSupplyDemandMap from '@/components/maps/RegionalSupplyDemandMap';

const StatCard = ({ label, value, icon: Icon, color, link }) => {
  const content = <>
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${color}`}>
      <Icon size={22} />
    </div>
    <p className="font-display font-bold text-2xl text-gray-900">{value}</p>
    <p className="text-sm text-gray-500">{label}</p>
  </>;
  return link
    ? <Link to={link} className="stat-card hover:shadow-card-hover transition-shadow">{content}</Link>
    : <div className="stat-card">{content}</div>;
};

const AdminDashboard = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.getStats(),
    select: (r) => r.data.data,
    refetchInterval: 60000,
  });

  if (isLoading) return <PageSpinner />;

  const { stats = {}, popularCrops = [], regionalSupplyDemand = [] } = data || {};

  return (
    <div className="page animate-fade-in admin-dashboard">
      <header className="admin-dashboard-masthead">
        <div>
          <h1>Farm-E market activity</h1>
          <p>Trading activity across users, produce and orders.</p>
        </div>
        <span className="admin-dashboard-refresh">Refreshes every minute</span>
      </header>

      <div className="admin-dashboard-stats">
        <StatCard label="Farmers" value={stats.totalFarmers ?? '—'} icon={Leaf} color="bg-primary-100 text-primary-600" link="/admin/users?role=FARMER" />
        <StatCard label="Buyers" value={stats.totalBuyers ?? '—'} icon={Users} color="bg-amber-100 text-amber-600" link="/admin/users?role=BUYER" />
        <StatCard label="Active Listings" value={stats.activeListings ?? '—'} icon={ShoppingBag} color="bg-blue-100 text-blue-600" />
        <StatCard label="Open Requirements" value={stats.openRequirements ?? '—'} icon={Package} color="bg-purple-100 text-purple-600" />
        <StatCard label="Total Orders" value={stats.totalOrders ?? '—'} icon={Package} color="bg-gray-100 text-gray-600" link="/admin/orders" />
        <StatCard label="Completed Orders" value={stats.completedOrders ?? '—'} icon={Package} color="bg-primary-100 text-primary-600" link="/admin/orders?status=COMPLETED" />
        <StatCard label="Active Disputes" value={stats.activeDisputes ?? '—'} icon={AlertOctagon} color="bg-red-100 text-red-600" link="/admin/disputes" />
        <StatCard label="Transaction Volume" value={formatINR(stats.totalTransactionValue, 0)} icon={TrendingUp} color="bg-green-100 text-green-600" />
      </div>

      <section className="card admin-dashboard-crops">
        <div className="admin-dashboard-section-heading">
          <div><h2>Popular crops</h2></div>
          <small>By active marketplace activity</small>
        </div>
        <div className="space-y-3">
          {popularCrops.map((c, i) => (
            <div key={c._id} className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-primary-500 h-2.5 rounded-full"
                  style={{ width: `${(c.count / (popularCrops[0]?.count || 1)) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-28 truncate">{c._id}</span>
              <span className="text-xs text-gray-500 w-10 text-right">{c.count}</span>
            </div>
          ))}
          {popularCrops.length === 0 && <p className="text-sm text-gray-500">No data yet</p>}
        </div>
      </section>

      <section className="card admin-dashboard-map" aria-label="Regional marketplace activity">
        <div className="admin-dashboard-section-heading">
          <div><h2>Regional supply &amp; demand</h2></div>
          <small>Active listings compared with public buyer requests</small>
        </div>
        {regionalSupplyDemand.length
          ? <RegionalSupplyDemandMap cells={regionalSupplyDemand} />
          : <p className="admin-dashboard-map-empty">Map activity will appear as listings and buyer requests include pinned locations.</p>}
      </section>
    </div>
  );
};

export default AdminDashboard;
