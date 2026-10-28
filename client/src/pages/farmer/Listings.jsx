import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Edit, Pause, Play, Package, Eye, Clock, ExternalLink, Search, Sprout, X, CalendarDays, Layers3, ImagePlus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { listingsApi } from '@/api/index';
import { formatINR, formatDate, formatQty } from '@/utils/format';
import { LISTING_STATUS } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import { cropThumbnail } from '@/utils/cropThumbnail';

const statusColor = { ACTIVE: 'green', PAUSED: 'amber', DRAFT: 'gray', SOLD_OUT: 'red', EXPIRED: 'red', CLOSED: 'gray' };
const listingFilters = [
  { value: '', label: 'All listings' },
  { value: 'ACTIVE', label: 'Live' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'SOLD_OUT', label: 'Sold out' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CLOSED', label: 'Closed' },
];

const FarmerListings = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [decayModalListing, setDecayModalListing] = useState(null);
  const [floorPrice, setFloorPrice] = useState('');
  const [decrementAmount, setDecrementAmount] = useState('2');
  const [intervalMinutes, setIntervalMinutes] = useState('30');
  const [editingListing, setEditingListing] = useState(null);
  const [editValues, setEditValues] = useState({ quantity: '', price: '', harvestDate: '', description: '' });
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['listings', 'mine'],
    queryFn: () => listingsApi.getMine({ limit: 50 }),
    select: (r) => r.data.data,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => listingsApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings', 'mine'] });
      toast.success('Listing status updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const activateDecayMutation = useMutation({
    mutationFn: ({ id, data }) => listingsApi.activateDecayFlash(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings', 'mine'] });
      setDecayModalListing(null);
      toast.success('⚡ Dutch Clock Price Decay Flash Sale activated!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to activate price decay'),
  });

  const editMutation = useMutation({
    mutationFn: () => listingsApi.update(editingListing._id, {
      quantity: { expected: Number(editValues.quantity), unit: editingListing.quantity.unit },
      pricePerUnit: { expected: Number(editValues.price), minimum: editingListing.pricePerUnit?.minimum },
      harvestDate: { expected: editValues.harvestDate },
      description: editValues.description,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings', 'mine'] });
      setEditingListing(null);
      toast.success('Listing updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not update this listing'),
  });

  const stopDecayMutation = useMutation({
    mutationFn: (id) => listingsApi.stopDecayFlash(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings', 'mine'] });
      toast.success('Dutch Clock Price Decay stopped');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to stop price decay'),
  });

  const uploadImagesMutation = useMutation({
    mutationFn: ({ id, files }) => listingsApi.uploadImages(id, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      toast.success('Listing photos added');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not upload listing photos'),
  });

  const listings = data?.listings || [];
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visibleListings = listings.filter((listing) => {
    const matchesStatus = !statusFilter || listing.status === statusFilter;
    const searchText = [listing.crop?.name, listing.crop?.variety, listing.crop?.category, listing.quality?.grade]
      .filter(Boolean).join(' ').toLocaleLowerCase();
    return matchesStatus && (!normalizedSearch || searchText.includes(normalizedSearch));
  });
  const statusCounts = listings.reduce((counts, listing) => {
    counts[listing.status] = (counts[listing.status] || 0) + 1;
    return counts;
  }, {});
  const totalViews = listings.reduce((total, listing) => total + Number(listing.views || 0), 0);

  const handleStatus = (id, currentStatus) => {
    const next = currentStatus === LISTING_STATUS.ACTIVE ? LISTING_STATUS.PAUSED : LISTING_STATUS.ACTIVE;
    statusMutation.mutate({ id, status: next });
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="page animate-fade-in farmer-listings-page">
      <header className="listings-masthead">
        <div className="listings-heading-copy">
          <span className="listings-kicker"><Sprout size={14} /> FARM INVENTORY <span>/</span> DIRECT MARKET</span>
          <h1>My listings</h1>
          <p>Every harvest you bring to market, ready to manage.</p>
        </div>
        <Link to="/farmer/listings/new" className="btn-primary listings-create-button"><Plus size={17} /> Add produce</Link>
        <div className="listings-masthead-mark" aria-hidden="true"><Sprout size={62} strokeWidth={1} /></div>
      </header>

      <section className="listings-overview" aria-label="Inventory overview">
        <div className="listings-overview-primary"><span className="listings-overview-number">{listings.length}</span><span><b>Offers in your inventory</b><small>{statusCounts.ACTIVE || 0} currently live on the market</small></span></div>
        <div className="listings-overview-metric"><Layers3 size={16} /><span><b>{statusCounts.PAUSED || 0}</b><small>Paused offers</small></span></div>
        <div className="listings-overview-metric"><Eye size={16} /><span><b>{totalViews.toLocaleString('en-IN')}</b><small>Marketplace views</small></span></div>
      </section>

      <section className="listings-toolbox" aria-label="Search and filter listings">
        <div className="listings-search-wrap"><Search size={17} /><input className="listings-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Find a crop, variety or grade" aria-label="Search your listings" />{searchTerm && <button className="listings-search-clear" type="button" onClick={() => setSearchTerm('')} aria-label="Clear search"><X size={15} /></button>}</div>
        <div className="listings-filter-row" aria-label="Filter listings by status">
          {listingFilters.map(({ value, label }) => (
            <button key={value || 'all'} onClick={() => setStatusFilter(value)} aria-pressed={statusFilter === value} className={`listings-filter ${statusFilter === value ? 'is-active' : ''}`}>
              {label}<span>{value ? statusCounts[value] || 0 : listings.length}</span>
            </button>
          ))}
        </div>
        <p className="listings-result-count">Showing <b>{visibleListings.length}</b> of {listings.length} listings</p>
      </section>

      {listings.length === 0 ? (
        <div className="listings-empty-card"><EmptyState icon={Package} title="Your market starts here" description="Add your first harvest to make it visible to buyers." action={<Link to="/farmer/listings/new" className="btn-primary listings-empty-action"><Plus size={16} /> Create a listing</Link>} /></div>
      ) : visibleListings.length === 0 ? (
        <div className="listings-empty-card"><EmptyState icon={Search} title="No matching produce" description="Try another crop name or clear the selected filters." action={<button className="btn-secondary listings-empty-action" onClick={() => { setSearchTerm(''); setStatusFilter(''); }}>Clear filters</button>} /></div>
      ) : (
        <div className="listing-card-grid">
          {visibleListings.map((l) => (
            <article key={l._id} className={`inventory-listing-card ${l.status === 'ACTIVE' ? 'is-live' : ''}`}>
              <div className="inventory-card-photo">
                <img src={l.images?.[0] || cropThumbnail(l.crop?.name)} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = cropThumbnail(l.crop?.name); }} alt={`${l.crop.name} harvest thumbnail`} loading="lazy" />
                <div className="inventory-photo-topline"><Badge variant={statusColor[l.status] || 'gray'}>{l.status === 'ACTIVE' ? 'LIVE' : l.status.replace('_', ' ')}</Badge>{l.priceDecay?.enabled && <span className="inventory-flash-tag"><Clock size={12} /> PRICE DROP</span>}</div>
                <span className="inventory-photo-category">{l.crop.category}</span>
                {(l.images?.length || 0) < 5 && <>
                  <input id={`listing-images-${l._id}`} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    event.target.value = '';
                    const slots = 5 - (l.images?.length || 0);
                    const accepted = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024).slice(0, slots);
                    if (accepted.length !== files.length) toast.error(`Choose up to ${slots} JPEG, PNG, or WebP photos, each no larger than 5 MB`);
                    if (accepted.length) uploadImagesMutation.mutate({ id: l._id, files: accepted });
                  }} />
                  <button type="button" className="inventory-photo-add" disabled={uploadImagesMutation.isPending} onClick={() => document.getElementById(`listing-images-${l._id}`)?.click()} aria-label={`Add photos to ${l.crop.name} listing`}><ImagePlus size={14} /> Add photos</button>
                </>}
              </div>
              <div className="inventory-card-body">
                <div className="inventory-crop-heading"><div><h2>{l.crop.name}</h2><p>{[l.crop.variety, l.quality?.grade ? `${l.quality.grade} grade` : null].filter(Boolean).join(' · ') || 'Fresh harvest'}</p></div><span className="inventory-views"><Eye size={14} /> {l.views || 0}</span></div>
                <div className="inventory-card-metrics"><div><small>YOUR PRICE</small><strong>{formatINR(l.priceDecay?.enabled ? l.priceDecay.currentPrice || l.pricePerUnit?.expected : l.pricePerUnit?.expected)}<em>/{l.quantity?.unit}</em></strong></div><div><small>AVAILABLE</small><strong>{formatQty(l.quantity?.available, l.quantity?.unit)}</strong></div></div>
                <div className="inventory-card-harvest"><CalendarDays size={14} /><span>Harvest {formatDate(l.harvestDate?.expected)}</span></div>
                {l.priceDecay?.enabled && <div className="inventory-card-flash-price"><Clock size={13} /> Dutch clock active <b>{formatINR(l.priceDecay.currentPrice || l.pricePerUnit?.expected)}</b></div>}
                <div className="inventory-card-actions">
                  <Link to={`/marketplace/${l._id}`} className="inventory-view-action">View listing <ExternalLink size={14} /></Link>
                  <div className="inventory-icon-actions">
                    <button type="button" title="Edit listing" aria-label={`Edit ${l.crop.name}`} onClick={() => { setEditingListing(l); setEditValues({ quantity: String(l.quantity?.expected || ''), price: String(l.pricePerUnit?.expected || ''), harvestDate: l.harvestDate?.expected ? new Date(l.harvestDate.expected).toISOString().slice(0, 10) : '', description: l.description || '' }); }}><Edit size={15} /></button>
                    {[LISTING_STATUS.ACTIVE, LISTING_STATUS.PAUSED].includes(l.status) && <button type="button" title={l.status === LISTING_STATUS.ACTIVE ? 'Pause listing' : 'Activate listing'} aria-label={l.status === LISTING_STATUS.ACTIVE ? `Pause ${l.crop.name}` : `Activate ${l.crop.name}`} onClick={() => handleStatus(l._id, l.status)}>{l.status === LISTING_STATUS.ACTIVE ? <Pause size={15} /> : <Play size={15} />}</button>}
                    {l.priceDecay?.enabled ? <button type="button" className="inventory-decay-action active" title="Stop Dutch Price Decay" aria-label={`Stop price drop for ${l.crop.name}`} onClick={() => stopDecayMutation.mutate(l._id)}><Clock size={15} /></button> : <button type="button" className="inventory-decay-action" title="Start Dutch Clock Price Decay" aria-label={`Start price drop for ${l.crop.name}`} onClick={() => { setDecayModalListing(l); setFloorPrice(Math.floor((l.pricePerUnit?.expected || 100) * 0.7)); }}><Clock size={15} /></button>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal isOpen={!!editingListing} onClose={() => setEditingListing(null)} title="Edit listing" size="sm">
        <div className="space-y-4 p-6">
          <p className="text-sm text-gray-500">Update the offer details for {editingListing?.crop?.name}. Already ordered stock is protected.</p>
          <Input label={`Total quantity (${editingListing?.quantity?.unit || ''})`} type="number" min="0.1" step="0.1" value={editValues.quantity} onChange={(event) => setEditValues((values) => ({ ...values, quantity: event.target.value }))} />
          <Input label="Price per unit (₹)" type="number" min="0" step="0.01" value={editValues.price} onChange={(event) => setEditValues((values) => ({ ...values, price: event.target.value }))} />
          <Input label="Expected harvest date" type="date" value={editValues.harvestDate} onChange={(event) => setEditValues((values) => ({ ...values, harvestDate: event.target.value }))} />
          <label className="block text-sm font-medium text-gray-700">Description<textarea rows={3} value={editValues.description} onChange={(event) => setEditValues((values) => ({ ...values, description: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100" /></label>
          <div className="flex gap-2"><Button className="flex-1" loading={editMutation.isPending} disabled={!editValues.quantity || Number(editValues.quantity) <= 0 || editValues.price === '' || Number(editValues.price) < 0 || !editValues.harvestDate} onClick={() => editMutation.mutate()}>Save changes</Button><Button variant="secondary" onClick={() => setEditingListing(null)}>Cancel</Button></div>
        </div>
      </Modal>

      {/* Dutch Clock Price Decay Modal */}
      {decayModalListing && (
        <Modal
          isOpen={!!decayModalListing}
          onClose={() => setDecayModalListing(null)}
          title="⚡ Activate Dutch Clock Price Decay"
          size="sm"
        >
          <div className="p-6">
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
              <p className="text-sm font-bold text-gray-900">{decayModalListing.crop?.name} ({decayModalListing.crop?.variety || 'Fresh'})</p>
              <p className="text-xs text-gray-600 mt-1">
                Current starting price: <span className="font-bold text-gray-900">{formatINR(decayModalListing.pricePerUnit?.expected)}</span>/{decayModalListing.quantity?.unit}
              </p>
              <p className="text-[11px] text-orange-800 mt-2">
                Produce will automatically tick down in price every interval until a buyer snaps it up or the floor reserve price is reached.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <Input
                label="Floor Reserve Price (₹) *"
                type="number"
                value={floorPrice}
                onChange={(e) => setFloorPrice(e.target.value)}
                hint="Price will never drop lower than this floor"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Drop Amount (₹)"
                  type="number"
                  value={decrementAmount}
                  onChange={(e) => setDecrementAmount(e.target.value)}
                />
                <Input
                  label="Interval (Mins)"
                  type="number"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                loading={activateDecayMutation.isPending}
                onClick={() => {
                  activateDecayMutation.mutate({
                    id: decayModalListing._id,
                    data: {
                      floorPrice: Number(floorPrice),
                      decrementAmount: Number(decrementAmount),
                      intervalMinutes: Number(intervalMinutes),
                    },
                  });
                }}
              >
                Launch Flash Sale
              </Button>
              <Button variant="secondary" onClick={() => setDecayModalListing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FarmerListings;
