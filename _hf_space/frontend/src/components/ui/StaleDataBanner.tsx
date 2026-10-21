import React from 'react';
import { Badge } from './Badge';

interface StaleDataBannerProps {
  asOf?: string | null;
  expected?: string;
  tone?: 'Late' | 'Stale';
}

export const StaleDataBanner: React.FC<StaleDataBannerProps> = ({
  asOf,
  expected,
  tone = 'Stale',
}) => (
  <div
    role="status"
    className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
  >
    <Badge tone="warn">{tone}</Badge>
    <span>
      This block is older than its expected refresh
      {expected ? ` (${expected})` : ''}.
      {asOf ? ` Last as of ${asOf}.` : ''}
    </span>
  </div>
);
