import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listingsApi, ordersApi, conversationsApi } from '@/api/index';
import { useAuth } from '@/auth/useAuth';
import { cropThumbnail } from '@/utils/cropThumbnail';
import { ROLES } from '@/config/constants';
import { formatINR, formatDate, formatQty, daysFromNow, initials } from '@/utils/format';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft, MapPin, Calendar, Scale, Star, ShieldCheck,
  ShoppingCart, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import OpenStreetMapField from '@/components/maps/OpenStreetMapField';
import DutchClockDecayCard from '@/components/listings/DutchClockDecayCard';

const orderSchema = z.object({
  quantity: z.coerce.number().positive('Quantity must be > 0'),
  deliveryLocation: z.object({
    address: z.string().trim().min(5, 'Add a delivery address'),
    district: z.string().optional(),
    state: z.string().optional(),
  }),
});

const gradeColor = { A: 'green', B: 'amber', C: 'gray', Premium: 'blue', Organic: 'green' };

const ListingDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [orderModal, setOrderModal] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsApi.getOne(id),
    select: (r) => r.data.data,
  });

  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(orderSchema),
  });

  const qty = useWatch({ control, name: 'quantity' });

  const orderMutation = useMutation({
    mutationFn: (values) => ordersApi.create({
      listingId: id,
      quantity: values.quantity,
      deliveryLocation: {
        ...values.deliveryLocation,
        ...(deliveryCoordinates ? { coordinates: { type: 'Point', coordinates: deliveryCoordinates } } : {}),
      },
    }),
    onSuccess: (res) => {
      const orderId = res.data.data.order?._id;
      toast.success('Order placed! Check your orders page.');
      setOrderModal(false);
      navigate(`/orders/${orderId}`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to place order'),
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      const farmerId = listing?.farmer?._id || listing?.farmer;
      const res = await conversationsApi.create({
        participantId: farmerId,
        title: listing?.crop?.name ? `Inquiry: ${listing.crop.name}` : undefined,
      });
      return res.data?.data?.conversation;
    },
    onSuccess: async (conv) => {
      if (conv?._id) {
        // Chat may have a cached inbox that predates this conversation. Mark it
        // stale before navigation so the target is present when Chat selects it.
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

  const activateDecayMutation = useMutation({
    mutationFn: (decayData) => listingsApi.activateDecayFlash(id, decayData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listing', id] });
      toast.success('⚡ Dutch Clock Price Decay Flash Sale activated!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to activate price decay'),
  });

  const stopDecayMutation = useMutation({
    mutationFn: () => listingsApi.stopDecayFlash(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listing', id] });
      toast.success('Dutch Clock Price Decay stopped');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to stop price decay'),
  });

  if (isLoading) return <PageSpinner />;

  const listing = data?.listing;
  if (!listing) return <div className="page">Listing not found</div>;

  const days = daysFromNow(listing.harvestDate?.expected);
  const isFarmer = user?.role === ROLES.FARMER;
  const isBuyer = user?.role === ROLES.BUYER;
  const isAdmin = user?.role === ROLES.ADMIN;
  const farmerIdStr = (listing.farmer?._id || listing.farmer)?.toString();
  const userIdStr = (user?._id || user?.id)?.toString();
  const isOwner = isFarmer && farmerIdStr === userIdStr;
  const listingPhotos = listing.images?.length ? listing.images.slice(0, 5) : [cropThumbnail(listing.crop?.name)];
  const heroPhoto = listingPhotos.includes(selectedPhoto) ? selectedPhoto : listingPhotos[0];

  return (
    <div className="page animate-fade-in">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        <ArrowLeft size={16} /> Back to Marketplace
      </button>

      <div className="grid lg:grid-cols-5 gap-7">
        {/* Images */}
        <div className="lg:col-span-3 space-y-4">
          <div className="card overflow-hidden h-72 sm:h-96 bg-gradient-to-br from-primary-100 to-primary-50">
            <img src={heroPhoto} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = cropThumbnail(listing.crop?.name); }} alt={`${listing.crop?.name || 'Fresh produce'} harvest`} className="h-full w-full object-cover" />
          </div>
          {listingPhotos.length > 1 && <div className="grid grid-cols-5 gap-2" aria-label="Listing photo thumbnails">{listingPhotos.map((photo, index) => <button type="button" key={photo} onClick={() => setSelectedPhoto(photo)} aria-label={`Show listing photo ${index + 1}`} aria-pressed={heroPhoto === photo} className={`overflow-hidden rounded-xl border-2 transition ${heroPhoto === photo ? 'border-emerald-700 ring-2 ring-emerald-100' : 'border-transparent opacity-75 hover:opacity-100'}`}><img src={photo} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = cropThumbnail(listing.crop?.name); }} alt={`${listing.crop?.name} photo ${index + 1}`} className="h-16 w-full object-cover sm:h-20" loading="lazy" /></button>)}</div>}

          {/* Description */}
          {listing.description && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-gray-900 mb-2">About This Produce</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{listing.description}</p>
            </div>
          )}

          {/* Farm info */}
          <div className="card p-5">
            <h2 className="font-display font-semibold text-gray-900 mb-4">About the Farm</h2>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-lg font-bold text-primary-700">
                {initials(listing.farm?.farmName || listing.farmer?.name)}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{listing.farm?.farmName || 'Farm'}</p>
                <p className="text-sm text-gray-500">{listing.farmer?.name}</p>
              </div>
              {listing.farm?.isVerified && (
                <span className="ml-auto badge badge-green gap-1">
                  <ShieldCheck size={12} /> Verified
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {listing.farm?.avgRating > 0 && (
                <div>
                  <p className="text-xs text-gray-500">Rating</p>
                  <p className="font-semibold flex items-center gap-1 text-amber-600">
                    <Star size={14} fill="currentColor" />
                    {listing.farm.avgRating.toFixed(1)} ({listing.farm.totalReviews})
                  </p>
                </div>
              )}
              {listing.farm?.totalOrdersCompleted > 0 && (
                <div>
                  <p className="text-xs text-gray-500">Orders Completed</p>
                  <p className="font-semibold">{listing.farm.totalOrdersCompleted}</p>
                </div>
              )}
              {listing.location?.district && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="font-medium flex items-center gap-1">
                    <MapPin size={13} className="text-gray-400" />
                    {listing.location.district}, {listing.location.state}
                  </p>
                </div>
              )}
            </div>
          {(listing.farm?.location?.coordinates || listing.location?.coordinates) && (
            <OpenStreetMapField
              value={listing.farm?.location?.coordinates || listing.location?.coordinates}
              className="mt-4"
            />
          )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Dutch Clock Price Decay Flash Sale Card */}
          <DutchClockDecayCard
            listing={listing}
            isOwner={isOwner}
            onActivate={(params) => activateDecayMutation.mutate(params)}
            onDeactivate={() => stopDecayMutation.mutate()}
            isUpdating={activateDecayMutation.isPending || stopDecayMutation.isPending}
          />

          {/* Crop + price */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h1 className="font-display font-bold text-2xl text-gray-900">
                  {listing.crop.name}
                </h1>
                {listing.crop.variety && (
                  <p className="text-gray-500 text-sm">{listing.crop.variety}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{listing.crop.category}</p>
              </div>
              <Badge variant={gradeColor[listing.quality?.grade] || 'gray'}>
                {listing.quality?.grade} Grade
              </Badge>
            </div>
            {listing.quality?.certifications?.length > 0 && <p className="mb-4 text-xs text-emerald-800">Farmer-declared certification: {listing.quality.certifications.join(', ')}. Farm-E has not independently verified it.</p>}

            <div className="flex items-baseline gap-1 mb-4">
              <span className="font-display font-bold text-3xl text-primary-700">
                {formatINR(listing.pricePerUnit?.expected)}
              </span>
              <span className="text-gray-500 text-sm">/ {listing.quantity?.unit}</span>
            </div>

            {/* Key specs */}
            <div className="space-y-2.5 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Scale size={14} className="text-gray-400" /> Available
                </span>
                <span className="font-medium">{formatQty(listing.quantity?.available, listing.quantity?.unit)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Calendar size={14} className="text-gray-400" /> Harvest
                </span>
                <span className={`font-medium ${days !== null && days <= 7 ? 'text-primary-600' : ''}`}>
                  {days !== null
                    ? days > 0 ? `In ${days} days` : 'Ready now'
                    : formatDate(listing.harvestDate?.expected)}
                </span>
              </div>
              {listing.pricePerUnit?.minimum && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Min. Accept Price</span>
                  <span className="font-medium">{formatINR(listing.pricePerUnit.minimum)}</span>
                </div>
              )}
            </div>

            {/* Catch-weight note */}
            <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700 mb-4">
              <strong>Catch-weight pricing:</strong> Final amount calculated on actual delivered weight.
            </div>

            {/* Actions */}
            {isBuyer ? (
              <div className="space-y-2">
                <Button className="w-full" size="lg" onClick={() => setOrderModal(true)}>
                  <ShoppingCart size={18} /> Place Order
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => messageMutation.mutate()}
                  loading={messageMutation.isPending}
                >
                  <MessageSquare size={16} /> Message Farmer
                </Button>
              </div>
            ) : isOwner ? (
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => navigate('/farmer/listings')}
              >
                Manage Listings
              </Button>
            ) : isAdmin ? <p className="text-xs text-gray-500">Admin view · purchasing is available to buyer accounts.</p> : null}
          </div>
        </div>
      </div>

      {/* Order modal */}
      <Modal isOpen={orderModal} onClose={() => setOrderModal(false)} title="Place Order" size="sm">
        <form onSubmit={handleSubmit((data) => orderMutation.mutate(data))} className="p-6 space-y-4">
          <div className="p-3 bg-primary-50 rounded-xl text-sm">
            <p className="text-gray-600">Price: <strong className="text-primary-700">{formatINR(listing.pricePerUnit?.expected)}/{listing.quantity?.unit}</strong></p>
            <p className="text-gray-600 mt-0.5">Available: <strong>{formatQty(listing.quantity?.available, listing.quantity?.unit)}</strong></p>
          </div>
          <Input
            label={`Quantity (${listing.quantity?.unit}) *`}
            type="number"
            step="0.1"
            max={listing.quantity?.available}
            placeholder={`Max ${listing.quantity?.available}`}
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <Input
            label="Delivery address *"
            placeholder="Street, market or receiving point"
            error={errors.deliveryLocation?.address?.message}
            {...register('deliveryLocation.address')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="District" placeholder="e.g. Pune" {...register('deliveryLocation.district')} />
            <Input label="State" placeholder="e.g. Maharashtra" {...register('deliveryLocation.state')} />
          </div>
          <OpenStreetMapField
            value={deliveryCoordinates}
            onChange={setDeliveryCoordinates}
            onLocationResolved={(location) => {
              [['deliveryLocation.address', location.address], ['deliveryLocation.district', location.district], ['deliveryLocation.state', location.state]]
                .forEach(([field, value]) => { if (value) setValue(field, value, { shouldValidate: true }); });
            }}
            interactive
          />
          {qty && parseFloat(qty) > 0 && (
            <div className="p-3 bg-gray-50 rounded-xl text-sm">
              <p className="text-gray-500">Estimated Total</p>
              <p className="font-bold text-primary-700 text-lg">
                {formatINR(parseFloat(qty) * listing.pricePerUnit?.expected)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Final amount settled after weight verification</p>
            </div>
          )}
          <div className="flex gap-3">
            <Button type="submit" loading={orderMutation.isPending} className="flex-1">
              Confirm Order
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOrderModal(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ListingDetail;
