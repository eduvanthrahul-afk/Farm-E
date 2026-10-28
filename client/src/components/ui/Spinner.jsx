const Spinner = ({ size = 'md', className = '' }) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div className={`${sizes[size]} border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin ${className}`} />
  );
};

export const PageSpinner = () => (
  <div className="flex items-center justify-center min-h-[300px]">
    <Spinner size="lg" />
  </div>
);

export default Spinner;
