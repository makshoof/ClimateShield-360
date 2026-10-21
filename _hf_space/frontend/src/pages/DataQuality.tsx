import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api, formatPKT } from '../api/client';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import { QualityLog } from '../types';

interface DataQualityProps {
  isSample?: boolean;
}

type SortField = 'logged_at' | 'source_name' | 'action' | 'rows_affected';
type SortOrder = 'asc' | 'desc';

export const DataQuality: React.FC<DataQualityProps> = ({ isSample = true }) => {
  // Filter state
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const pageSize = 10;

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('logged_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Issue Detail Drawer State (Read-only)
  const [activeDrawerItem, setActiveDrawerItem] = useState<QualityLog | null>(null);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDrawerItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 1. Fetch Quality Summary
  const { data: summaryResponse, refetch: refetchSummary } = useQuery({
    queryKey: ['quality-summary'],
    queryFn: api.getQualitySummary,
    refetchInterval: 30000,
  });

  // 2. Fetch Paginated Decisions
  const {
    data: decisionsResponse,
    isLoading: loadingDecisions,
    refetch: refetchDecisions,
  } = useQuery({
    queryKey: ['quality-decisions', selectedAction, selectedSource, page, pageSize],
    queryFn: () =>
      api.getQualityDecisions({
        action: selectedAction !== 'all' ? selectedAction : undefined,
        source: selectedSource || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    refetchInterval: 30000,
  });

  // 3. Fetch Daily Counts for Stacked Bar Chart
  const { data: dailyResponse, isLoading: loadingDaily } = useQuery({
    queryKey: ['quality-daily'],
    queryFn: api.getQualityDaily,
    refetchInterval: 60000,
  });

  const summary = summaryResponse?.data;
  const decisionsData = decisionsResponse?.data;
  const rawItems = decisionsData?.items || [];
  const totalItems = decisionsData?.total || 0;
  const availableSources = decisionsData?.sources || [];
  const dailyData = dailyResponse?.data || [];

  // Client-side text search filter and sort
  const filteredAndSortedItems = useMemo(() => {
    let list = [...rawItems];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.source_name.toLowerCase().includes(q) ||
          item.rule.toLowerCase().includes(q) ||
          item.explanation.toLowerCase().includes(q) ||
          (item.column && item.column.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'logged_at') {
        cmp = new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime();
      } else if (sortField === 'source_name') {
        cmp = a.source_name.localeCompare(b.source_name);
      } else if (sortField === 'action') {
        cmp = a.action.localeCompare(b.action);
      } else if (sortField === 'rows_affected') {
        cmp = a.rows_affected - b.rows_affected;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [rawItems, searchQuery, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleRefreshAll = () => {
    refetchSummary();
    refetchDecisions();
  };

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* Sample Data Banner (Rule 2) */}
      <SampleBanner isSample={isSample} />

      {/* ============================================================ */}
      {/* SECTION 1: HEADER & OPERATIONAL AUDIT STRIP                  */}
      {/* ============================================================ */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md pb-space-sm border-b border-outline-variant/30">
        <div className="flex flex-col max-w-4xl min-w-0">
          <div className="flex items-center gap-space-sm mb-space-xs flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-mono text-[11px] uppercase tracking-wider font-semibold">
              Quality Assurance Center
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
              {summary ? `${summary.sources_audited} Telemetry Sources Audited` : 'Active Auditing'}
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-mono text-[11px] border border-outline-variant/30">
              Read-Only Audit Trail (Rule 11)
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Data Quality Center &amp; Decision Ledger
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Automated integrity auditing, synthetic fill tracking, physical range clamps, and logical exclusion governance across all meteorological &amp; geospatial layers.
          </p>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center gap-space-sm shrink-0">
          <div className="flex items-center gap-space-xs px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline-variant/30 font-mono text-xs">
            <span className="material-symbols-outlined text-[18px] text-secondary">verified_user</span>
            <span className="font-semibold">DuckDB View: <span className="text-on-surface-variant">quality_log</span></span>
          </div>
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-space-xs px-3 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-all shadow-sm font-mono text-xs font-semibold uppercase tracking-wider"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            <span>Refresh Ledger</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: METRICS COCKPIT: TOTAL RECORDS, MISSING, DUP, EXCL */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* Metric 1: Total Records Inspected */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Total Records Inspected
              </span>
              <span className="material-symbols-outlined text-secondary text-[18px]">fact_check</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-metric-display text-metric-display text-on-surface tabular-nums">
                {summary ? summary.total_records_inspected.toLocaleString() : '665,888'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                records
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1">
              Evaluated across weather hourly observations, district tables, and GIS points.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-mono text-[11px]">
            <span className="text-on-surface-variant">Integrity Pass Rate</span>
            <span className="font-bold text-[#059669]">
              {summary ? `${summary.pass_rate_pct}%` : '99.8%'}
            </span>
          </div>
        </div>

        {/* Metric 2: Missing Count */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[11px] text-[#B45309] uppercase tracking-wider font-semibold">
                Missing Values Detected
              </span>
              <span className="material-symbols-outlined text-[#B45309] text-[18px]">find_in_page</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-metric-display text-metric-display text-on-surface tabular-nums">
                {summary ? summary.missing_count.toLocaleString() : '655,485'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                rows / cells
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1">
              Null sensor packets, dry-hour zeros, and temporal coverage truncations logged.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-mono text-[11px]">
            <span className="text-on-surface-variant">Rule Audit</span>
            <span className="text-[#B45309] font-bold">Never Invent Heat/Rain</span>
          </div>
        </div>

        {/* Metric 3: Duplicate Count */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[11px] text-secondary uppercase tracking-wider font-semibold">
                Duplicate Counts
              </span>
              <span className="material-symbols-outlined text-secondary text-[18px]">content_copy</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-metric-display text-metric-display text-on-surface tabular-nums">
                {summary ? summary.duplicate_count.toLocaleString() : '960'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                rows
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1">
              Redundant ADM_PCODE key copies and duplicate coordinates de-duplicated.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-mono text-[11px]">
            <span className="text-on-surface-variant">Resolution</span>
            <span className="font-bold text-secondary">Canonical Joins</span>
          </div>
        </div>

        {/* Metric 4: Excluded Count */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[11px] text-error uppercase tracking-wider font-semibold">
                Excluded Records / Columns
              </span>
              <span className="material-symbols-outlined text-error text-[18px]">block</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-metric-display text-metric-display text-on-surface tabular-nums">
                {summary ? summary.excluded_count.toLocaleString() : '320'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                rows / 12 cols
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1">
              Unmapped crop-flood columns and isolated anomaly features excluded from gold.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-mono text-[11px]">
            <span className="text-on-surface-variant">Action</span>
            <span className="font-bold text-error">Source Unavailable</span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: TRIAGE ACTION COUNTERS: FIX / FILL / FLAG / EXCLUDE */}
      {/* ============================================================ */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[18px]">checklist</span>
            Audit Action Breakdown: Fix · Fill · Flag · Exclude
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant">
            ISO-19157 Spatial Data Quality Standard
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm">
          {/* Action: Fix */}
          <div
            onClick={() => { setSelectedAction('fix'); setPage(0); }}
            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${
              selectedAction === 'fix'
                ? 'bg-secondary-fixed/30 border-secondary ring-2 ring-secondary/30'
                : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/30'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">build</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-secondary font-bold uppercase">Fix Count</span>
                <span className="text-[10px] text-on-surface-variant">(Certain)</span>
              </div>
              <span className="font-title-md text-title-md font-bold text-on-surface">
                {summary ? summary.fix_count : 15}
              </span>
              <span className="text-[10px] text-on-surface-variant truncate">Clamps, UTC, Units</span>
            </div>
          </div>

          {/* Action: Fill */}
          <div
            onClick={() => { setSelectedAction('fill'); setPage(0); }}
            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${
              selectedAction === 'fill'
                ? 'bg-secondary-container/40 border-secondary-container ring-2 ring-secondary/30'
                : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/30'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-on-secondary-container font-bold uppercase">Fill Count</span>
                <span className="text-[10px] text-on-surface-variant">(Imputed)</span>
              </div>
              <span className="font-title-md text-title-md font-bold text-on-surface">
                {summary ? summary.fill_count : 1}
              </span>
              <span className="text-[10px] text-on-surface-variant truncate">Short gaps &le;6h only</span>
            </div>
          </div>

          {/* Action: Flag */}
          <div
            onClick={() => { setSelectedAction('flag'); setPage(0); }}
            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${
              selectedAction === 'flag'
                ? 'bg-error-container/50 border-error ring-2 ring-error/30'
                : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/30'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-error text-on-error flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">flag</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-error font-bold uppercase">Flag Count</span>
                <span className="text-[10px] text-on-surface-variant">(Warning)</span>
              </div>
              <span className="font-title-md text-title-md font-bold text-on-surface">
                {summary ? summary.flag_count : 31}
              </span>
              <span className="text-[10px] text-on-surface-variant truncate">Quarantined records</span>
            </div>
          </div>

          {/* Action: Exclude / Keep */}
          <div
            onClick={() => { setSelectedAction('exclude'); setPage(0); }}
            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${
              selectedAction === 'exclude'
                ? 'bg-surface-container-high border-outline ring-2 ring-outline/30'
                : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/30'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-surface-container-highest text-on-surface flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">block</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-on-surface font-bold uppercase">Exclude Count</span>
                <span className="text-[10px] text-on-surface-variant">(Filtered)</span>
              </div>
              <span className="font-title-md text-title-md font-bold text-on-surface">
                {summary ? summary.exclude_count : 13}
              </span>
              <span className="text-[10px] text-on-surface-variant truncate">Excluded from joins</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 4: STACKED DAILY AGGREGATION CHART                   */}
      {/* ============================================================ */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div>
            <h2 className="font-title-md text-title-md text-on-surface font-semibold">
              Daily Triage Actions by Category (Timeline Verification)
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Chronological daily stacked volume of deterministic fixes, synthetic interpolations, and quarantine flags.
            </p>
          </div>
          <div className="flex items-center gap-space-sm font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#006398]"></span>
              <span>Fixed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#5bb8fe]"></span>
              <span>Filled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#ba1a1a]"></span>
              <span>Flagged</span>
            </div>
          </div>
        </div>

        {loadingDaily ? (
          <div className="h-48 flex items-center justify-center font-mono text-xs text-on-surface-variant">
            Loading daily quality telemetry...
          </div>
        ) : dailyData.length === 0 ? (
          <div className="h-48 flex items-center justify-center font-mono text-xs text-on-surface-variant">
            No daily logs recorded in warehouse
          </div>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--cs-outline-variant))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: 'rgb(var(--cs-on-surface-variant))' }}
                  tickFormatter={(val) => {
                    const parts = val.split('-');
                    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: 'rgb(var(--cs-on-surface-variant))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgb(var(--cs-surface-container-lowest))',
                    color: 'rgb(var(--cs-on-surface))',
                    border: '1px solid rgb(var(--cs-outline-variant))',
                    borderRadius: '8px',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono', color: 'rgb(var(--cs-on-surface-variant))' }} />
                <Bar dataKey="fix" name="Auto-Fixed" stackId="a" fill="#006398" />
                <Bar dataKey="fill" name="Imputed (Fill)" stackId="a" fill="#5bb8fe" />
                <Bar dataKey="flag" name="Quarantined (Flag)" stackId="a" fill="#ba1a1a" />
                <Bar dataKey="exclude" name="Excluded" stackId="a" fill="#605d64" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION 5: DECISION TABLE FROM quality_log (READ-ONLY)       */}
      {/* ============================================================ */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30 flex flex-col">
        {/* Table Filter Toolbar */}
        <div className="p-space-md bg-surface-container-low flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md border-b border-outline-variant/30">
          <div className="flex flex-wrap items-center gap-space-sm flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined text-outline absolute left-3 top-2.5 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rule, column, source, explanation..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-xs border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>

            {/* Action Pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { key: 'all', label: 'All Decisions' },
                { key: 'fix', label: 'Fixed' },
                { key: 'fill', label: 'Filled' },
                { key: 'flag', label: 'Flagged' },
                { key: 'exclude', label: 'Excluded' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setSelectedAction(tab.key);
                    setPage(0);
                  }}
                  className={`px-3 py-1 rounded-full font-mono text-[11px] font-semibold transition-colors ${
                    selectedAction === tab.key
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Source Dropdown */}
            <div className="relative">
              <select
                value={selectedSource}
                onChange={(e) => {
                  setSelectedSource(e.target.value);
                  setPage(0);
                }}
                className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-mono text-[11px] border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary"
              >
                <option value="">All Stream Sources ({availableSources.length})</option>
                {availableSources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reset Filters / Clear */}
          {(selectedAction !== 'all' || selectedSource || searchQuery) && (
            <button
              onClick={() => {
                setSelectedAction('all');
                setSelectedSource('');
                setSearchQuery('');
                setPage(0);
              }}
              className="text-secondary font-mono text-xs hover:underline flex items-center gap-1 shrink-0"
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Audit Decisions Table */}
        {loadingDecisions ? (
          <div className="p-space-xl text-center font-mono text-xs text-on-surface-variant">
            Loading triage decisions from DuckDB quality_log...
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <EmptyState
            icon="verified_user"
            title="No Quality Decisions Match Criteria"
            description="No audit logs found for the selected action and source filter in quality_log."
            actionText="Clear Filters"
            onAction={() => {
              setSelectedAction('all');
              setSelectedSource('');
              setSearchQuery('');
              setPage(0);
            }}
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container font-mono text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/30">
                <tr>
                  <th
                    onClick={() => handleSort('logged_at')}
                    className="py-3 px-space-md w-44 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Logged (PKT)</span>
                      {sortField === 'logged_at' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('source_name')}
                    className="py-3 px-space-md w-52 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Source Stream</span>
                      {sortField === 'source_name' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-space-md" scope="col">
                    Rule Triggered
                  </th>
                  <th
                    onClick={() => handleSort('action')}
                    className="py-3 px-space-md w-28 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Action</span>
                      {sortField === 'action' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('rows_affected')}
                    className="py-3 px-space-md w-24 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Rows</span>
                      {sortField === 'rows_affected' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-space-md" scope="col">
                    Triage Explanation
                  </th>
                  <th className="py-3 px-space-md w-24 text-center" scope="col">
                    Inspection
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm text-on-surface">
                {filteredAndSortedItems.map((item, index) => {
                  const act = item.action.toLowerCase();
                  const isFlag = act === 'flag';
                  const isFill = act === 'fill';
                  const isExclude = act === 'exclude' || act === 'keep';
                  const isFix = act === 'fix';

                  return (
                    <tr
                      key={`${item.source_name}-${item.logged_at}-${index}`}
                      onClick={() => setActiveDrawerItem(item)}
                      className="group hover:bg-surface-container-low/70 transition-colors cursor-pointer"
                    >
                      {/* Timestamp in PKT (Rule 3) */}
                      <td className="py-3.5 px-space-md font-mono text-xs whitespace-nowrap">
                        <span className="font-semibold text-on-surface">
                          {formatPKT(item.logged_at, { second: '2-digit' })}
                        </span>
                      </td>

                      {/* Source Stream */}
                      <td className="py-3.5 px-space-md font-mono text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold text-on-surface truncate max-w-[200px]" title={item.source_name}>
                            {item.source_name}
                          </span>
                          {item.column && (
                            <span className="text-[10px] text-on-surface-variant truncate">
                              col: {item.column}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Rule Triggered */}
                      <td className="py-3.5 px-space-md">
                        <span className="font-mono text-xs text-primary font-bold">
                          {item.rule}
                        </span>
                      </td>

                      {/* Action Badge */}
                      <td className="py-3.5 px-space-md">
                        {isFlag && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-mono text-[11px] font-bold border border-error/30">
                            <span className="material-symbols-outlined text-[13px]">flag</span>
                            FLAG
                          </span>
                        )}
                        {isFill && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container/40 text-on-secondary-container font-mono text-[11px] font-bold border border-secondary/30">
                            <span className="material-symbols-outlined text-[13px]">tune</span>
                            FILL
                          </span>
                        )}
                        {isFix && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-mono text-[11px] font-bold border border-secondary/20">
                            <span className="material-symbols-outlined text-[13px]">build</span>
                            FIX
                          </span>
                        )}
                        {isExclude && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-mono text-[11px] font-bold border border-outline-variant/30">
                            <span className="material-symbols-outlined text-[13px]">block</span>
                            EXCLUDE
                          </span>
                        )}
                      </td>

                      {/* Rows Affected */}
                      <td className="py-3.5 px-space-md font-mono text-xs">
                        <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                          {item.rows_affected}
                        </span>
                      </td>

                      {/* Explanation preview */}
                      <td className="py-3.5 px-space-md max-w-md">
                        <p className="text-on-surface-variant text-xs truncate" title={item.explanation}>
                          {item.explanation}
                        </p>
                      </td>

                      {/* Inspect Button / Drawer Trigger */}
                      <td className="py-3.5 px-space-md text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDrawerItem(item);
                          }}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors font-mono text-[11px] font-semibold flex items-center justify-center gap-1 border border-outline-variant/30"
                        >
                          <span>View</span>
                          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-space-sm bg-surface-container-low flex items-center justify-between border-t border-outline-variant/30 font-mono text-xs">
          <span className="text-on-surface-variant">
            Showing Page <strong>{page + 1}</strong> of <strong>{totalPages}</strong> ({totalItems} total decision events)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded bg-surface-container text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high font-semibold transition-colors"
              type="button"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded bg-surface-container text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high font-semibold transition-colors"
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 6: ISSUE DETAIL DRAWER (BEFORE & AFTER VALUES)       */}
      {/* ============================================================ */}
      {activeDrawerItem && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveDrawerItem(null)}
            aria-hidden="true"
          />

          {/* Slide-over Drawer Container */}
          <div className="relative w-full max-w-xl bg-surface-container-lowest h-full shadow-2xl border-l border-outline-variant/40 flex flex-col justify-between overflow-y-auto z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-space-md sm:p-space-lg border-b border-outline-variant/30 flex items-start justify-between bg-surface-container-low">
              <div className="flex flex-col gap-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-surface-container-high font-mono text-[10px] font-bold text-on-surface uppercase border border-outline-variant/30">
                    Audit Decision Detail
                  </span>
                  <span className="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-mono text-[10px] font-bold">
                    Read-Only (Rule 11)
                  </span>
                </div>
                <h3 className="font-title-lg text-title-md font-bold text-on-surface mt-1 break-words">
                  {activeDrawerItem.rule}
                </h3>
                <span className="font-mono text-xs text-on-surface-variant">
                  Source: <strong>{activeDrawerItem.source_name}</strong>
                </span>
              </div>
              <button
                onClick={() => setActiveDrawerItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                aria-label="Close detail drawer"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Drawer Body Content */}
            <div className="p-space-md sm:p-space-lg flex flex-col gap-space-md flex-1">
              {/* Status & Scope Pill Matrix */}
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase">Triage Action</span>
                  <span className="font-bold text-on-surface uppercase mt-0.5 flex items-center gap-1">
                    {activeDrawerItem.action === 'flag' && <span className="w-2 h-2 rounded-full bg-error inline-block"></span>}
                    {activeDrawerItem.action === 'fix' && <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>}
                    {activeDrawerItem.action === 'fill' && <span className="w-2 h-2 rounded-full bg-secondary-container inline-block"></span>}
                    {activeDrawerItem.action}
                  </span>
                </div>
                <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase">Rows Affected</span>
                  <span className="font-bold text-on-surface mt-0.5">
                    {activeDrawerItem.rows_affected} rows
                  </span>
                </div>
                <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase">Logged Time (PKT)</span>
                  <span className="font-semibold text-on-surface mt-0.5">
                    {formatPKT(activeDrawerItem.logged_at)}
                  </span>
                </div>
                <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase">Target Column</span>
                  <span className="font-semibold text-on-surface truncate mt-0.5" title={activeDrawerItem.column || 'All table columns'}>
                    {activeDrawerItem.column || 'Whole Record / Table'}
                  </span>
                </div>
              </div>

              {/* BEFORE AND AFTER VALUES VISUAL DIFF CARD */}
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-md shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
                  <span className="font-mono text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary text-[16px]">compare_arrows</span>
                    Telemetry State Comparison: Before vs After
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {activeDrawerItem.before_value ? 'Value Transformed' : 'Audit Marker'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                  {/* Before Value Box */}
                  <div className="bg-error-container/20 rounded-lg p-3 border border-error/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-error font-mono text-[11px] font-bold uppercase mb-1">
                        <span className="material-symbols-outlined text-[14px]">history</span>
                        <span>Before Value / Anomaly</span>
                      </div>
                      <div className="font-mono text-xs font-bold text-on-surface break-words bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                        {activeDrawerItem.before_value || 'Raw un-normalized sensor payload'}
                      </div>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-mono mt-2">
                      Original state prior to automated rule execution.
                    </span>
                  </div>

                  {/* After Value Box */}
                  <div className="bg-[#ECFDF5]/50 rounded-lg p-3 border border-[#A7F3D0] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-[#059669] font-mono text-[11px] font-bold uppercase mb-1">
                        <span className="material-symbols-outlined text-[14px]">done_all</span>
                        <span>After Value / Corrected</span>
                      </div>
                      <div className="font-mono text-xs font-bold text-on-surface break-words bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                        {activeDrawerItem.after_value || 'Normalized, verified, or quarantined state'}
                      </div>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-mono mt-2">
                      Sanitized state stored in downstream warehouse tables.
                    </span>
                  </div>
                </div>
              </div>

              {/* Triage Explanation Card */}
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-space-md flex flex-col gap-2">
                <span className="font-mono text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-[16px]">description</span>
                  Triage Explanation &amp; Scientific Rationale
                </span>
                <p className="font-body-md text-sm text-on-surface leading-relaxed">
                  {activeDrawerItem.explanation}
                </p>
                {activeDrawerItem.details && (
                  <div className="mt-2 pt-2 border-t border-outline-variant/20 font-mono text-xs text-on-surface-variant bg-surface-container p-2.5 rounded border border-outline-variant/20">
                    <span className="text-[10px] text-on-surface uppercase font-bold block mb-1">
                      Engine Execution Output:
                    </span>
                    {activeDrawerItem.details}
                  </div>
                )}
              </div>

              {/* Rule & Governance Policy */}
              <div className="p-space-sm rounded-lg bg-surface-container-low border border-outline-variant/20 flex items-start gap-2 text-on-surface-variant font-body-sm text-xs">
                <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">
                  verified
                </span>
                <div>
                  <strong className="text-on-surface">Data Quality Policy:</strong>{' '}
                  This record is immutable evidence generated during warehouse transformation. In accordance with Rule 11, this interface is strictly read-only.
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-space-md border-t border-outline-variant/30 bg-surface-container-low flex items-center justify-between">
              <span className="font-mono text-[11px] text-on-surface-variant">
                Record Hash: #{activeDrawerItem.rule.slice(0, 12)}
              </span>
              <button
                onClick={() => setActiveDrawerItem(null)}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs font-semibold transition-colors"
                type="button"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 7: MANDATORY FOOTER (RULE 6)                         */}
      {/* ============================================================ */}
      <footer className="w-full py-4 px-space-md rounded-xl bg-surface-container-low text-center border border-outline-variant/30 text-on-surface-variant font-body-sm text-xs">
        <p>Information only, not professional advice. In an emergency contact official services.</p>
      </footer>
    </div>
  );
};
