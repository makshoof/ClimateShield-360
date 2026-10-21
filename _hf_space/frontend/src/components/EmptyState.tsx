import React from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Telemetry Available',
  description = 'No observations or model runs recorded for this parameter in DuckDB.',
  icon = 'query_stats',
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-space-xl text-center bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm ${className}`}
      role="region"
      aria-label={title}
    >
      <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-space-sm text-secondary">
        <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-1">
        {title}
      </h3>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-space-md">
        {description}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-title-md text-title-md hover:bg-primary-container transition-colors focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          <span>{actionText}</span>
        </button>
      )}
    </div>
  );
};
