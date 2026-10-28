import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Search, XCircle, ArrowUpRight, CalendarDays, Truck, UserRound, WalletCards } from 'lucide-react';
import { ordersApi } from '@/api/index';
import { formatINR, formatDate, formatQty } from '@/utils/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLOR } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

const Orders = ({ role }) => {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'mine', role, statusFilter, searchTerm, page],
    queryFn: () => ordersApi.getMine({ status: statusFilter || undefined, search: searchTerm || undefined, limit: 20, page }),
    select: (r) => ({ ...r.data.data, pagination: r.data.pagination }),
  });

  const orders = data?.orders || [];
  const pagination = data?.pagination;
  const cancelMutation = useMutation({
    mutationFn: (id) => ordersApi.updateStatus(id, 'CANCELLED', 'Cancelled by a participant from order management.'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'mine'] });
      toast.success('Order cancelled');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not cancel this order'),
  });
  const visibleOrders = orders;
  const openOnPage = orders.filter((order) => !['COMPLETED', 'CANCELLED', 'DISPUTED', 'PAYMENT_SETTLED'].includes(order.status)).length;
  const pageValue = orders.reduce((total, order) => total + Number(order.price?.actualTotal || order.price?.expectedTotal || 0), 0);
  const progressSteps = [
    { label: 'Confirmed' }, { label: 'Harvest' }, { label: 'Pickup' }, { label: 'Transit' }, { label: 'Complete' },
  ];

  if (isLoading) return <PageSpinner />;

  return (
    <div className={`page animate-fade-in orders-ledger-page orders-ledger-${role?.toLowerCase()}`}>
      <header className="orders-ledger-masthead">
        <div><span className="orders-ledger-kicker"><Package size={14} /> TRADE DESK <i>/</i> ORDER BOOK</span><h1>Orders &amp; delivery</h1><p>Know what’s moving, what needs attention, and what has landed.</p></div>
        <div className="orders-ledger-total"><strong>{pagination?.total ?? orders.length}</strong><span>orders<br />in this view</span></div>
      </header>

      <section className="orders-overview" aria-label="Current order overview">
        <div><span className="orders-overview-icon"><Package size={17} /></span><span><small>RESULTS</small><b>{pagination?.total ?? orders.length}</b><em>{statusFilter ? ORDER_STATUS_LABELS[statusFilter] || statusFilter : 'All statuses'}</em></span></div>
        <div><span className="orders-overview-icon moving"><Truck size={17} /></span><span><small>IN PROGRESS · THIS PAGE</small><b>{openOnPage}</b><em>Orders still moving</em></span></div>
        <div><span className="orders-overview-icon value"><WalletCards size={17} /></span><span><small>PAGE VALUE</small><b>{formatINR(pageValue, 0)}</b><em>Expected or settled total</em></span></div>
      </section>

      <section className="orders-toolbar" aria-label="Search and filter orders">
        <label className="orders-search-wrap"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search crop, order ID or person" aria-label="Search orders" />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><XCircle size={15} /></button>}</label>
        <p>Page {pagination?.page || page} of {pagination?.pages || 1} <span>·</span> {pagination?.total || orders.length} matching orders</p>
      </section>

      <div className="orders-status-filters" aria-label="Filter orders by status">
        {['', ...Object.keys(ORDER_STATUS_LABELS)].map((status) => <button key={status || 'all'} onClick={() => { setStatusFilter(status); setPage(1); }} aria-pressed={statusFilter === status} className={`orders-status-filter ${statusFilter === status ? 'is-active' : ''}`}>{status ? ORDER_STATUS_LABELS[status] || status.replaceAll('_', ' ') : 'All orders'}</button>)}
      </div>

      {visibleOrders.length === 0 ? (
        <div className="orders-empty-card"><EmptyState icon={Package} title="No orders found" description="Try a different search or status filter." /></div>
      ) : (
        <div className="orders-ledger-list">
          {visibleOrders.map((order) => {
            const cancellable = ['PENDING', 'CONFIRMED', 'HARVESTING'].includes(order.status);
            const stepIndex = ({ PENDING: -1, CONFIRMED: 0, HARVESTING: 1, READY_FOR_DELIVERY: 2, IN_TRANSIT: 3, DELIVERED: 4, WEIGHT_VERIFIED: 4, PAYMENT_SETTLED: 4, COMPLETED: 4 })[order.status] ?? -1;
            const showProgress = !['CANCELLED', 'DISPUTED'].includes(order.status);
            const counterparty = role === 'FARMER' ? order.buyer?.name : order.farmer?.farmName || order.farmer?.name;
            const deliveryPlace = [order.deliveryLocation?.district, order.deliveryLocation?.state].filter(Boolean).join(', ');
            return <article key={order._id} className="orders-ledger-card">
              <div className="orders-ledger-card-top">
                <div className="orders-crop-mark"><Package size={18} /></div>
                <div className="orders-crop-title"><h2>{order.crop?.name || 'Produce order'}</h2><p>Order <b>#{order.orderNumber}</b><span>·</span> Placed {formatDate(order.createdAt)}</p></div>
                <Badge variant={ORDER_STATUS_COLOR[order.status]?.replace('badge-', '') || 'gray'}>{ORDER_STATUS_LABELS[order.status] || order.status.replaceAll('_', ' ')}</Badge>
              </div>

              <div className="orders-ledger-facts">
                <div><small>ORDER VALUE</small><strong>{formatINR(order.price?.actualTotal || order.price?.expectedTotal)}</strong></div>
                <div><small>QUANTITY</small><strong>{formatQty(order.quantity?.expected, order.quantity?.unit)}</strong></div>
                <div><small>{role === 'FARMER' ? 'BUYER' : 'FARM'}</small><strong><UserRound size={13} /> {counterparty || 'Trade partner'}</strong></div>
                <div><small>DELIVERY {deliveryPlace && 'TO'}</small><strong><CalendarDays size={13} /> {deliveryPlace || (order.deliveryDate?.scheduled ? formatDate(order.deliveryDate.scheduled) : 'Date to be confirmed')}</strong>{order.deliveryDate?.actual ? <em className="text-emerald-700">Delivered {formatDate(order.deliveryDate.actual)}</em> : order.deliveryDate?.scheduled && <em>Scheduled {formatDate(order.deliveryDate.scheduled)}</em>}</div>
              </div>

              {showProgress && <div className="orders-fulfillment-progress" aria-label={`Fulfillment progress: ${ORDER_STATUS_LABELS[order.status]}`}>
                <div className="orders-progress-label"><span>FULFILLMENT</span><b>{ORDER_STATUS_LABELS[order.status]}</b></div>
                <div className="orders-progress-steps">{progressSteps.map((step, index) => <div key={step.label} className={`orders-progress-step ${stepIndex >= index ? 'is-done' : ''} ${stepIndex === index ? 'is-current' : ''}`}><span /><small>{step.label}</small></div>)}</div>
              </div>}

              <div className="orders-ledger-card-footer">
                <Link to={`/orders/${order._id}`} className="orders-open-link">Open order details <ArrowUpRight size={14} /></Link>
                {cancellable && <button type="button" disabled={cancelMutation.isPending} onClick={() => { if (window.confirm(`Cancel order #${order.orderNumber}? This cannot be undone.`)) cancelMutation.mutate(order._id); }} className="orders-cancel-link">Cancel order</button>}
              </div>
            </article>;
          })}
        </div>
      )}

      {pagination?.pages > 1 && <nav className="mt-5 flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-3" aria-label="Order history pages">
        <button type="button" disabled={!pagination.hasPrev} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <span className="text-xs text-gray-500">Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
        <button type="button" disabled={!pagination.hasNext} onClick={() => setPage((current) => current + 1)} className="rounded-lg px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </nav>}
    </div>
  );
};

export default Orders;
