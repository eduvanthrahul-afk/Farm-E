import { clsx } from 'clsx';

const Badge = ({ children, variant = 'gray', className }) => {
  const variants = {
    green: 'badge-green',
    amber: 'badge-amber',
    red: 'badge-red',
    gray: 'badge-gray',
    blue: 'badge-blue',
  };
  return (
    <span className={clsx(variants[variant] || 'badge-gray', className)}>
      {children}
    </span>
  );
};

export default Badge;
