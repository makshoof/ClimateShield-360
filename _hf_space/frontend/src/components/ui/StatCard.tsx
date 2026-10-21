import React from 'react';
import { Card } from './Card';
import { SafeValue } from './SafeValue';

interface StatCardProps {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  hint?: string;
  low?: number | null;
  high?: number | null;
  icon?: string;
  accent?: 'brand' | 'heat' | 'rain' | 'none';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  hint,
  low,
  high,
  icon,
  accent = 'none',
}) => {
  const accentClass =
    accent === 'heat'
      ? 'text-[rgb(var(--cs-heat))]'
      : accent === 'rain'
        ? 'text-[rgb(var(--cs-rain))]'
        : accent === 'brand'
          ? 'text-[rgb(var(--cs-accent))]'
          : 'text-on-surface';

  return (
    <Card hairline hover className="flex flex-col justify-between min-h-[112px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {icon && (
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-3xl font-bold font-mono tabular-nums ${accentClass}`}>
          <SafeValue value={value} />
        </span>
        {unit && <span className="text-xs text-on-surface-variant">{unit}</span>}
      </div>
      {(low != null || high != null) && (
        <p className="mt-1 text-[11px] font-mono text-on-surface-variant tabular-nums">
          Interval <SafeValue value={low} />–<SafeValue value={high} />
        </p>
      )}
      {hint && <p className="mt-1 text-[11px] text-on-surface-variant">{hint}</p>}
    </Card>
  );
};
