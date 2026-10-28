import { forwardRef } from 'react';
import { clsx } from 'clsx';

const Input = forwardRef(({ label, error, hint, className, id, ...props }, ref) => {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="form-label">{label}</label>}
      <input
        ref={ref}
        id={inputId}
        className={clsx(error ? 'form-input-error' : 'form-input', className)}
        {...props}
      />
      {error && <p className="form-error">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
