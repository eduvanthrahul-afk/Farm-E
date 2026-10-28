import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requirementsApi } from '@/api/index';
import RequirementCard from '@/components/marketplace/RequirementCard';
import { PageSpinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Select from '@/components/ui/Select';
import { ClipboardList, Search } from 'lucide-react';
import { CROP_CATEGORIES } from '@/config/constants';

const FarmerRequirements = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['requirements', 'public', search, category],
    queryFn: () => requirementsApi.getAll({ search: search || undefined, category: category || undefined, limit: 30 }),
    select: (r) => r.data.data,
  });

  const requirements = data?.requirements || [];

  return (
    <div className="page animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">Buyer Requirements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Find buyers actively looking for your produce — submit a bid to win their business</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="form-input pl-9"
            placeholder="Search crop, variety..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
          <option value="">All Categories</option>
          {CROP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : requirements.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No active requirements"
          description="Check back soon — buyers post new requirements regularly"
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">{requirements.length} active requirements</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {requirements.map((req) => (
              <RequirementCard key={req._id} requirement={req} linkBase="/farmer/requirements" />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FarmerRequirements;
