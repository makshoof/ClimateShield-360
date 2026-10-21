import React from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  detail,
  onRetry,
}) => (
  <div className="rounded-2xl border border-error/30 bg-error-container/20 px-5 py-6 text-center">
    <span className="material-symbols-outlined text-3xl text-error" aria-hidden>
      error
    </span>
    <h3 className="mt-2 font-display font-semibold text-on-surface">{title}</h3>
    {detail && <p className="mt-1 text-sm text-on-surface-variant">{detail}</p>}
    {onRetry && (
      <div className="mt-4 flex justify-center">
        <Button onClick={onRetry}>Retry</Button>
      </div>
    )}
  </div>
);
