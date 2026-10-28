import { BarChart3, PackageCheck, TrendingUp, Sprout } from 'lucide-react';
import { formatINR } from '@/utils/format';

const monthKeys = () => {
  const today = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
    };
  });
};

const AnalyticsPanel = ({ data, role }) => {
  const summary = data?.summary || {};
  const monthly = data?.monthly || [];
  const demand = data?.demandCrops || [];
  const crops = data?.topCrops || [];
  const keys = monthKeys();
  const monthByKey = new Map(monthly.map((item) => [item._id, item]));
  const values = keys.map(({ key }) => Number(monthByKey.get(key)?.orders || 0));
  const maxOrders = Math.max(...values, 1);
  const totalValue = monthly.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const isFarmer = role === 'FARMER';

  return (
    <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Business analytics">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Business pulse</p>
          <h2 className="mt-1 font-display text-xl font-bold text-slate-900">Your {isFarmer ? 'sales' : 'buying'} analytics</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Last 6 months · all-time totals</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700"><PackageCheck size={17} /><span className="text-xs font-semibold">Orders completed</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.completedOrders || 0}</p>
          <p className="mt-1 text-xs text-slate-500">Settled and completed</p>
        </div>
        <div className="rounded-2xl bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-blue-700"><BarChart3 size={17} /><span className="text-xs font-semibold">Orders in progress</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.activeOrders || 0}</p>
          <p className="mt-1 text-xs text-slate-500">Across your active pipeline</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-700"><TrendingUp size={17} /><span className="text-xs font-semibold">{isFarmer ? 'Settled sales' : 'Settled spend'}</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatINR(summary.settledValue || 0, 0)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatINR(totalValue, 0)} in the last 6 months</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 p-4">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Order trend</h3><span className="text-xs text-slate-500">New orders by month</span></div>
          <div className="grid h-36 grid-cols-6 items-end gap-3" role="img" aria-label="Order count by month for the last six months">
            {keys.map(({ key, label }, index) => {
              const item = monthByKey.get(key);
              const count = values[index];
              return <div key={key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-semibold text-slate-600">{count || ''}</span>
                <div className="flex h-24 w-full items-end rounded-t-md bg-slate-50"><div className="w-full rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all" style={{ height: `${count ? Math.max(8, (count / maxOrders) * 100) : 4}%` }} title={`${count} orders · ${formatINR(item?.value || 0, 0)} settled`} /></div>
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>;
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 p-4">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">{isFarmer ? 'Top crops by sales' : 'Top crops by spend'}</h3><Sprout size={17} className="text-emerald-600" /></div>
          {crops.length ? <div className="space-y-3">{crops.slice(0, 4).map((crop, index) => {
            const max = Math.max(...crops.map((item) => Number(item.value || 0)), 1);
            return <div key={crop._id || index}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{crop._id || 'Other crop'}</span><span className="shrink-0 text-slate-500">{formatINR(crop.value || 0, 0)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, (Number(crop.value || 0) / max) * 100)}%` }} /></div>
            </div>;
          })}</div> : <p className="py-5 text-sm text-slate-500">Settled crop sales will appear here.</p>}
        </div>
      </div>

      {demand.length > 0 && <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">What buyers are asking for</h3><span className="text-xs text-slate-500">Open requests across Farm-E</span></div>
        <div className="flex flex-wrap gap-2">{demand.map((crop) => <span key={crop._id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{crop._id}<span className="text-slate-400">{crop.requests} {crop.requests === 1 ? 'request' : 'requests'}</span></span>)}</div>
      </div>}
    </section>
  );
};

export default AnalyticsPanel;
