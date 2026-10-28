import { Calendar, MapPin, Users, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatDate, formatQty, daysFromNow } from '@/utils/format';
import Badge from '@/components/ui/Badge';

const statusColor = {
  OPEN: 'green',
  RECEIVING_BIDS: 'amber',
  NEGOTIATING: 'blue',
  FULFILLED: 'gray',
  EXPIRED: 'gray',
  CANCELLED: 'red',
};

const RequirementCard = ({ requirement, linkBase = '/requirements' }) => {
  const expiresIn = daysFromNow(requirement.expiresAt);
  const isUrgent = expiresIn !== null && expiresIn <= 3;

  return (
    <Link
      to={`${linkBase}/${requirement._id}`}
      className="card-hover block p-5 group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
            {requirement.crop.name}
            {requirement.crop.variety && (
              <span className="text-gray-500 font-normal text-sm"> · {requirement.crop.variety}</span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{requirement.crop.category}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={statusColor[requirement.status] || 'gray'}>
            {requirement.status.replace('_', ' ')}
          </Badge>
          {isUrgent && expiresIn > 0 && (
            <span className="text-xs text-red-600 font-medium">Expires in {expiresIn}d</span>
          )}
        </div>
      </div>

      {/* Quantity + Price */}
      <div className="grid grid-cols-2 gap-3 mb-3 p-3 bg-gray-50 rounded-xl">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Required</p>
          <p className="font-semibold text-gray-900 text-sm">
            {formatQty(requirement.quantity?.required, requirement.quantity?.unit)}
          </p>
          <p className="text-xs text-gray-400">{requirement.quantity?.flexibility}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Budget (max)</p>
          <p className="font-semibold text-primary-700 text-sm">
            {formatINR(requirement.priceTarget?.max)}
            <span className="text-gray-400 font-normal">/{requirement.quantity?.unit}</span>
          </p>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          Deliver by {formatDate(requirement.deliveryDate?.required)}
        </span>
        {requirement.deliveryLocation?.district && (
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {requirement.deliveryLocation.district}
          </span>
        )}
        {requirement.bidsCount > 0 && (
          <span className="flex items-center gap-1 text-primary-600 font-medium">
            <Users size={12} />
            {requirement.bidsCount} bid{requirement.bidsCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {(requirement.quality?.grade || requirement.quality?.certifications?.length > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">Quality: </span>
          <span className="text-xs font-medium text-gray-700">{[requirement.quality?.grade ? `${requirement.quality.grade} Grade` : null, ...(requirement.quality?.certifications || [])].filter(Boolean).join(' · ')}</span>
        </div>
      )}
      <div className="market-card-cta"><span>Review request</span><ArrowRight size={15} /></div>
    </Link>
  );
};

export default RequirementCard;
