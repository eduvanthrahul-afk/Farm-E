import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ClipboardList } from 'lucide-react';
import { requirementsApi } from '@/api/index';
import RequirementCard from '@/components/marketplace/RequirementCard';
import { PageSpinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

const BuyerRequirements = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['requirements', 'mine', statusFilter],
    queryFn: () => requirementsApi.getMine({ status: statusFilter || undefined, limit: 50 }),
    select: (r) => r.data.data,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => requirementsApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirements', 'mine'] });
      toast.success('Status updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const requirements = data?.requirements || [];
  const openRequirements = requirements.filter((requirement) => ['OPEN', 'RECEIVING_BIDS'].includes(requirement.status)).length;
  const incomingOffers = requirements.reduce((total, requirement) => total + Number(requirement.bidsCount || 0), 0);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="page animate-fade-in buyer-requirements-page">
      <header className="buyer-requirements-masthead">
        <div><span className="buyer-requirements-kicker"><ClipboardList size={13} /> PROCUREMENT DESK <i>/</i> BUYING REQUESTS</span><h1>What you’re sourcing</h1><p>Manage requests, review incoming offers, and keep your buying plan moving.</p></div>
        <Link to="/buyer/requirements/new" className="btn-amber buyer-requirements-create"><Plus size={15} /> Post a request</Link>
      </header>

      <section className="buyer-requirement-overview" aria-label="Buying request overview">
        <div><small>REQUESTS</small><strong>{requirements.length}</strong><span>in your workspace</span></div>
        <div><small>OPEN FOR OFFERS</small><strong>{openRequirements}</strong><span>farmers can respond</span></div>
        <div><small>INCOMING OFFERS</small><strong>{incomingOffers}</strong><span>across these requests</span></div>
      </section>

      {/* Filter tabs */}
      <div className="buyer-requirement-filters page-filter-tabs page-filter-tabs-amber mb-5 overflow-x-auto pb-1" aria-label="Filter requests by status">
        {['', 'OPEN', 'RECEIVING_BIDS', 'NEGOTIATING', 'FULFILLED', 'EXPIRED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            aria-pressed={statusFilter === s}
            className={`filter-tab ${statusFilter === s ? 'is-active' : ''}`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      {requirements.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No requirements yet"
          description="Post a procurement requirement to receive competitive bids from farmers"
          action={
            <Link to="/buyer/requirements/new" className="btn-amber">
              Post First Requirement
            </Link>
          }
        />
      ) : (
        <div className="buyer-requirement-grid grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {requirements.map((req) => (
            <div key={req._id} className="buyer-requirement-card-wrap relative group">
              <RequirementCard requirement={req} linkBase="/buyer/requirements" />
              {/* Quick close button */}
              {['OPEN', 'RECEIVING_BIDS'].includes(req.status) && (
                <button
                  type="button"
                  aria-label={`Close ${req.crop?.name || 'buying'} request`}
                  onClick={() => statusMutation.mutate({ id: req._id, status: 'CANCELLED' })}
                  className="buyer-requirement-close absolute top-3 right-3 transition-opacity px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium"
                >
                  Close
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BuyerRequirements;
