import React from 'react';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--cs-accent))]/50 disabled:opacity-50 disabled:pointer-events-none';
  const styles =
    variant === 'ghost'
      ? 'bg-transparent border border-outline-variant/40 text-on-surface hover:bg-surface-container'
      : variant === 'danger'
        ? 'bg-error text-on-error hover:opacity-90'
        : 'bg-secondary text-on-secondary hover:opacity-95 shadow-[var(--cs-shadow-sm)]';

  return (
    <button type="button" className={`${base} ${styles} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
};
