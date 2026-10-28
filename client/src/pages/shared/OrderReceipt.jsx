import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Sprout } from 'lucide-react';
import { ordersApi } from '@/api/index';
import { formatDate, formatINR, formatQty } from '@/utils/format';
import { ORDER_STATUS_LABELS } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';

const OrderReceipt = () => {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOne(id),
    select: (response) => response.data.data?.order,
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <div className="page"><p className="text-sm text-gray-600">This order receipt is unavailable.</p><Link to="/" className="mt-3 inline-flex text-sm text-primary-700">Return to Farm-E</Link></div>;

  const order = data;
  const total = order.price?.actualTotal ?? order.price?.expectedTotal ?? 0;
  const paid = ['PAYMENT_SETTLED', 'COMPLETED'].includes(order.status) || order.payment?.status === 'COMPLETED';

  return <main className="min-h-screen bg-slate-50 px-4 py-8 print:bg-white print:p-0">
    <style>{`@media print{body{background:#fff!important}.receipt-actions{display:none!important}.receipt-paper{box-shadow:none!important;border:0!important;max-width:none!important;margin:0!important}.receipt-page{padding:0!important;background:#fff!important}}`}</style>
    <div className="receipt-actions mx-auto mb-5 flex max-w-3xl items-center justify-between">
      <Link to={`/orders/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> Back to order</Link>
      <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"><Printer size={16} /> Print / Save PDF</button>
    </div>
    <article className="receipt-page receipt-paper mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-6">
        <div><div className="flex items-center gap-2 text-emerald-800"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100"><Sprout size={20} /></span><span className="text-lg font-extrabold tracking-tight">Farm-E</span></div><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Order receipt</p><h1 className="mt-1 text-3xl font-bold text-slate-900">#{order.orderNumber}</h1></div>
        <div className="text-left sm:text-right"><p className="text-sm text-slate-500">Placed</p><p className="mt-1 font-semibold text-slate-900">{formatDate(order.createdAt)}</p><p className="mt-4 text-sm text-slate-500">Order status</p><p className="mt-1 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">{ORDER_STATUS_LABELS[order.status] || order.status}</p></div>
      </header>
      <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
        <div><h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Seller</h2><p className="mt-2 font-semibold text-slate-900">{order.farmer?.name || 'Farm-E farmer'}</p>{order.farmer?.phone && <p className="mt-1 text-sm text-slate-600">{order.farmer.phone}</p>}</div>
        <div><h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Buyer</h2><p className="mt-2 font-semibold text-slate-900">{order.buyer?.name || 'Farm-E buyer'}</p>{order.buyer?.phone && <p className="mt-1 text-sm text-slate-600">{order.buyer.phone}</p>}</div>
      </section>
      <section className="py-6">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Order summary</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1fr_auto] gap-4 bg-slate-50 p-4 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Produce</span><span>Amount</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-4 p-4"><div><p className="font-bold text-slate-900">{order.crop?.name || 'Produce'}{order.crop?.variety ? ` · ${order.crop.variety}` : ''}</p><p className="mt-1 text-sm text-slate-500">{formatQty(order.quantity?.actual ?? order.quantity?.expected, order.quantity?.unit)} × {formatINR(order.price?.perUnit)} / unit</p></div><p className="font-bold text-slate-900">{formatINR(total)}</p></div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-emerald-50/60 p-4"><span className="font-bold text-slate-800">{paid ? 'Total settled' : 'Order total'}</span><span className="text-xl font-extrabold text-emerald-800">{formatINR(total)}</span></div>
        </div>
      </section>
      <section className="grid gap-4 border-t border-slate-200 py-6 text-sm sm:grid-cols-2">
        <div><p className="text-slate-500">Payment record</p><p className={`mt-1 font-bold ${paid ? 'text-emerald-700' : 'text-amber-700'}`}>{paid ? (order.payment?.isSimulated ? 'Simulated · marked settled' : 'Settled') : order.payment?.status || 'Pending'}</p></div>
        <div><p className="text-slate-500">Scheduled delivery</p><p className="mt-1 font-semibold text-slate-800">{order.deliveryDate?.scheduled ? formatDate(order.deliveryDate.scheduled) : 'Not specified'}</p></div>
      </section>
      <footer className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">This receipt summarizes the Farm-E order record. Payment status is shown as recorded in the app; simulated payments do not transfer money. This document is not a tax invoice or independent proof of payment.</footer>
    </article>
  </main>;
};

export default OrderReceipt;
