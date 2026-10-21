import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  lastUpdated?: string | null;
  badge?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  lastUpdated,
  badge,
}) => (
  <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-outline-variant/30">
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
          {title}
        </h1>
        {badge}
      </div>
      {subtitle && <p className="text-sm text-on-surface-variant max-w-3xl">{subtitle}</p>}
      {lastUpdated && (
        <p className="text-[11px] font-mono text-on-surface-variant/80 tabular-nums">
          As of {lastUpdated}
        </p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </header>
);
