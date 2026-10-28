import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, conversationsApi, disputesApi } from '@/api/index';
import { formatINR, formatDate, formatQty } from '@/utils/format';
import { appUrl } from '@/utils/appUrl';
import { ORDER_STATUS, ORDER_STATUS_LABELS } from '@/config/constants';
import { useAuth } from '@/auth/useAuth';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import OrderTimeline from '@/components/orders/OrderTimeline';
import CatchWeightSummary from '@/components/orders/CatchWeightSummary';
import OrderEvidencePanel from '@/components/orders/OrderEvidencePanel';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Package, User, Phone, MapPin, Scale, ArrowLeft, MessageSquare, QrCode, ExternalLink, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import OpenStreetMapField from '@/components/maps/OpenStreetMapField';
import { QRCodeSVG } from 'qrcode.react';

const ORDER_STATUS_COLOR = {
  PENDING: 'gray', CONFIRMED: 'blue', HARVESTING: 'amber',
  READY_FOR_DELIVERY: 'amber', IN_TRANSIT: 'blue', DELIVERED: 'green',
  WEIGHT_VERIFIED: 'green', PAYMENT_SETTLED: 'green', COMPLETED: 'green',
  CANCELLED: 'red', DISPUTED: 'red',
};

// Allowed next status transitions per role
const FARMER_TRANSITIONS = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'HARVESTING',
  HARVESTING: 'READY_FOR_DELIVERY',
  READY_FOR_DELIVERY: 'IN_TRANSIT',
  IN_TRANSIT: 'DELIVERED',
  PAYMENT_SETTLED: 'COMPLETED',
};
const BUYER_TRANSITIONS = {
  IN_TRANSIT: 'DELIVERED',
  WEIGHT_VERIFIED: 'PAYMENT_SETTLED',
  PAYMENT_SETTLED: 'COMPLETED',
};

const hasCoordinates = (location) => {
  const coordinates = location?.coordinates?.coordinates;
  return Array.isArray(coordinates) && coordinates.length === 2 && coordinates.some((value) => Number(value) !== 0);
};

const OrderDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [weightModal, setWeightModal] = useState(false);
  const [actualQty, setActualQty] = useState('');
  const [qrModal, setQrModal] = useState(false);
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeType, setDisputeType] = useState('QUALITY_MISMATCH');
  const [disputeTitle, setDisputeTitle] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOne(id),
    select: (r) => r.data.data,
  });
  const routeQuery = useQuery({
    queryKey: ['order', id, 'route'],
    queryFn: () => ordersApi.getRoute(id),
    select: (r) => r.data.data.route,
    enabled: Boolean(data?.order && hasCoordinates(data.order.farmLocation) && hasCoordinates(data.order.deliveryLocation)),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, note }) => ordersApi.updateStatus(id, status, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'mine'] });
      toast.success('Order status updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.updateStatus(id, ORDER_STATUS.CANCELLED, 'Cancelled by a participant from the order details.'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'mine'] });
      toast.success('Order cancelled');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not cancel this order'),
  });

  const weightMutation = useMutation({
    mutationFn: (qty) => ordersApi.verifyWeight(id, qty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      setWeightModal(false);
      toast.success('Weight verified — final amount calculated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to verify weight'),
  });

  const disputeMutation = useMutation({
    mutationFn: () => disputesApi.create({ orderId: id, type: disputeType, title: disputeTitle.trim(), description: disputeDescription.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['disputes', 'mine'] });
      setDisputeModal(false);
      toast.success('Dispute submitted. The order is now under review.');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not submit dispute'),
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      const ord = data?.order;
      const isF = ord?.farmer?._id === user._id || ord?.farmer === user._id;
      const cp = isF ? ord?.buyer : ord?.farmer;
      const targetId = cp?._id || cp;
      const res = await conversationsApi.create({
        participantId: targetId,
        orderId: ord?._id,
        title: `Order #${ord?.orderNumber} - ${ord?.crop?.name}`,
      });
      return res.data?.data?.conversation;
    },
    onSuccess: async (conv) => {
      if (conv?._id) {
        await qc.invalidateQueries({ queryKey: ['conversations'] });
        navigate(`/chat?convId=${conv._id}`);
      } else {
        toast.error('Conversation was created, but its details could not be loaded. Open Messages and try again.');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to start conversation');
    },
  });

  if (isLoading) return <PageSpinner />;

  const order = data?.order;
  if (!order) return <div className="page">Order not found</div>;

  const isFarmer = order.farmer?._id === user._id || order.farmer === user._id;
  const isBuyer = order.buyer?._id === user._id || order.buyer === user._id;
  const isParticipant = isFarmer || isBuyer;

  const transitions = isFarmer ? FARMER_TRANSITIONS : BUYER_TRANSITIONS;
  const nextStatus = transitions[order.status];
  const canCancel = ['PENDING', 'CONFIRMED', 'HARVESTING'].includes(order.status);

  const counterpart = isFarmer ? order.buyer : isBuyer ? order.farmer : null;

  return (
    <div className="page animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="section-title">Order #{order.orderNumber}</h1>
            <Badge variant={ORDER_STATUS_COLOR[order.status]?.replace('badge-', '') || 'gray'}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Placed {formatDate(order.createdAt)}</p>
          {order.deliveryDate?.scheduled && <p className="mt-1 text-xs font-medium text-emerald-700">Scheduled delivery {formatDate(order.deliveryDate.scheduled)}</p>}
          {order.deliveryDate?.actual && <p className="mt-1 text-xs font-semibold text-emerald-700">Delivery confirmed {formatDate(order.deliveryDate.actual)}</p>}
        </div>
        <Link to={`/orders/${id}/receipt`} target="_blank" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Printer size={15} /> Receipt</Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Crop info */}
          <div className="card p-5">
            <h2 className="font-display font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package size={18} className="text-primary-600" /> Crop Details
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-gray-500">Crop</p><p className="font-semibold">{order.crop?.name}</p></div>
              <div><p className="text-xs text-gray-500">Grade</p><p className="font-semibold">{order.crop?.grade || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Qty</p><p className="font-semibold">{formatQty(order.quantity?.expected, order.quantity?.unit)}</p></div>
              <div><p className="text-xs text-gray-500">Price/unit</p><p className="font-semibold text-primary-700">{formatINR(order.price?.perUnit)}</p></div>
            </div>
          </div>

          {/* Catch-weight summary */}
          <CatchWeightSummary order={order} />

          <OrderEvidencePanel orderId={id} evidence={order.evidence || []} allowUpload={isParticipant} />

          {(hasCoordinates(order.farmLocation) || hasCoordinates(order.deliveryLocation)) && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-gray-900 mb-3 flex items-center gap-2"><MapPin size={17} className="text-primary-600" /> Delivery route</h2>
              <OpenStreetMapField locations={[
                { position: order.farmLocation?.coordinates, label: 'Farm pickup' },
                { position: order.deliveryLocation?.coordinates, label: 'Buyer delivery' },
              ]} routeGeometry={routeQuery.data?.geometry} routeSummary={routeQuery.data} routeState={routeQuery.isFetching ? 'loading' : routeQuery.isError || !routeQuery.data ? 'unavailable' : 'ready'} />
              <p className="text-xs text-gray-500 mt-3">Route details are shown only to order participants. Travel time is an estimate and does not include live traffic.</p>
            </div>
          )}

          {/* Actions */}
          {isParticipant && (nextStatus || order.status === ORDER_STATUS.IN_TRANSIT || canCancel || [ORDER_STATUS.DELIVERED, ORDER_STATUS.WEIGHT_VERIFIED].includes(order.status)) && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="flex flex-wrap gap-3">
                {nextStatus && nextStatus !== ORDER_STATUS.WEIGHT_VERIFIED && (
                  <Button
                    onClick={() => statusMutation.mutate({ status: nextStatus })}
                    loading={statusMutation.isPending}
                  >
                    {nextStatus === ORDER_STATUS.PAYMENT_SETTLED ? 'Record simulated payment' : nextStatus === ORDER_STATUS.COMPLETED ? 'Mark order complete' : nextStatus === ORDER_STATUS.DELIVERED && isFarmer ? 'Mark as delivered' : nextStatus === ORDER_STATUS.DELIVERED ? 'Confirm delivery' : `Mark as ${ORDER_STATUS_LABELS[nextStatus]}`}
                  </Button>
                )}
                {canCancel && <Button variant="ghost" className="text-red-600 hover:text-red-700" loading={cancelMutation.isPending} onClick={() => {
                  if (window.confirm(`Cancel order #${order.orderNumber}? This cannot be undone.`)) cancelMutation.mutate();
                }}>Cancel order</Button>}
                {/* Weight verification — special flow */}
                {isBuyer && order.status === ORDER_STATUS.DELIVERED && (
                  <Button onClick={() => setWeightModal(true)}>
                    <Scale size={16} /> Verify Weight
                  </Button>
                )}
                {/* Message counterpart */}
                <Button
                  variant="secondary"
                  onClick={() => messageMutation.mutate()}
                  loading={messageMutation.isPending}
                >
                  <MessageSquare size={16} /> Message {isFarmer ? 'Buyer' : 'Farmer'}
                </Button>
                {/* Raise dispute */}
                {[ORDER_STATUS.DELIVERED, ORDER_STATUS.WEIGHT_VERIFIED].includes(order.status) && !order.dispute && (
                  <Button
                    variant="ghost"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => setDisputeModal(true)}
                  >
                    Raise Dispute
                  </Button>
                )}
              </div>
              {order.status === ORDER_STATUS.WEIGHT_VERIFIED && isBuyer && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  Demo workflow: recording payment updates the Farm-E order record only. No money is transferred.
                </p>
              )}
              {order.status === ORDER_STATUS.IN_TRANSIT && isBuyer && (
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                  When the produce arrives, choose “Confirm delivery”. Farm-E records your confirmation; it does not track a courier live.
                </p>
              )}
              {order.status === ORDER_STATUS.IN_TRANSIT && isFarmer && (
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                  After the delivery handoff, mark this order delivered. The buyer can then verify the weight and record the demo payment.
                </p>
              )}
              {order.status === ORDER_STATUS.DELIVERED && isFarmer && (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  The buyer needs to verify the delivered weight and record the demo payment. After that, either of you can mark the order complete.
                </p>
              )}
              {order.status === ORDER_STATUS.WEIGHT_VERIFIED && isFarmer && (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  Weight is verified. The buyer needs to record the demo payment; then either of you can mark the order complete.
                </p>
              )}
              {order.status === ORDER_STATUS.PAYMENT_SETTLED && (
                <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
                  Payment is recorded in the demo. Either order participant can now mark the order complete.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Counterpart info */}
          {counterpart && <div className="card p-5">
            <h2 className="font-display font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <User size={16} className="text-gray-500" />
              {isFarmer ? 'Buyer' : 'Farmer'}
            </h2>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-gray-900">{counterpart?.name}</p>
              {counterpart?.phone && (
                <p className="flex items-center gap-1.5 text-gray-600">
                  <Phone size={13} /> {counterpart.phone}
                </p>
              )}
            </div>
          </div>}

          {/* Batch & Farm-to-Fork Traceability Card */}
          <div className="card p-5 border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-gray-900 flex items-center gap-2">
                <QrCode size={17} className="text-emerald-600" />
                Batch Traceability
              </h2>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Farm-to-Fork
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Scan to check the Farm-E signature and view this batch’s issued snapshot.
            </p>
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-emerald-100/80 shadow-sm mb-4">
              <div className="p-2 bg-white rounded-xl shadow-inner">
                <QRCodeSVG
                  value={appUrl(`/trace/${encodeURIComponent(order.traceability?.batchNumber || `BATCH-${order.orderNumber}`)}`)}
                  size={220}
                  level="M"
                  includeMargin={true}
                />
              </div>
              <p className="font-mono text-xs font-semibold text-emerald-800 mt-2">
                {order.traceability?.batchNumber || `BATCH-${order.orderNumber}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-xs flex items-center justify-center gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setQrModal(true)}
              >
                <QrCode size={14} /> View Passport
              </Button>
              <a
                href={`/trace/${encodeURIComponent(order.traceability?.batchNumber || `BATCH-${order.orderNumber}`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm text-xs p-2 text-emerald-700 hover:bg-emerald-50"
                title="Open Consumer Trace Page"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="font-display font-semibold text-gray-900 mb-4">Timeline</h2>
            <OrderTimeline statusHistory={order.statusHistory || []} currentStatus={order.status} />
          </div>
        </div>
      </div>

      {/* Weight verify modal */}
      <Modal isOpen={weightModal} onClose={() => setWeightModal(false)} title="Verify Actual Weight" size="sm">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Enter the actual weight delivered. The final amount will be auto-calculated as:
            <span className="font-semibold text-gray-900"> actual qty × {formatINR(order.price?.perUnit)}/unit</span>
          </p>
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1">Expected: {formatQty(order.quantity?.expected, order.quantity?.unit)}</p>
          </div>
          <Input
            label={`Actual Quantity (${order.quantity?.unit})`}
            type="number"
            step="0.01"
            value={actualQty}
            onChange={(e) => setActualQty(e.target.value)}
            placeholder="e.g. 487.5"
          />
          {actualQty && (
            <div className="mt-3 p-3 bg-primary-50 rounded-xl text-sm">
              <p className="text-gray-600">Final amount:</p>
              <p className="font-bold text-primary-700 text-lg">
                {formatINR(parseFloat(actualQty) * (order.price?.perUnit || 0))}
              </p>
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <Button
              onClick={() => weightMutation.mutate(parseFloat(actualQty))}
              loading={weightMutation.isPending}
              disabled={!actualQty || parseFloat(actualQty) <= 0}
            >
              Confirm Weight
            </Button>
            <Button variant="secondary" onClick={() => setWeightModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={disputeModal} onClose={() => setDisputeModal(false)} title="Raise an order dispute" size="md">
        <form className="p-6 space-y-4" onSubmit={(event) => { event.preventDefault(); disputeMutation.mutate(); }}>
          <p className="text-sm text-gray-600">Describe the issue clearly. Disputes are available after delivery and before payment is finalized.</p>
          <label className="block"><span className="form-label">Issue type</span>
            <select className="form-select" value={disputeType} onChange={(event) => setDisputeType(event.target.value)}>
              <option value="QUANTITY_MISMATCH">Quantity mismatch</option><option value="QUALITY_MISMATCH">Quality mismatch</option>
              <option value="PAYMENT">Payment</option><option value="DELIVERY">Delivery</option>
              <option value="CANCELLATION">Cancellation</option><option value="OTHER">Other</option>
            </select>
          </label>
          <Input label="Title" required maxLength={120} value={disputeTitle} onChange={(event) => setDisputeTitle(event.target.value)} placeholder="Short summary of the issue" />
          <label className="block"><span className="form-label">Details</span>
            <textarea className="form-input min-h-32 resize-y" required minLength={20} maxLength={5000} value={disputeDescription} onChange={(event) => setDisputeDescription(event.target.value)} placeholder="Include what happened and what resolution you are seeking." />
            <span className="text-xs text-gray-500">{disputeDescription.trim().length}/5000 characters (minimum 20)</span>
          </label>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setDisputeModal(false)}>Cancel</Button><Button type="submit" loading={disputeMutation.isPending} disabled={!disputeTitle.trim() || disputeDescription.trim().length < 20}>Submit dispute</Button></div>
        </form>
      </Modal>

      {/* QR Passport Print & Details Modal */}
      <Modal isOpen={qrModal} onClose={() => setQrModal(false)} title="Batch authenticity check" size="md">
        <div className="p-6 text-center">
          <div className="inline-block p-4 bg-white rounded-3xl border-2 border-dashed border-emerald-300 shadow-sm mb-4">
            <QRCodeSVG
              value={appUrl(`/trace/${encodeURIComponent(order.traceability?.batchNumber || `BATCH-${order.orderNumber}`)}`)}
              size={240}
              level="M"
              includeMargin={true}
            />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Batch #{order.traceability?.batchNumber || `BATCH-${order.orderNumber}`}
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Crop: <span className="font-semibold text-gray-800">{order.crop?.name}</span> ({order.crop?.variety || 'Standard'}) • {formatQty(order.quantity?.expected, order.quantity?.unit)}
          </p>

          <div className="bg-emerald-50/70 p-3.5 rounded-2xl text-left border border-emerald-100 mb-5 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Farm Origin:</span>
              <span className="font-semibold text-gray-800">{order.farmer?.name}'s Field</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Harvest Date:</span>
              <span className="font-semibold text-gray-800">{formatDate(order.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Farm-E Batch ID:</span>
              <span className="font-mono text-gray-600 truncate max-w-[180px]">{order.traceability?.batchNumber || `BATCH-${order.orderNumber}`}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              variant="primary"
              className="flex items-center gap-1.5"
              onClick={() => window.print()}
            >
              <Printer size={15} /> Print Crate Label
            </Button>
            <Button variant="secondary" onClick={() => setQrModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OrderDetail;
