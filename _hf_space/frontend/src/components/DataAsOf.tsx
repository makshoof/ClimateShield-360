import React, { useEffect, useState } from 'react';
import { formatPKT } from '../api/client';

interface DataAsOfProps {
  timestamp?: string | Date | null;
  className?: string;
  prefix?: string;
  compact?: boolean;
}

export const DataAsOf: React.FC<DataAsOfProps> = ({
  timestamp,
  className = '',
  prefix = 'Updated',
  compact = false,
}) => {
  // Tick every 30 seconds to recalculate relative age without refetching network API
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 30000); // 30 seconds local tick
    return () => clearInterval(timer);
  }, []);

  if (!timestamp) {
    return (
      <span className={`inline-flex items-center gap-1 font-mono-val text-xs text-slate-500 ${className}`}>
        <span className="material-symbols-outlined text-[13px] opacity-70">schedule</span>
        <span>Data time unavailable</span>
      </span>
    );
  }

  const dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - dt.getTime()) / 60000));

  // Time in PKT (UTC+5)
  const pktTimeStr = formatPKT(dt.toISOString(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const relativeText =
    diffMinutes < 1
      ? 'just now'
      : diffMinutes === 1
      ? '1 min ago'
      : diffMinutes < 60
      ? `${diffMinutes} min ago`
      : `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m ago`;

  const displayText = compact
    ? `${relativeText} (${pktTimeStr})`
    : `${prefix} ${relativeText} (${pktTimeStr})`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono-val text-xs text-slate-400 select-none ${className}`}
      title={`Stored in UTC: ${typeof timestamp === 'string' ? timestamp : timestamp.toISOString()} | Displayed in PKT: ${pktTimeStr}`}
    >
      <span className="material-symbols-outlined text-[14px] text-cyan-400 shrink-0">
        schedule
      </span>
      <span>{displayText}</span>
    </span>
  );
};
