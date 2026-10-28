import { forwardRef } from 'react';
import { clsx } from 'clsx';

const Select = forwardRef(({ label, error, children, className, ...props }, ref) => {
  return (
    <div className="w-full">
      {label && <label className="form-label">{label}</label>}
      <select
        ref={ref}
        className={clsx(error ? 'form-input-error' : 'form-select', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
