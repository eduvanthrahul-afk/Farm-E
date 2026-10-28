import { forwardRef } from 'react';
import { clsx } from 'clsx';

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  amber: 'btn-amber',
  outline: 'btn-secondary', // alias for secondary with outline style
};

const sizes = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

const Button = forwardRef(
  ({ children, variant = 'primary', size = 'md', loading, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(variants[variant], sizes[size], className)}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
