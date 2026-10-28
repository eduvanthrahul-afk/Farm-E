import { PackageSearch } from 'lucide-react';

const EmptyState = ({ icon: Icon = PackageSearch, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
      <Icon size={28} className="text-gray-400" />
    </div>
    <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
    {description && <p className="text-sm text-gray-500 max-w-xs">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
