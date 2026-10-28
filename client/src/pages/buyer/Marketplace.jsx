import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X, MapPin, LocateFixed, Map as MapIcon, List as ListIcon } from 'lucide-react';
import { listingsApi } from '@/api/index';
import ListingCard from '@/components/marketplace/ListingCard';
import { PageSpinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { CROP_CATEGORIES, QUALITY_GRADES } from '@/config/constants';
import MarketplaceMap from '@/components/maps/MarketplaceMap';

const Marketplace = () => {
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({});
  const [nearby, setNearby] = useState(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [locationError, setLocationError] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [pickSearchPoint, setPickSearchPoint] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['listings', 'marketplace', applied],
    queryFn: () => listingsApi.getAll({ ...applied, limit: 24 }),
    select: (r) => r.data.data,
  });

  const handleApply = () => {
    const params = { ...filters };
    if (search) params.crop = search; // use regex-based crop search
    else delete params.crop;
    if (nearby) Object.assign(params, nearby);
    setApplied(params);
    setShowFilters(false);
  };

  const handleClear = () => {
    setFilters({});
    setSearch('');
    setApplied({});
    setNearby(null);
    setLocationError('');
    setPickSearchPoint(false);
  };

  const listings = data?.listings || [];
  const hasActiveFilters = Object.keys(applied).some((k) => applied[k]);
  const applyQuickCategory = (category) => {
    const nextFilters = { ...filters, category: category || undefined };
    setFilters(nextFilters);
    setApplied({
      ...nextFilters,
      crop: search.trim() || undefined,
      ...(nearby || {}),
    });
  };

  const findNearby = () => {
    if (nearby) {
      setNearby(null);
      setApplied((current) => {
        const next = { ...current };
        delete next.nearLat;
        delete next.nearLng;
        delete next.radiusKm;
        return next;
      });
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('Location services are not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const locationFilter = { nearLat: coords.latitude, nearLng: coords.longitude, radiusKm };
        setNearby(locationFilter);
        setApplied((current) => ({ ...current, ...locationFilter }));
        setLocationError('');
      },
      (error) => {
        if (error.code === 1) setLocationError('Allow location access in your browser settings to find produce near you.');
        else if (error.code === 2) setLocationError('Your device could not get a location fix. Turn on device location or choose an area on the map.');
        else setLocationError('High-accuracy location timed out. Try again where you have a clearer signal, or choose an area on the map.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const selectSearchPoint = (coordinates) => {
    const locationFilter = { nearLat: coordinates[1], nearLng: coordinates[0], radiusKm };
    setNearby(locationFilter);
    setApplied((current) => ({ ...current, ...locationFilter }));
    setPickSearchPoint(false);
    setLocationError('');
  };

  return (
    <div className="page page-marketplace buyer-marketplace-page animate-fade-in">
      {/* Header */}
      <div className="page-header market-heading">
        <div><span className="page-kicker">FARM-E SUPPLY / MARKETPLACE</span><h1 className="section-title mt-1">Find fresh produce</h1>
          <p className="text-sm text-gray-500 mt-1">Explore harvests from farmers and start a direct conversation.</p></div>
        <div className="marketplace-trust"><span><span className="market-live-dot" /> Farmer-listed</span><span>Clear price &amp; harvest details</span></div>
      </div>

      {/* Search + Filter bar */}
      <div className="market-search-toolbar mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="form-input pl-9 pr-4"
            placeholder="Search crops, varieties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          />
        </div>
        <Button
          variant={showFilters || hasActiveFilters ? 'primary' : 'secondary'}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} />
          Filters
          {hasActiveFilters && (
            <span className="w-5 h-5 rounded-full bg-white/30 text-xs font-bold flex items-center justify-center">
              ✓
            </span>
          )}
        </Button>
        <select
          className="form-input w-auto min-w-[112px]"
          aria-label="Nearby search radius"
          value={radiusKm}
          onChange={(event) => {
            const nextRadius = Number(event.target.value);
            setRadiusKm(nextRadius);
            if (nearby) {
              setNearby((current) => ({ ...current, radiusKm: nextRadius }));
              setApplied((current) => ({ ...current, radiusKm: nextRadius }));
            }
          }}
        >
          {[25, 50, 100, 250].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
        </select>
        <Button variant={nearby ? 'primary' : 'secondary'} onClick={findNearby}>
          {nearby ? <MapPin size={16} /> : <LocateFixed size={16} />}
          {nearby ? 'Nearby on' : 'Near me'}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={handleClear}>
            <X size={15} /> Clear
          </Button>
        )}
      </div>
      {locationError && <p role="status" className="mb-4 text-sm text-amber-800">{locationError}</p>}

      <div className="market-category-strip" aria-label="Quick category filter">
        <span className="category-strip-label">QUICK FIND</span>
        <button type="button" className={`category-chip ${!applied.category ? 'is-selected' : ''}`} aria-pressed={!applied.category} onClick={() => applyQuickCategory('')}>All produce</button>
        {CROP_CATEGORIES.slice(0, 6).map((category) => <button type="button" key={category} className={`category-chip ${applied.category === category ? 'is-selected' : ''}`} aria-pressed={applied.category === category} onClick={() => applyQuickCategory(category)}>{category}</button>)}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card p-5 mb-5 animate-slide-down">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Select
              label="Category"
              value={filters.category || ''}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              {CROP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select
              label="Quality Grade"
              value={filters.grade || ''}
              onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
            >
              <option value="">All Grades</option>
              {QUALITY_GRADES.map((g) => <option key={g}>{g}</option>)}
            </Select>
            <Input
              label="Max Price (₹)"
              type="number"
              placeholder="e.g. 50"
              value={filters.maxPrice || ''}
              onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
            />
            <Select
              label="Sort By"
              value={filters.sortBy || ''}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            >
              <option value="">Newest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="harvest">Harvest Date</option>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleApply}>Apply Filters</Button>
            <Button variant="ghost" onClick={() => setShowFilters(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading ? <PageSpinner /> : (
        <>
          <div className="market-results-heading">
            <div><span className="page-kicker">READY FOR YOUR NEXT ORDER</span><p>{isFetching ? 'Updating produce...' : `${data?.pagination?.total || listings.length} harvest${(data?.pagination?.total || listings.length) === 1 ? '' : 's'} to explore`}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {viewMode === 'map' && <Button size="sm" variant={pickSearchPoint ? 'primary' : 'secondary'} onClick={() => setPickSearchPoint((value) => !value)}>
                <MapPin size={15} /> {pickSearchPoint ? 'Cancel map pick' : nearby ? 'Move search center' : 'Choose area on map'}
              </Button>}
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Marketplace result view">
                <button type="button" aria-pressed={viewMode === 'list'} onClick={() => { setViewMode('list'); setPickSearchPoint(false); }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'list' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><ListIcon size={14} /> List</button>
                <button type="button" aria-pressed={viewMode === 'map'} onClick={() => setViewMode('map')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'map' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><MapIcon size={14} /> Map</button>
              </div>
              {viewMode === 'list' && <span className="market-view-label">Showing fresh listings</span>}
            </div>
          </div>
          {viewMode === 'map' ? <MarketplaceMap
            listings={listings}
            searchCenter={nearby ? { lat: nearby.nearLat, lng: nearby.nearLng } : null}
            radiusKm={radiusKm}
            pickSearchPoint={pickSearchPoint}
            onPickSearchPoint={selectSearchPoint}
          /> : listings.length === 0 ? (
            <EmptyState
              title="No listings found"
              description="Try adjusting your filters or search terms"
              action={hasActiveFilters && <Button variant="secondary" onClick={handleClear}>Clear Filters</Button>}
            />
          ) : (
            <div className="buyer-marketplace-grid grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {listings.map((listing) => <ListingCard key={listing._id} listing={listing} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Marketplace;
