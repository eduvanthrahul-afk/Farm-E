import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requirementsApi, bidsApi } from '@/api/index';
import { formatINR, formatDate, formatQty, daysFromNow, isFutureDate } from '@/utils/format';
import { useAuth } from '@/auth/useAuth';
import { ROLES } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  MapPin, Calendar, Scale, ShieldCheck, Star, ArrowLeft,
  Gavel, CheckCircle, XCircle, TrendingDown, Clock, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import OpenStreetMapField from '@/components/maps/OpenStreetMapField';
import LiveAuctionArena from '@/components/auctions/LiveAuctionArena';

const bidSchema = z.object({
  price: z.object({
    perUnit: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: 'Price is required' }).min(0, 'Price must be >= 0')
    ),
  }),
  quantity: z.object({
    offered: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z.number({ error: 'Quantity is required' }).positive('Quantity must be > 0')
    ),
    unit: z.string().min(1),
  }),
  harvestDate: z.string().min(1, 'Harvest date required'),
  notes: z.string().optional(),
});

const MatchScoreRing = ({ score }) => {
  const grade = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';
  return (
    <div className={`match-${grade}`} title={`Match score: ${score}%`}>
      {score}%
    </div>
  );
};

const RequirementDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bidModal, setBidModal] = useState(false);

  const isBuyer = user.role === ROLES.BUYER;
  const isFarmer = user.role === ROLES.FARMER;

  // Fetch requirement
  const { data: reqData, isLoading } = useQuery({
    queryKey: ['requirement', id],
    queryFn: () => requirementsApi.getOne(id),
    select: (r) => r.data.data,
  });

  const loadedRequirement = reqData?.requirement;
  const isOwner = isBuyer && (loadedRequirement?.buyer === user._id || loadedRequirement?.buyer?._id === user._id);
  const { data: matchesData, isLoading: matchesLoading, isError: matchesError } = useQuery({
    queryKey: ['requirement-matches', id],
    queryFn: () => requirementsApi.getMatches(id),
    select: (r) => r.data.data,
    enabled: isOwner,
  });

  // Fetch bids if buyer owns it
  const { data: bidsData } = useQuery({
    queryKey: ['requirement-bids', id],
    queryFn: () => requirementsApi.getBids(id),
    select: (r) => r.data.data,
    enabled: isBuyer,
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(bidSchema),
    defaultValues: { quantity: { unit: 'kg' } },
  });

  // Sync unit once requirement data loads
  useEffect(() => {
    if (reqData?.requirement?.quantity?.unit) {
      reset((prev) => ({ ...prev, quantity: { ...prev?.quantity, unit: reqData.requirement.quantity.unit } }));
    }
  }, [reqData, reset]);

  const submitBid = useMutation({
    mutationFn: (data) => bidsApi.submit({
      requirement: id,
      price: { perUnit: Number(data.price?.perUnit) },
      quantity: { offered: Number(data.quantity?.offered), unit: data.quantity?.unit },
      harvestDate: data.harvestDate,
      notes: data.notes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bids', 'mine'] });
      toast.success('Bid submitted successfully!');
      setBidModal(false);
      reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to submit bid'),
  });

  const acceptBid = useMutation({
    mutationFn: (bidId) => bidsApi.accept(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirement-bids', id] });
      toast.success('Bid accepted — order created!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to accept bid'),
  });

  const rejectBid = useMutation({
    mutationFn: (bidId) => bidsApi.reject(bidId, 'Not the best fit'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirement-bids', id] });
      toast.success('Bid rejected');
    },
  });

  if (isLoading) return <PageSpinner />;

  const req = reqData?.requirement;
  if (!req) return <div className="page">Requirement not found</div>;

  const bids = bidsData?.bids || [];
  const expiresIn = daysFromNow(req.expiresAt);
  const matches = matchesData?.matches || [];
  const canSubmitBid = isFarmer && ['OPEN', 'RECEIVING_BIDS'].includes(req.status) &&
    isFutureDate(req.expiresAt) &&
    (!req.isLiveAuction || isFutureDate(req.auctionEndsAt));

  const statusColor = { OPEN: 'green', RECEIVING_BIDS: 'amber', NEGOTIATING: 'blue', FULFILLED: 'gray', EXPIRED: 'gray' };

  return (
    <div className={`page animate-fade-in requirement-detail-page ${isFarmer ? 'requirement-detail-farmer' : 'requirement-detail-buyer'}`}>
      <header className="requirement-detail-hero">
        <button onClick={() => navigate(-1)} className="requirement-back-button" aria-label="Go back to requirements"><ArrowLeft size={17} /> <span>Back to requests</span></button>
        <div className="requirement-hero-content">
          <span className="requirement-detail-kicker"><span>{req.crop.category}</span><i>/</i>{isFarmer ? 'BUYER REQUEST' : 'YOUR REQUEST'}</span>
          <div className="requirement-title-line"><h1>{req.crop.name}{req.crop.variety && <span> · {req.crop.variety}</span>}</h1><Badge variant={statusColor[req.status] || 'gray'}>{req.status.replace('_', ' ')}</Badge></div>
          <p className="requirement-posted-line">{isFarmer ? `A buyer is sourcing ${req.crop.name.toLowerCase()} for an upcoming delivery.` : 'Manage the terms and review offers for this request.'}</p>
        </div>
        {canSubmitBid && !req.isLiveAuction && <Button className="requirement-submit-bid" onClick={() => setBidModal(true)} variant="amber"><Gavel size={16} /> Submit an offer</Button>}
        <div className="requirement-hero-orbit" aria-hidden="true" />
      </header>

      <section className="requirement-summary-strip" aria-label="Request summary">
        <div className="requirement-summary-item"><span className="requirement-summary-icon"><Scale size={17} /></span><span><small>QUANTITY NEEDED</small><strong>{formatQty(req.quantity?.required, req.quantity?.unit)}</strong>{req.quantity?.flexibility && <em>{req.quantity.flexibility} flexibility</em>}</span></div>
        <div className="requirement-summary-item"><span className="requirement-summary-icon budget"><TrendingDown size={17} /></span><span><small>BUYER'S MAXIMUM</small><strong>{formatINR(req.priceTarget?.max)}<em> / {req.quantity?.unit}</em></strong>{req.priceTarget?.preferred && <em>Preferred {formatINR(req.priceTarget.preferred)}</em>}</span></div>
        <div className={`requirement-summary-item ${expiresIn !== null && expiresIn <= 3 ? 'is-closing' : ''}`}><span className="requirement-summary-icon deadline"><Calendar size={17} /></span><span><small>DELIVERY BY</small><strong>{formatDate(req.deliveryDate?.required)}</strong><em>{expiresIn !== null ? expiresIn > 0 ? `${expiresIn} days left to bid` : 'Bidding closed' : `Closes ${formatDate(req.expiresAt)}`}</em></span></div>
      </section>

      {/* Dynamic Live Reverse Auction Arena */}
      {req.isLiveAuction === true && (
        <LiveAuctionArena requirement={req} />
      )}

      <div className="requirement-detail-layout">
        <main className="requirement-detail-main">
          <section className="card requirement-specification-card">
            <div className="requirement-section-heading"><div><span>THE BRIEF</span><h2>What the buyer needs</h2></div><span className="requirement-grade-mark"><ShieldCheck size={15} /> {req.quality?.grade || 'Any grade'}</span></div>
            <div className="requirement-detail-facts">
              <div><span className="requirement-fact-icon"><Calendar size={16} /></span><span><small>DELIVERY WINDOW</small><strong>{formatDate(req.deliveryDate?.required)}</strong><em>Target arrival date</em></span></div>
              <div><span className="requirement-fact-icon"><MapPin size={16} /></span><span><small>DELIVER TO</small><strong>{req.deliveryLocation?.district || req.deliveryLocation?.address || 'Location to be confirmed'}</strong><em>{[req.deliveryLocation?.address, req.deliveryLocation?.state].filter(Boolean).join(', ')}</em></span></div>
            </div>
            {req.description && <div className="requirement-special-notes"><span>BUYER NOTES</span><p>{req.description}</p></div>}
            {req.deliveryLocation?.coordinates && <div className="requirement-map"><OpenStreetMapField value={req.deliveryLocation.coordinates} /></div>}
          </section>

          {isOwner && (
            <section className="card p-5">
              <div className="requirement-section-heading mb-4">
                <div><span>FARM-E MATCHES</span><h2>Top listings that fit</h2></div>
                <Sparkles size={18} className="text-amber-500" aria-hidden="true" />
              </div>
              <p className="-mt-2 mb-4 text-xs text-gray-500">Ranked by crop, available quantity, budget, quality, harvest timing, and approximate distance. Each score includes the reasons behind it.</p>
              {matchesLoading ? <p className="py-5 text-center text-sm text-gray-500">Finding suitable listings…</p> : matchesError ? (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Could not load matches right now. You can still review farmer offers below.</p>
              ) : matches.length === 0 ? (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No suitable active listings yet. Farmers can still respond with a bid.</p>
              ) : (
                <div className="space-y-3">
                  {matches.slice(0, 5).map(({ listing, matchScore }) => {
                    const reasons = Object.entries(matchScore.breakdown || {}).sort((a, b) => b[1].weight - a[1].weight);
                    return (
                      <article key={listing._id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <MatchScoreRing score={matchScore.score} />
                            <div><h3 className="font-semibold text-gray-900">{listing.crop?.name}{listing.crop?.variety ? ` · ${listing.crop.variety}` : ''}</h3><p className="text-xs text-gray-500">{listing.farm?.farmName || listing.farmer?.name || 'Farm-E farmer'}</p></div>
                          </div>
                          <Link to={`/listings/${listing._id}`} className="text-xs font-semibold text-primary-700 hover:underline">View listing →</Link>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 text-xs sm:grid-cols-4">
                          <span><small className="block text-gray-500">PRICE</small><b>{formatINR(listing.pricePerUnit?.expected)}/{listing.quantity?.unit}</b></span>
                          <span><small className="block text-gray-500">AVAILABLE</small><b>{formatQty(listing.quantity?.available, listing.quantity?.unit)}</b></span>
                          <span><small className="block text-gray-500">HARVEST</small><b>{formatDate(listing.harvestDate?.expected)}</b></span>
                          <span><small className="block text-gray-500">FARM AREA</small><b>{[listing.location?.district, listing.location?.state].filter(Boolean).join(', ') || 'Not provided'}</b></span>
                        </div>
                        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Why this listing matched">
                          {reasons.map(([key, item]) => <li key={key} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800"><b className="capitalize">{key}:</b> {item.reason}</li>)}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Bids list — buyer only */}
          {isOwner && (
            <section className="card requirement-received-bids">
              <div className="requirement-section-heading"><div><span>FARMER RESPONSES</span><h2>Received offers <b>{bids.length}</b></h2></div></div>
              {bids.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No bids yet. Bids from farmers will appear here.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {bids.map((bid) => (
                    <div key={bid._id} className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          {bid.matchScore && <MatchScoreRing score={bid.matchScore.score} />}
                          <div>
                            <p className="font-semibold text-gray-900">
                              {bid.farm?.farmName || bid.farmer?.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                              {bid.farm?.isVerified && (
                                <span className="flex items-center gap-0.5 text-primary-600">
                                  <ShieldCheck size={11} /> Verified
                                </span>
                              )}
                              {bid.farm?.avgRating > 0 && (
                                <span className="flex items-center gap-0.5 text-amber-600">
                                  <Star size={11} fill="currentColor" /> {bid.farm.avgRating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant={bid.status === 'ACCEPTED' ? 'green' : bid.status === 'REJECTED' ? 'red' : 'gray'}
                        >
                          {bid.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-xl mb-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Bid Price</p>
                          <p className={clsx(
                            'font-bold',
                            bid.price?.perUnit <= req.priceTarget?.preferred ? 'text-primary-600' : 'text-gray-900'
                          )}>
                            {formatINR(bid.price?.perUnit)}/{bid.quantity?.unit}
                          </p>
                          {bid.price?.perUnit < req.priceTarget?.preferred && (
                            <p className="text-xs text-primary-600 flex items-center gap-0.5">
                              <TrendingDown size={10} /> Below target
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Quantity</p>
                          <p className="font-semibold">{formatQty(bid.quantity?.offered, bid.quantity?.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Harvest</p>
                          <p className="font-semibold">{formatDate(bid.harvestDate)}</p>
                        </div>
                      </div>
                      {bid.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => acceptBid.mutate(bid._id)}
                            loading={acceptBid.isPending}
                          >
                            <CheckCircle size={14} /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500"
                            onClick={() => rejectBid.mutate(bid._id)}
                            loading={rejectBid.isPending}
                          >
                            <XCircle size={14} /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        </main>

        <aside className="requirement-detail-rail">
          <section className="card requirement-buyer-card">
            <div className="requirement-section-heading"><div><span>THE BUYER</span><h2>Request posted by</h2></div></div>
            <div className="requirement-buyer-profile"><span>{req.buyer?.name?.charAt(0)?.toUpperCase() || 'B'}</span><div><strong>{req.buyer?.name || 'Farm-E buyer'}</strong><small>Buyer on Farm-E</small></div></div>
            <div className="requirement-buyer-meta"><div><small>POSTED</small><b>{formatDate(req.createdAt)}</b></div><div><small>{isOwner ? 'OFFERS RECEIVED' : 'REQUEST STATUS'}</small><b>{isOwner ? bids.length : req.status.replace('_', ' ')}</b></div></div>
          </section>

          <section className={`requirement-action-card ${expiresIn !== null && expiresIn <= 3 ? 'is-urgent' : ''}`}>
            <span className="requirement-action-kicker"><Clock size={13} /> OFFER WINDOW</span>
            <strong>{expiresIn !== null ? expiresIn > 0 ? `${expiresIn} days remaining` : 'Bidding has closed' : `Closes ${formatDate(req.expiresAt)}`}</strong>
            <p>{isFarmer ? 'Send a clear offer with your price, harvest date and available quantity.' : 'Review incoming farmer offers and choose the best fit.'}</p>
          </section>
        </aside>
      </div>

      {/* Bid submit modal */}
      <Modal isOpen={bidModal} onClose={() => setBidModal(false)} title="Submit Your Bid" size="md">
        <form onSubmit={handleSubmit((data) => submitBid.mutate(data))} className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
            <p>Buyer's max budget: <strong>{formatINR(req.priceTarget?.max)}/{req.quantity?.unit}</strong></p>
            <p>Required: <strong>{formatQty(req.quantity?.required, req.quantity?.unit)}</strong></p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={`Price / ${req.quantity?.unit} (₹) *`}
              type="number"
              step="0.01"
              placeholder={`Max: ${req.priceTarget?.max}`}
              error={errors.price?.perUnit?.message || errors['price.perUnit']?.message}
              {...register('price.perUnit')}
            />
            <Input
              label="Quantity Offered *"
              type="number"
              step="0.1"
              placeholder={req.quantity?.required}
              error={errors.quantity?.offered?.message || errors['quantity.offered']?.message}
              {...register('quantity.offered')}
            />
          </div>
          <Input
            label="Expected Harvest Date *"
            type="date"
            error={errors.harvestDate?.message}
            {...register('harvestDate')}
          />
          <div>
            <label className="form-label">Notes (optional)</label>
            <textarea
              className="form-input min-h-[72px] resize-none"
              placeholder="Any additional info about your produce..."
              {...register('notes')}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={submitBid.isPending} variant="amber">
              Submit Bid
            </Button>
            <Button type="button" variant="secondary" onClick={() => setBidModal(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default RequirementDetail;
