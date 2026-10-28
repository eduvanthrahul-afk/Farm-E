import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, disputesApi } from '@/api/index';
import { PageSpinner } from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import OrderEvidencePanel from '@/components/orders/OrderEvidencePanel';
import { formatDate, formatINR } from '@/utils/format';
import toast from 'react-hot-toast';
import { Search, Users, Package, AlertTriangle, ExternalLink, CheckCircle2, Send } from 'lucide-react';

const sectionForPath = (path) => path.endsWith('/users') ? 'users' : path.endsWith('/orders') ? 'orders' : 'disputes';
const tabs = [
  { id: 'users', label: 'Users', href: '/admin/users', icon: Users },
  { id: 'orders', label: 'Orders', href: '/admin/orders', icon: Package },
  { id: 'disputes', label: 'Disputes', href: '/admin/disputes', icon: AlertTriangle },
];

const DisputeReviewModal = ({ disputeId, onClose }) => {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const detailQuery = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => disputesApi.getOne(disputeId),
    enabled: Boolean(disputeId),
    select: (response) => response.data.data.dispute,
  });
  const dispute = detailQuery.data;
  const isClosed = ['RESOLVED', 'CLOSED'].includes(dispute?.status);

  const messageMutation = useMutation({
    mutationFn: () => disputesApi.addMessage(disputeId, message.trim()),
    onSuccess: () => {
      setMessage('');
      qc.invalidateQueries({ queryKey: ['dispute', disputeId] });
      toast.success('Reply added to the case');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not send your reply'),
  });
  const resolveMutation = useMutation({
    mutationFn: () => adminApi.resolveDispute(disputeId, { decision: decision.trim(), notes: notes.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      qc.invalidateQueries({ queryKey: ['dispute', disputeId] });
      setDecision('');
      setNotes('');
      toast.success('Dispute resolved');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not resolve dispute'),
  });

  return <Modal isOpen={Boolean(disputeId)} onClose={onClose} title="Dispute review" size="xl">
    {detailQuery.isLoading ? <div className="p-8"><PageSpinner /></div> : detailQuery.isError || !dispute ? <div className="p-6 text-center">
      <p className="text-sm text-gray-600">Could not load this dispute.</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={() => detailQuery.refetch()}>Try again</Button>
    </div> : <div className="space-y-5 p-5 sm:p-6">
      <section className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order #{dispute.order?.orderNumber || '—'} · {dispute.type?.replaceAll('_', ' ')}</p><h3 className="mt-1 text-lg font-semibold text-gray-900">{dispute.title}</h3></div>
          <Badge variant={isClosed ? 'green' : dispute.status === 'ESCALATED' ? 'red' : 'amber'}>{dispute.status?.replaceAll('_', ' ')}</Badge>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{dispute.description}</p>
        <p className="mt-3 text-xs text-gray-500">Raised by {dispute.raisedBy?.name || '—'} · Against {dispute.against?.name || '—'} · Opened {formatDate(dispute.createdAt)}</p>
        {dispute.resolution?.decision && <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950"><b>Decision:</b> {dispute.resolution.decision}{dispute.resolution.notes && <p className="mt-1 whitespace-pre-wrap text-emerald-900/80">{dispute.resolution.notes}</p>}</div>}
      </section>

      {dispute.order?._id && <OrderEvidencePanel orderId={dispute.order._id} evidence={dispute.order.evidence || []} />}

      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Case messages</h3><span className="text-xs text-gray-500">{dispute.messages?.length || 0} updates</span></div>
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl bg-gray-50 p-3" aria-live="polite">
          {(dispute.messages || []).map((entry) => <article key={entry._id} className="rounded-xl border border-gray-100 bg-white p-3">
            <p className="mb-1 text-xs text-gray-500">{entry.from?.name || 'Case participant'} · {formatDate(entry.createdAt)}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{entry.content}</p>
          </article>)}
          {!dispute.messages?.length && <p className="py-4 text-center text-sm text-gray-500">No messages yet.</p>}
        </div>
        {!isClosed && <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); messageMutation.mutate(); }}>
          <label className="sr-only" htmlFor="admin-dispute-reply">Reply to this case</label>
          <textarea id="admin-dispute-reply" className="form-input min-h-20 flex-1 resize-y" maxLength={3000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Send an update to both parties…" />
          <Button type="submit" loading={messageMutation.isPending} disabled={!message.trim() || messageMutation.isPending}><Send size={15} /> Send reply</Button>
        </form>}
      </section>

      {!isClosed && <form className="space-y-3 border-t border-gray-100 pt-4" onSubmit={(event) => { event.preventDefault(); resolveMutation.mutate(); }}>
        <h3 className="font-semibold text-gray-900">Resolution</h3>
        <Input label="Decision" required maxLength={500} value={decision} onChange={(event) => setDecision(event.target.value)} placeholder="State the decision shared with both parties" />
        <label className="block"><span className="form-label">Notes (optional)</span><textarea className="form-input min-h-20 resize-y" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="flex justify-end"><Button type="submit" loading={resolveMutation.isPending} disabled={!decision.trim() || resolveMutation.isPending}>Submit decision</Button></div>
      </form>}
    </div>}
  </Modal>;
};

const AdminManagement = () => {
  const location = useLocation();
  const section = sectionForPath(location.pathname);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [selectedDisputeId, setSelectedDisputeId] = useState(null);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', section, search, status, params.get('role')],
    queryFn: () => section === 'users'
      ? adminApi.getUsers({ search: search || undefined, role: params.get('role') || undefined, page: 1, limit: 50 })
      : section === 'orders'
        ? adminApi.getOrders({ status: status || undefined, page: 1, limit: 50 })
        : adminApi.getDisputes({ status: status || undefined, page: 1, limit: 50 }),
    select: (response) => response.data.data,
  });
  const rows = useMemo(() => query.data?.[section] || [], [query.data, section]);
  const userMutation = useMutation({
    mutationFn: ({ user, action }) => action === 'verify' ? adminApi.verifyUser(user._id) : adminApi.toggleUserStatus(user._id, !user.isActive),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('User updated'); },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not update user'),
  });

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    if (key === 'status') setStatus(value);
  };

  return <div className="page animate-fade-in">
    <div className="mb-6"><span className="page-kicker">PLATFORM CONTROL</span><h1 className="section-title mt-1">{section[0].toUpperCase() + section.slice(1)}</h1><p className="text-sm text-gray-500 mt-1">Review platform activity and manage records from one workspace.</p></div>
    <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Admin sections">
      {tabs.map(({ id, label, href, icon: Icon }) => <Link key={id} to={href} role="tab" aria-selected={id === section} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${id === section ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon size={16} />{label}</Link>)}
    </div>
    <div className="card p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      {section === 'users' ? <div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="form-input pl-9" value={search} onChange={(event) => { setSearch(event.target.value); updateFilter('search', event.target.value); }} placeholder="Search users by name" /></div> : <div className="text-sm font-semibold text-gray-700">{section === 'orders' ? 'Order activity' : 'Resolution queue'}</div>}
      {(section === 'orders' || section === 'disputes') && <select className="form-select sm:max-w-56" aria-label={`Filter ${section} by status`} value={status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{(section === 'orders' ? ['PENDING','CONFIRMED','HARVESTING','READY_FOR_DELIVERY','IN_TRANSIT','DELIVERED','WEIGHT_VERIFIED','PAYMENT_SETTLED','COMPLETED','CANCELLED','DISPUTED'] : ['OPEN','UNDER_REVIEW','AWAITING_RESPONSE','ESCALATED','RESOLVED','CLOSED']).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>}
      {section === 'users' && <select className="form-select sm:max-w-48" aria-label="Filter users by role" value={params.get('role') || ''} onChange={(event) => updateFilter('role', event.target.value)}><option value="">All roles</option><option value="FARMER">Farmers</option><option value="BUYER">Buyers</option><option value="ADMIN">Admins</option></select>}
    </div>
    {query.isLoading ? <PageSpinner /> : query.isError ? <div className="card p-8 text-center"><p className="font-semibold text-gray-800">Could not load {section}</p><p className="text-sm text-gray-500 mt-1">{query.error?.response?.data?.message || 'Refresh the page and try again.'}</p></div> : rows.length === 0 ? <div className="card p-10 text-center"><p className="font-semibold text-gray-800">No {section} found</p><p className="text-sm text-gray-500 mt-1">Try changing the filters.</p></div> : <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>{section === 'users' ? <><th className="px-5 py-3">User</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></> : section === 'orders' ? <><th className="px-5 py-3">Order</th><th className="px-5 py-3">Crop</th><th className="px-5 py-3">Buyer / Farmer</th><th className="px-5 py-3">Value</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Details</th></> : <><th className="px-5 py-3">Issue</th><th className="px-5 py-3">Order</th><th className="px-5 py-3">Raised by</th><th className="px-5 py-3">Opened</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></>}</tr></thead><tbody className="divide-y divide-gray-100">
      {rows.map((row) => section === 'users' ? <tr key={row._id}><td className="px-5 py-4"><p className="font-semibold text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{row.email}</p></td><td className="px-5 py-4">{row.role}</td><td className="px-5 py-4">{formatDate(row.createdAt)}</td><td className="px-5 py-4"><Badge variant={row.isActive ? 'green' : 'red'}>{row.isActive ? (row.isVerified ? 'Active · verified' : 'Active · unverified') : 'Suspended'}</Badge></td><td className="px-5 py-4"><div className="flex gap-2">{!row.isVerified && <Button size="sm" variant="secondary" loading={userMutation.isPending} onClick={() => userMutation.mutate({ user: row, action: 'verify' })}><CheckCircle2 size={14} /> Verify</Button>}<Button size="sm" variant="ghost" className={row.isActive ? 'text-red-600' : 'text-primary-700'} loading={userMutation.isPending} onClick={() => userMutation.mutate({ user: row, action: 'status' })}>{row.isActive ? 'Suspend' : 'Reactivate'}</Button></div></td></tr> : section === 'orders' ? <tr key={row._id}><td className="px-5 py-4 font-semibold">#{row.orderNumber}</td><td className="px-5 py-4">{row.crop?.name || '—'}</td><td className="px-5 py-4"><p>{row.buyer?.name || 'Buyer'}</p><p className="text-xs text-gray-500">{row.farmer?.name || 'Farmer'}</p></td><td className="px-5 py-4">{formatINR(row.price?.actualTotal ?? row.price?.expectedTotal)}</td><td className="px-5 py-4"><Badge>{row.status?.replaceAll('_', ' ')}</Badge></td><td className="px-5 py-4"><Link className="inline-flex items-center gap-1 text-primary-700 font-semibold" to={`/orders/${row._id}`}>Open <ExternalLink size={13} /></Link></td></tr> : <tr key={row._id}><td className="px-5 py-4"><p className="font-semibold text-gray-900">{row.title}</p><p className="text-xs text-gray-500">{row.type?.replaceAll('_', ' ')}</p></td><td className="px-5 py-4">{row.order?.orderNumber ? `#${row.order.orderNumber}` : '—'} · {row.order?.crop?.name || ''}</td><td className="px-5 py-4">{row.raisedBy?.name || '—'}</td><td className="px-5 py-4">{formatDate(row.createdAt)}</td><td className="px-5 py-4"><Badge variant={['RESOLVED','CLOSED'].includes(row.status) ? 'green' : 'amber'}>{row.status?.replaceAll('_', ' ')}</Badge></td><td className="px-5 py-4"><Button size="sm" variant="secondary" onClick={() => setSelectedDisputeId(row._id)}>{['RESOLVED','CLOSED'].includes(row.status) ? 'Review' : 'Manage case'}</Button></td></tr>)}
      </tbody></table></div><div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">Showing {rows.length} {section}</div></div>}
    <DisputeReviewModal disputeId={selectedDisputeId} onClose={() => setSelectedDisputeId(null)} />
  </div>;
};

export default AdminManagement;
