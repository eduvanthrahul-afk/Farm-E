import { CheckCircle, Circle, Truck, Package, Scale, CreditCard, XCircle, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/utils/format';
import { ORDER_STATUS_LABELS } from '@/config/constants';

const statusIcons = {
  PENDING: Circle,
  CONFIRMED: CheckCircle,
  HARVESTING: Package,
  READY_FOR_DELIVERY: Package,
  IN_TRANSIT: Truck,
  DELIVERED: CheckCircle,
  WEIGHT_VERIFIED: Scale,
  PAYMENT_SETTLED: CreditCard,
  COMPLETED: CheckCircle,
  CANCELLED: XCircle,
  DISPUTED: AlertTriangle,
};

const statusIconColor = {
  PENDING: 'text-gray-400',
  CONFIRMED: 'text-blue-500',
  HARVESTING: 'text-amber-500',
  READY_FOR_DELIVERY: 'text-amber-500',
  IN_TRANSIT: 'text-blue-500',
  DELIVERED: 'text-primary-500',
  WEIGHT_VERIFIED: 'text-primary-500',
  PAYMENT_SETTLED: 'text-primary-600',
  COMPLETED: 'text-primary-700',
  CANCELLED: 'text-red-500',
  DISPUTED: 'text-red-500',
};

const OrderTimeline = ({ statusHistory = [], currentStatus }) => {
  const entries = statusHistory.length
    ? statusHistory
    : currentStatus ? [{ status: currentStatus, note: 'Current status' }] : [];
  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        const Icon = statusIcons[entry.status] || Circle;
        const isLast = i === statusHistory.length - 1;
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <Icon size={18} className={statusIconColor[entry.status] || 'text-gray-400'} />
              {!isLast && <div className="w-px h-6 bg-gray-200 mt-1" />}
            </div>
            <div className="pb-1">
              <p className="text-sm font-medium text-gray-800">
                {ORDER_STATUS_LABELS[entry.status] || entry.status}
              </p>
              {entry.note && <p className="text-xs text-gray-500">{entry.note}</p>}
              {entry.changedAt && <p className="text-xs text-gray-400">{formatDate(entry.changedAt, { hour: '2-digit', minute: '2-digit' })}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OrderTimeline;
