import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatPKT, formatRelativeMinutes } from '../api/client';
import { MetaData } from '../types';

const HOUR_MS = 60 * 60 * 1000;

function nextHourlySlot(lastIso: string | null, scheduledIso: string | null, now: number): number | null {
  if (scheduledIso) {
    const scheduled = Date.parse(scheduledIso);
    if (!Number.isNaN(scheduled) && scheduled > now) return scheduled;
  }
  if (!lastIso) return null;
  const start = Date.parse(lastIso);
  if (Number.isNaN(start)) return null;
  if (now < start) return start + HOUR_MS;
  const steps = Math.floor((now - start) / HOUR_MS) + 1;
  return start + steps * HOUR_MS;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export const HourlyUpdateCountdown: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: (query) =>
      query.state.data?.data?.status_indicator === 'late' ||
      query.state.data?.data?.status_indicator === 'failed'
        ? 15000
        : 30000,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const status = data?.data;
  const lastIso =
    status?.latest_successful_run?.finished_at ??
    status?.latest_successful_run?.started_at ??
    null;
  const scheduledIso = status?.next_scheduled_run?.next_run_utc ?? null;
  const target = nextHourlySlot(lastIso, scheduledIso, now);
  const late = status?.status_indicator === 'late' || status?.status_indicator === 'failed';
  const clock = target == null ? null : formatCountdown(target - now);
  const title = lastIso
    ? `Weather ingest is on a 60-minute cycle from the last successful run (${formatPKT(lastIso)}). ${
        late
          ? 'That run is already late, so this is the next clock slot, not confirmation that a fetch is in progress.'
          : 'The status chip turns late if a successful run is more than 90 minutes old.'
      }`
    : 'No successful hourly run is stored, so there is no countdown anchor.';

  return (
    <div
      className={`min-h-[44px] flex items-center gap-1.5 px-2.5 rounded-xl border font-mono text-[11px] shrink-0 ${
        late
          ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/40'
          : 'bg-surface-container/70 dark:bg-surface-container-high/60 text-on-surface border-outline-variant/30'
      }`}
      title={title}
      role="timer"
      aria-live="off"
      aria-label={clock ? `Hourly data updates in ${clock}` : 'Hourly update countdown unavailable'}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        update
      </span>
      <span className="hidden sm:inline font-semibold">Updates in</span>
      <span className="tabular-nums font-bold tracking-tight">
        {isLoading && clock == null ? '—' : clock ?? '—'}
      </span>
    </div>
  );
};

interface StatusBarProps {
  meta?: MetaData | null;
  isLoading?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ meta }) => {
  const { data: statusResponse, isLoading } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: (query) =>
      query.state.data?.data?.status_indicator === 'late' ||
      query.state.data?.data?.status_indicator === 'failed'
        ? 15000
        : 30000,
  });

  const statusData = statusResponse?.data;
  const lastSuccessIso =
    statusData?.latest_successful_run?.finished_at ||
    statusData?.latest_successful_run?.started_at;
  const lastSuccessTime = lastSuccessIso
    ? formatPKT(lastSuccessIso, { second: undefined })
    : '—';

  const relTime = statusData?.minutes_since_last_success !== undefined && statusData.minutes_since_last_success !== null
    ? `(${formatRelativeMinutes(statusData.minutes_since_last_success)})`
    : '';

  const indicator = statusData?.status_indicator || 'ok';
  const quality = statusData?.quality_summary;

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
      role="status"
      aria-label="Pipeline Telemetry Status"
    >
      {/* Execution Status Chip */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container dark:bg-surface-container-high border border-outline-variant/30 text-on-surface shadow-xs shrink-0 text-xs">
        {indicator === 'ok' && (
          <span className="flex h-2 w-2 relative" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#059669] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#059669]" />
          </span>
        )}
        {indicator === 'late' && (
          <span className="w-2 h-2 rounded-full bg-[#B45309] animate-pulse" aria-hidden="true" />
        )}
        {indicator === 'failed' && (
          <span className="w-2 h-2 rounded-full bg-[#B91C1C]" aria-hidden="true" />
        )}

        <span className="font-mono text-[11px] font-medium tracking-tight whitespace-nowrap">
          {isLoading ? (
            'Syncing status...'
          ) : (
            <>
              Last run: <span className="font-semibold">{lastSuccessTime}</span>{' '}
              <span className="text-on-surface-variant hidden sm:inline">{relTime}</span> · Status:{' '}
              {indicator === 'ok' && <span className="text-[#059669] font-bold">OK</span>}
              {indicator === 'late' && <span className="text-[#B45309] font-bold">LATE</span>}
              {indicator === 'failed' && <span className="text-[#B91C1C] font-bold">FAILED</span>}
            </>
          )}
        </span>
      </div>

      {/* Quality Summary Pill from API */}
      {quality && (quality.total_actions > 0 || quality.rules_audited > 0) && (
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container dark:bg-surface-container-high border border-outline-variant/30 font-mono text-[11px] text-on-surface shrink-0"
          title={`Rules Audited: ${quality.rules_audited} | Actions: ${quality.fix} fixes, ${quality.fill} fills, ${quality.flag} flags`}
        >
          <span className="material-symbols-outlined text-[15px] text-secondary shrink-0" aria-hidden="true">
            verified_user
          </span>
          <span className="text-on-surface-variant hidden sm:inline">Quality:</span>
          {quality.fix > 0 && <span className="font-semibold text-secondary">{quality.fix} fix</span>}
          {quality.fill > 0 && <span className="font-semibold text-secondary">· {quality.fill} fill</span>}
          {quality.flag > 0 && <span className="font-semibold text-amber-500">· {quality.flag} flag</span>}
        </div>
      )}

      {/* Timezone Info from Meta API */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high/60 dark:bg-surface-container-highest/40 font-mono text-[10px] text-on-surface-variant shrink-0">
        <span className="material-symbols-outlined text-[14px]">schedule</span>
        <span>{meta?.timezone_display || 'PKT (UTC+5)'}</span>
      </div>

    </div>
  );
};
