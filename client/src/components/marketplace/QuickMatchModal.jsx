import { useState } from 'react';
import { ArrowUpRight, MapPin, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requirementsApi } from '@/api/index';
import { CROP_CATEGORIES, QUALITY_CERTIFICATIONS, QUALITY_GRADES, UNITS } from '@/config/constants';
import { formatDate, formatINR, formatQty } from '@/utils/format';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import OpenStreetMapField from '@/components/maps/OpenStreetMapField';

const todayForInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const QuickMatchModal = ({ isOpen, onClose }) => {
  const [criteria, setCriteria] = useState({
    cropName: '',
    variety: '',
    category: '',
    quantity: '',
    unit: '',
    flexibility: '±10%',
    maxPrice: '',
    deliveryDate: '',
    deliveryFlexible: false,
    grade: '',
    organic: false,
  });
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const update = (key, value) => {
    setCriteria((current) => ({ ...current, [key]: value }));
    setSearchResult(null);
    setSearchError('');
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    setIsSearching(true);
    setSearchResult(null);
    setSearchError('');

    const payload = {
      crop: {
        name: criteria.cropName.trim(),
        category: criteria.category,
        ...(criteria.variety.trim() ? { variety: criteria.variety.trim() } : {}),
      },
      quantity: {
        required: Number(criteria.quantity),
        unit: criteria.unit,
        flexibility: criteria.flexibility,
      },
      priceTarget: { max: Number(criteria.maxPrice) },
      quality: {
        ...(criteria.grade ? { grade: criteria.grade } : {}),
        certifications: criteria.organic ? [QUALITY_CERTIFICATIONS[0]] : [],
      },
      deliveryDate: { required: criteria.deliveryDate, flexible: criteria.deliveryFlexible },
      ...(deliveryCoordinates ? {
        deliveryLocation: { coordinates: { type: 'Point', coordinates: deliveryCoordinates } },
      } : {}),
    };

    try {
      const response = await requirementsApi.previewMatches(payload);
      setSearchResult(response.data.data);
    } catch (error) {
      setSearchError(error.response?.data?.message || 'Could not search listings. Try again in a moment.');
    } finally {
      setIsSearching(false);
    }
  };

  const matches = searchResult?.matches || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="What are you looking for?" size="xl" className="quick-match-modal">
      <div className="quick-match-content">
        <div className="quick-match-intro">
          <span className="quick-match-intro-icon"><Sparkles size={17} /></span>
          <p>Tell us what you need. Farm-E will look through active farmer listings and rank only suitable matches. This search does not post a public request.</p>
        </div>

        <form className="quick-match-form" onSubmit={handleSearch}>
          <div className="quick-match-fields">
            <Input
              label="Crop *"
              name="cropName"
              value={criteria.cropName}
              onChange={(event) => update('cropName', event.target.value)}
              placeholder="e.g. Tomato"
              maxLength={80}
              required
            />
            <label className="w-full">
              <span className="form-label">Category *</span>
              <select className="form-select" value={criteria.category} onChange={(event) => update('category', event.target.value)} required>
                <option value="">Choose a category</option>
                {CROP_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <Input
              label="Variety (optional)"
              name="variety"
              value={criteria.variety}
              onChange={(event) => update('variety', event.target.value)}
              placeholder="Any variety"
              maxLength={80}
            />
            <Input
              label="Quantity needed *"
              name="quantity"
              type="number"
              min="0.1"
              step="any"
              value={criteria.quantity}
              onChange={(event) => update('quantity', event.target.value)}
              placeholder="Enter quantity"
              required
            />
            <label className="w-full">
              <span className="form-label">Unit *</span>
              <select className="form-select" value={criteria.unit} onChange={(event) => update('unit', event.target.value)} required>
                <option value="">Choose a unit</option>
                {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>
            <label className="w-full">
              <span className="form-label">Quantity flexibility</span>
              <select className="form-select" value={criteria.flexibility} onChange={(event) => update('flexibility', event.target.value)}>
                {['EXACT', '±10%', '±20%', 'FLEXIBLE'].map((value) => <option key={value} value={value}>{value === 'EXACT' ? 'Exact quantity' : value}</option>)}
              </select>
            </label>
            <Input
              label={`Maximum price per ${criteria.unit || 'unit'} *`}
              name="maxPrice"
              type="number"
              min="0.01"
              step="0.01"
              value={criteria.maxPrice}
              onChange={(event) => update('maxPrice', event.target.value)}
              placeholder="Enter your limit"
              required
            />
            <Input
              label="Need it by *"
              name="deliveryDate"
              type="date"
              min={todayForInput()}
              value={criteria.deliveryDate}
              onChange={(event) => update('deliveryDate', event.target.value)}
              required
            />
            <label className="quick-match-grade-field w-full">
              <span className="form-label">Quality grade</span>
              <select className="form-select" value={criteria.grade} onChange={(event) => update('grade', event.target.value)}>
                <option value="">Any listed grade</option>
                {QUALITY_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </label>
          </div>

          <div className="quick-match-options">
            <label className="quick-match-checkbox">
              <input type="checkbox" checked={criteria.deliveryFlexible} onChange={(event) => update('deliveryFlexible', event.target.checked)} />
              <span>Delivery date can be flexible</span>
            </label>
            <label className="quick-match-checkbox">
              <input type="checkbox" checked={criteria.organic} onChange={(event) => update('organic', event.target.checked)} />
              <span>Organic certification required</span>
            </label>
            <button type="button" className="quick-match-map-toggle" onClick={() => setShowLocationPicker((shown) => !shown)}>
              <MapPin size={14} /> {showLocationPicker ? 'Hide delivery pin' : 'Add delivery pin for distance ranking'}
            </button>
          </div>

          {showLocationPicker && (
            <div className="quick-match-map">
              <OpenStreetMapField
                value={deliveryCoordinates}
                onChange={(coordinates) => {
                  setDeliveryCoordinates(coordinates);
                  setSearchResult(null);
                }}
                interactive
              />
              {deliveryCoordinates && <button className="quick-match-clear-pin" type="button" onClick={() => { setDeliveryCoordinates(null); setSearchResult(null); }}>Clear delivery pin</button>}
            </div>
          )}

          <div className="quick-match-submit-row">
            <span>Only active, available, unexpired listings are considered.</span>
            <Button type="submit" variant="amber" loading={isSearching}>
              <Search size={15} /> Find matching listings
            </Button>
          </div>
        </form>

        {searchError && <p className="quick-match-error" role="alert">{searchError}</p>}

        {searchResult && (
          <section className="quick-match-results" aria-live="polite" aria-label="Matching farmer listings">
            <div className="quick-match-results-heading">
              <div><span>FARM-E MATCHES</span><h3>{searchResult.eligibleCandidates} suitable listing{searchResult.eligibleCandidates === 1 ? '' : 's'}</h3></div>
              <small>{searchResult.totalCandidates} active listing{searchResult.totalCandidates === 1 ? '' : 's'} screened</small>
            </div>

            {matches.length === 0 ? (
              <div className="quick-match-empty">
                <Search size={21} />
                <strong>No suitable active listings yet</strong>
                <p>Try adjusting the quantity tolerance, grade, or delivery timing. You can change this search without posting a request.</p>
              </div>
            ) : (
              <div className="quick-match-list">
                {matches.map(({ listing, matchScore }) => {
                  const reasons = Object.entries(matchScore.breakdown || {})
                    .filter(([key]) => deliveryCoordinates || key !== 'location')
                    .sort((a, b) => b[1].weight - a[1].weight)
                    .slice(0, 3);
                  const farmer = listing.farm?.farmName || listing.farmer?.name || 'Farmer name not listed';
                  const area = [listing.location?.district, listing.location?.state].filter(Boolean).join(', ');

                  return (
                    <article className="quick-match-result-card" key={listing._id}>
                      <div className="quick-match-result-top">
                        <span className="quick-match-score">{matchScore.score}% match</span>
                        <div className="quick-match-result-title"><h4>{listing.crop?.name}{listing.crop?.variety ? ` · ${listing.crop.variety}` : ''}</h4><p>{farmer}</p></div>
                        <Link to={`/listings/${listing._id}`} className="quick-match-view-link" onClick={onClose}>View listing <ArrowUpRight size={14} /></Link>
                      </div>
                      <div className="quick-match-facts">
                        <span><small>PRICE</small><b>{formatINR(listing.pricePerUnit?.expected)}/{listing.quantity?.unit}</b></span>
                        <span><small>AVAILABLE</small><b>{formatQty(listing.quantity?.available, listing.quantity?.unit)}</b></span>
                        <span><small>HARVEST</small><b>{formatDate(listing.harvestDate?.expected)}</b></span>
                        <span><small>FARM AREA</small><b>{area || 'Not provided'}</b></span>
                      </div>
                      <ul className="quick-match-reasons" aria-label="Why this listing matched">
                        {reasons.map(([key, item]) => <li key={key}><b>{key}:</b> {item.reason}</li>)}
                      </ul>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
};

export default QuickMatchModal;
