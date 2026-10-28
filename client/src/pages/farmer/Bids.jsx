import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Gavel, CheckCircle, XCircle, Plus, Search, Clock, ArrowUpRight, Sprout } from 'lucide-react';
import { bidsApi } from '@/api/index';
import { formatINR, formatDate, formatQty } from '@/utils/format';
import { BID_STATUS } from '@/config/constants';
import { PageSpinner } from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

const bidStatusColor = {
  PENDING: 'gray', SEEN: 'blue', SHORTLISTED: 'amber',
  COUNTER_OFFERED: 'amber', ACCEPTED: 'green', REJECTED: 'red',
  WITHDRAWN: 'gray', EXPIRED: 'gray',
};

const bidFilters = [
  { key: 'all', label: 'All offers', statuses: null },
  { key: 'waiting', label: 'Awaiting reply', statuses: [BID_STATUS.PENDING, BID_STATUS.SEEN] },
  { key: 'shortlisted', label: 'In discussion', statuses: [BID_STATUS.SHORTLISTED, BID_STATUS.COUNTER_OFFERED] },
  { key: 'accepted', label: 'Accepted', statuses: [BID_STATUS.ACCEPTED] },
  { key: 'closed', label: 'Closed', statuses: [BID_STATUS.REJECTED, BID_STATUS.WITHDRAWN, BID_STATUS.EXPIRED] },
];

const FarmerBids = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bids', 'mine'],
    queryFn: () => bidsApi.getMine(),
    select: (r) => r.data.data,
  });

  const withdrawMutation = useMutation({
    mutationFn: (id) => bidsApi.withdraw(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bids', 'mine'] });
      toast.success('Bid withdrawn');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to withdraw bid'),
  });

  const allBids = data?.bids || [];
  const statusCounts = allBids.reduce((counts, bid) => {
    counts[bid.status] = (counts[bid.status] || 0) + 1;
    return counts;
  }, {});
  const selectedFilter = bidFilters.find((filter) => filter.key === statusFilter) || bidFilters[0];
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const bids = allBids.filter((bid) => {
    const matchesStatus = !selectedFilter.statuses || selectedFilter.statuses.includes(bid.status);
    const searchText = [bid.requirement?.crop?.name, bid.requirement?.crop?.variety, bid.requirement?.crop?.category, bid.quality?.grade]
      .filter(Boolean).join(' ').toLocaleLowerCase();
    return matchesStatus && (!normalizedSearch || searchText.includes(normalizedSearch));
  });
  const awaitingReply = (statusCounts[BID_STATUS.PENDING] || 0) + (statusCounts[BID_STATUS.SEEN] || 0);
  const acceptedCount = statusCounts[BID_STATUS.ACCEPTED] || 0;

  if (isLoading) return <PageSpinner />;

  return (
    <div className="page animate-fade-in farmer-bids-page">
      <header className="bids-masthead">
        <div className="bids-heading-copy">
          <span className="bids-kicker"><Gavel size={14} /> OFFER LEDGER <span>/</span> BUYER REQUESTS</span>
          <h1>Your bids</h1>
          <p>Track the offers you’ve sent and see what needs your attention.</p>
        </div>
        <Link to="/farmer/requirements" className="btn-primary bids-find-button"><Plus size={17} /> Find a request <ArrowUpRight size={15} /></Link>
        <div className="bids-masthead-mark" aria-hidden="true"><Sprout size={62} strokeWidth={1} /></div>
      </header>

      <section className="bids-overview" aria-label="Bid overview">
        <div className="bids-overview-primary"><span className="bids-overview-number">{allBids.length}</span><span><b>Offers sent</b><small>Every conversation starts somewhere</small></span></div>
        <div className="bids-overview-metric"><Clock size={16} /><span><b>{awaitingReply}</b><small>Awaiting buyer reply</small></span></div>
        <div className="bids-overview-metric"><CheckCircle size={16} /><span><b>{acceptedCount}</b><small>Accepted offers</small></span></div>
      </section>

      <section className="bids-toolbox" aria-label="Search and filter bids">
        <div className="bids-search-wrap"><Search size={17} /><input className="bids-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by crop or variety" aria-label="Search bids by crop or variety" />{searchTerm && <button className="bids-search-clear" type="button" aria-label="Clear search" onClick={() => setSearchTerm('')}><XCircle size={15} /></button>}</div>
        <div className="bids-filter-row" aria-label="Filter bids by status">
          {bidFilters.map((filter) => {
            const count = filter.statuses ? filter.statuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0) : allBids.length;
            return <button key={filter.key} onClick={() => setStatusFilter(filter.key)} aria-pressed={statusFilter === filter.key} className={`bids-filter ${statusFilter === filter.key ? 'is-active' : ''}`}>{filter.label}<span>{count}</span></button>;
          })}
        </div>
        <p className="bids-result-count">Showing <b>{bids.length}</b> of {allBids.length}</p>
      </section>

      {allBids.length === 0 ? (
        <div className="bids-empty-card"><EmptyState icon={Gavel} title="Your first offer is waiting" description="Browse buyer requirements and send an offer that fits your harvest." action={<Link to="/farmer/requirements" className="btn-primary bids-empty-action"><Search size={15} /> Browse requests</Link>} /></div>
      ) : bids.length === 0 ? (
        <div className="bids-empty-card"><EmptyState icon={Search} title="No offers match" description="Try another crop search or select a different status." action={<button className="btn-secondary bids-empty-action" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}>Clear filters</button>} /></div>
      ) : (
        <div className="bid-card-grid">
          {bids.map((bid) => {
            const accepted = bid.status === BID_STATUS.ACCEPTED;
            const waiting = [BID_STATUS.PENDING, BID_STATUS.SEEN].includes(bid.status);
            return (
              <article key={bid._id} className={`offer-card offer-card-${accepted ? 'accepted' : waiting ? 'waiting' : 'standard'}`}>
                <div className="offer-card-topline"><span className="offer-card-category">{bid.requirement?.crop?.category || 'Buyer request'}</span><Badge variant={bidStatusColor[bid.status] || 'gray'}>{bid.status.replaceAll('_', ' ')}</Badge></div>
                <div className="offer-card-heading"><span className="offer-crop-icon"><Sprout size={19} /></span><div><h2>{bid.requirement?.crop?.name || 'Crop Requirement'}</h2><p>{bid.requirement?.crop?.variety || 'Fresh produce'}{bid.quality?.grade ? ` · ${bid.quality.grade} grade` : ''}</p></div></div>
                <div className="offer-card-price"><small>YOUR OFFER</small><strong>{formatINR(bid.price?.perUnit)}<em> / {bid.quantity?.unit}</em></strong></div>
                <div className="offer-card-facts"><div><small>QUANTITY</small><b>{formatQty(bid.quantity?.offered, bid.quantity?.unit)}</b></div><div><small>HARVEST DATE</small><b>{formatDate(bid.harvestDate)}</b></div></div>
                <div className="offer-card-expiry"><Clock size={13} /> Request closes {formatDate(bid.expiresAt)}</div>
                {accepted && <div className="offer-accepted-note"><CheckCircle size={15} /><span>Accepted — an order has been created.</span></div>}
                <div className="offer-card-actions">
                  <Link to={`/farmer/requirements/${bid.requirement?._id}`} className="offer-view-request">View request <ArrowUpRight size={14} /></Link>
                  {[BID_STATUS.PENDING, BID_STATUS.SEEN, BID_STATUS.SHORTLISTED].includes(bid.status) && <Button variant="ghost" size="sm" onClick={() => withdrawMutation.mutate(bid._id)} loading={withdrawMutation.isPending} className="offer-withdraw-button"><XCircle size={14} /> Withdraw</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FarmerBids;
