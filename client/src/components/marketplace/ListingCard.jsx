import { MapPin, Calendar, Scale, Star, ShieldCheck, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatDate, formatQty, daysFromNow } from '@/utils/format';
import Badge from '@/components/ui/Badge';
import { cropThumbnail } from '@/utils/cropThumbnail';

const gradeColor = { A: 'green', B: 'amber', C: 'gray', Premium: 'blue', Organic: 'green' };

const ListingCard = ({ listing, showMatchScore }) => {
  const days = daysFromNow(listing.harvestDate?.expected);

  return (
    <Link
      to={`/marketplace/${listing._id}`}
      className="card-hover block overflow-hidden group"
    >
      {/* Image */}
      <div className="relative h-44 bg-gradient-to-br from-primary-100 to-primary-50 overflow-hidden">
        <img
          src={listing.images?.[0] || cropThumbnail(listing.crop?.name)}
          onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = cropThumbnail(listing.crop?.name); }}
          alt={`${listing.crop?.name || 'Fresh produce'} harvest thumbnail`}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* Grade badge */}
        <div className="absolute top-3 left-3">
          <Badge variant={gradeColor[listing.quality?.grade] || 'gray'}>
            {listing.quality?.grade} Grade
          </Badge>
        </div>
        {/* Match score */}
        {showMatchScore && (
          <div className="absolute top-3 right-3">
            <div className={`match-${showMatchScore.grade?.toLowerCase() || 'fair'}`}>
              {showMatchScore.score}%
            </div>
          </div>
        )}
        {/* Verified badge */}
        {listing.farm?.isVerified && (
          <div className="absolute bottom-3 right-3">
            <span className="badge badge-green gap-1">
              <ShieldCheck size={11} /> Verified
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-display font-semibold text-gray-900 leading-tight">
              {listing.crop.name}
              {listing.crop.variety && (
                <span className="text-gray-500 font-normal text-sm"> · {listing.crop.variety}</span>
              )}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{listing.crop.category}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-primary-700 text-base leading-tight">
              {formatINR(listing.pricePerUnit?.expected)}
            </p>
            <p className="text-xs text-gray-500">per {listing.quantity?.unit}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            <Scale size={12} />
            {formatQty(listing.quantity?.available, listing.quantity?.unit)} avail.
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {days !== null
              ? days > 0
                ? `Harvest in ${days}d`
                : 'Ready to harvest'
              : formatDate(listing.harvestDate?.expected)}
          </span>
          {listing.location?.district && (
            <span className="flex items-center gap-1">
              <MapPin size={12} />
              {listing.location.district}
            </span>
          )}
        </div>
        {listing.quality?.certifications?.length > 0 && <p className="mb-2 text-xs font-medium text-emerald-800">Farmer-declared: {listing.quality.certifications.join(', ')} · not independently verified</p>}

        {/* Farm info */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-700">
              {listing.farmer?.name?.[0] || 'F'}
            </div>
            <span className="text-xs text-gray-600 font-medium truncate max-w-[120px]">
              {listing.farm?.farmName || listing.farmer?.name}
            </span>
          </div>
          {listing.farm?.avgRating > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
              <Star size={11} fill="currentColor" />
              {listing.farm.avgRating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="market-card-cta"><span>View harvest</span><ArrowRight size={15} /></div>
      </div>
    </Link>
  );
};

export default ListingCard;
