import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../api/client';
import { SampleBanner } from '../components/SampleBanner';
import { RiskBadge } from '../components/RiskBadge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ImpactDomainData, RiskLevel } from '../types';

interface EightImpactsProps {
  isSample?: boolean;
}

interface TabDef {
  id: string;
  label: string;
  domainNo: string;
  icon: string;
  expectedEvidence: 'measured' | 'indicator-based' | 'limited';
}

const TABS: TabDef[] = [
  { id: 'physical', label: 'Physical', domainNo: '01', icon: 'domain', expectedEvidence: 'measured' },
  { id: 'environmental', label: 'Environmental', domainNo: '02', icon: 'forest', expectedEvidence: 'measured' },
  { id: 'producers', label: 'Producers', domainNo: '03', icon: 'storefront', expectedEvidence: 'limited' },
  { id: 'economic', label: 'Economic', domainNo: '04', icon: 'account_balance', expectedEvidence: 'limited' },
  { id: 'public_health', label: 'Public Health', domainNo: '05', icon: 'local_hospital', expectedEvidence: 'indicator-based' },
  { id: 'infrastructure', label: 'Infrastructure', domainNo: '06', icon: 'alt_route', expectedEvidence: 'indicator-based' },
  { id: 'social', label: 'Social', domainNo: '07', icon: 'groups', expectedEvidence: 'indicator-based' },
  { id: 'emergency_response', label: 'Emergency Response', domainNo: '08', icon: 'emergency', expectedEvidence: 'indicator-based' },
];

const KARACHI_DISTRICTS = [
  { id: '', name: 'All Karachi Districts (Consolidated)' },
  { id: 'PK702', name: 'Karachi Central (PK702)' },
  { id: 'PK704', name: 'Karachi East (PK704)' },
  { id: 'PK712', name: 'Korangi Karachi (PK712)' },
  { id: 'PK714', name: 'Malir Karachi (PK714)' },
  { id: 'PK721', name: 'Karachi South (PK721)' },
  { id: 'PK729', name: 'Karachi West & Keamari (PK729)' },
];

export const EightImpacts: React.FC<EightImpactsProps> = ({ isSample = true }) => {
  const [activeTabId, setActiveTabId] = useState<string>('physical');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('Karachi');

  // Query impact domain data for active tab
  const {
    data: domainResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['impact-domain', activeTabId, selectedCity, selectedDistrict],
    queryFn: () =>
      api.getImpactDomain(activeTabId, {
        city: selectedCity,
        district_id: selectedDistrict || undefined,
      }),
  });

  const domainData: ImpactDomainData | undefined = domainResponse?.data;
  const isApiSample = domainResponse?.is_sample ?? isSample;

  const activeTabDef = TABS.find((t) => t.id === activeTabId) || TABS[0];

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      <SampleBanner isSample={isApiSample} />

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-outline-variant/30 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-label-mono-sm text-label-mono-sm uppercase tracking-wider text-secondary font-bold">
              KMC-PDMA Operational Framework
            </span>
            <span className="text-outline-variant font-label-mono-sm">/</span>
            <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
              Protocol Ref: 2024-IMPACT-08
            </span>
          </div>
          <h1 className="font-headline-xl text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
            Eight-Impact Analysis Matrix
          </h1>
          <p className="font-body-md text-sm sm:text-base text-on-surface-variant max-w-4xl">
            Multi-sectoral situational appraisal evaluating empirical exposure, structural assets, critical
            infrastructure, and human vulnerability across all 18 Karachi municipal zones.
          </p>
        </div>

        {/* Location & District Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-lg border border-outline-variant/40">
            <span className="material-symbols-outlined text-[18px] text-secondary">location_city</span>
            <select
              aria-label="Filter by City"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-transparent text-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="Karachi">Karachi Division</option>
              <option value="Lahore">Lahore</option>
              <option value="Rawalpindi">Rawalpindi</option>
              <option value="Islamabad">Islamabad</option>
              <option value="Faisalabad">Faisalabad</option>
              <option value="Multan">Multan</option>
              <option value="Peshawar">Peshawar</option>
              <option value="Quetta">Quetta</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Sukkur">Sukkur</option>
              <option value="Gilgit">Gilgit</option>
              <option value="Gwadar">Gwadar</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/40">
            <span className="material-symbols-outlined text-[18px] text-secondary">domain</span>
            <select
              aria-label="Filter by District"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="bg-transparent text-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              {KARACHI_DISTRICTS.map((dist) => (
                <option key={dist.id} value={dist.id}>
                  {dist.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Scientific Notice & Methodology Banner */}
      <div className="relative overflow-hidden rounded-xl bg-surface-container p-4 lg:p-5 shadow-sm border border-secondary/20">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary"></div>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pl-2">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <span className="material-symbols-outlined text-[24px]">science</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-title-md text-sm sm:text-base text-primary dark:text-secondary-fixed-dim font-bold">
                  SCIENTIFIC NOTICE &amp; METHODOLOGY CLASSIFICATION
                </span>
                <span className="font-label-mono-sm text-xs px-2.5 py-0.5 rounded-full bg-secondary text-on-secondary uppercase font-semibold">
                  Peer-Reviewed Operational Caveat
                </span>
              </div>
              <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                Only the primary atmospheric hazard forecast (Heat Index &amp; Monsoon Precipitation totals) is
                generated via numerical predictive models (ECMWF &amp; PMD WRF). The <span className="font-semibold text-on-surface">8 domain impacts below</span> are computed via empirical vulnerability indicators, baseline census cross-matching, and historical damage transfer functions. <span className="font-semibold text-error">Always evaluate evidence strength badges before dispatching capital, civil defense, or emergency equipment.</span>
              </p>
            </div>
          </div>
          <div className="flex lg:flex-col items-center lg:items-end gap-1 shrink-0 bg-surface-container-lowest/80 px-3 py-2 rounded-lg border border-outline-variant/30">
            <span className="font-label-mono-sm text-xs text-on-surface-variant">Framework Version</span>
            <span className="font-label-mono-md text-xs font-bold text-on-surface">NDMA-SINDH-v4.2</span>
          </div>
        </div>
      </div>

      {/* Eight Tabs Navigation */}
      <div className="flex flex-col gap-2">
        <div
          role="tablist"
          aria-label="Eight Impact Domains"
          className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-outline-variant/40"
        >
          {TABS.map((tab) => {
            const isActive = activeTabId === tab.id;
            const evidencePillBg =
              tab.expectedEvidence === 'measured'
                ? 'bg-emerald-500'
                : tab.expectedEvidence === 'indicator-based'
                ? 'bg-amber-500'
                : 'bg-outline';

            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-t-lg font-title-md text-xs sm:text-sm transition-all whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'bg-surface-container text-primary font-bold border-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border-transparent'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`w-2 h-2 rounded-full ${evidencePillBg}`}
                  title={`Evidence type: ${tab.expectedEvidence}`}
                ></span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panel Content */}
      <div
        role="tabpanel"
        id={`panel-${activeTabId}`}
        aria-labelledby={`tab-${activeTabId}`}
        className="flex flex-col gap-6"
      >
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
        )}

        {isError && (
          <EmptyState
            icon="error"
            title="Failed to Load Impact Domain Data"
            description={error instanceof Error ? error.message : 'DuckDB warehouse connection interrupted.'}
            actionText="Retry Query"
            onAction={() => refetch()}
          />
        )}

        {domainData && (
          <div className="flex flex-col gap-6">
            {/* Top Domain Summary Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0 shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">{activeTabDef.icon}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-label-mono-sm text-xs text-on-surface-variant font-semibold">
                      DOMAIN {activeTabDef.domainNo}
                    </span>
                    <span className="text-outline-variant">·</span>
                    <span className="font-label-mono-sm text-xs text-secondary font-medium uppercase">
                      Sector Protocol
                    </span>
                  </div>
                  <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface truncate">
                    {domainData.title}
                  </h2>
                </div>
              </div>

              {/* Badges: Evidence Level & Risk Tier */}
              <div className="flex items-center flex-wrap gap-2.5">
                {/* Evidence Level Badge */}
                {domainData.evidence_level === 'measured' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-label-mono-sm text-xs font-semibold border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Measured Evidence
                  </span>
                )}
                {domainData.evidence_level === 'indicator-based' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-label-mono-sm text-xs font-semibold border border-amber-500/20">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Indicator-Based Evidence
                  </span>
                )}
                {domainData.evidence_level === 'limited' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-mono-sm text-xs font-semibold border border-outline-variant">
                    <span className="material-symbols-outlined text-[14px]">block</span>
                    Limited Evidence
                  </span>
                )}

                {/* Risk Level Badge */}
                {domainData.risk_level && (
                  <RiskBadge level={domainData.risk_level as RiskLevel} label={`${domainData.risk_level} Risk`} />
                )}
              </div>
            </div>

            {/* Coverage Meter */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <span className="font-label-mono-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-secondary">verified</span>
                  Warehouse District Coverage Meter
                </span>
                <span className="font-label-mono-sm text-on-surface-variant">
                  {domainData.coverage > 0
                    ? `${domainData.coverage}% of districts reporting (${domainData.coverage_count || 160}/${domainData.coverage_total || 160})`
                    : '0% coverage (Input telemetry excluded by validation rules)'}
                </span>
              </div>
              <div className="w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    domainData.coverage > 50
                      ? 'bg-secondary'
                      : domainData.coverage > 0
                      ? 'bg-amber-500'
                      : 'bg-outline-variant'
                  }`}
                  style={{ width: `${Math.max(domainData.coverage, 2)}%` }}
                ></div>
              </div>
            </div>

            {/* Trend Chart (if available) */}
            {domainData.time_series && domainData.time_series.points.length > 0 && (
              <div className="flex flex-col gap-3 p-5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[20px]">trending_up</span>
                    <h3 className="font-title-md text-base font-bold text-on-surface">
                      {domainData.time_series.variable_name}
                    </h3>
                  </div>
                  <span className="font-label-mono-sm text-xs text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full">
                    Unit: {domainData.time_series.unit} · {domainData.time_series.points.length} Observations
                  </span>
                </div>

                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={domainData.time_series.points}
                      margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis
                        dataKey="timestamp_pkt"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => (v ? v.split(' ')[0] : '')}
                        minTickGap={20}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f2942',
                          color: '#ffffff',
                          borderRadius: '8px',
                          border: 'none',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

                      {/* Dynamic series lines depending on variables present */}
                      {domainData.impact_area === 'environmental' && (
                        <>
                          <Area
                            type="monotone"
                            dataKey="metrics.soil_moisture_0_7cm"
                            name="Topsoil (0-7cm) m³/m³"
                            stroke="#006398"
                            fill="#006398"
                            fillOpacity={0.15}
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="metrics.soil_moisture_7_28cm"
                            name="Subsoil (7-28cm) m³/m³"
                            stroke="#d77503"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="step"
                            dataKey="metrics.precipitation_mm"
                            name="Rain (mm)"
                            stroke="#1b873f"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </>
                      )}

                      {domainData.impact_area === 'physical' && (
                        <>
                          <Area
                            type="monotone"
                            dataKey="metrics.max_temperature_c"
                            name="Max Daily Temp (°C)"
                            stroke="#ba1a1a"
                            fill="#ba1a1a"
                            fillOpacity={0.12}
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="metrics.daily_rain_mm"
                            name="Daily Rain Sum (mm)"
                            stroke="#006398"
                            strokeWidth={2}
                            dot={false}
                          />
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* If no time series exists for a supported domain, render an honest informational note */}
            {domainData.supported_data && !domainData.time_series && (
              <div className="flex items-center gap-3 p-3.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px] text-secondary">info</span>
                <span>
                  <strong>Static Baseline Census:</strong> This sector is modeled using spatial GIS access buffers
                  and decennial census demographics. Continuous hourly/daily time-series sensors are not installed for this domain.
                </span>
              </div>
            )}

            {/* Evidence & Indicators Section */}
            {domainData.supported_data ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-title-md text-base font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[20px]">analytics</span>
                    Sector Empirical Indicators ({domainData.indicators.length})
                  </h3>
                  <span className="font-label-mono-sm text-xs text-on-surface-variant">
                    Jurisdiction: {selectedDistrict || selectedCity}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {domainData.indicators.map((ind, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm hover:shadow-md transition-shadow gap-3"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-title-md text-sm font-semibold text-on-surface line-clamp-2">
                            {ind.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-label-mono-sm text-[10px] uppercase font-bold shrink-0 ${
                              ind.evidence_strength === 'high'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {ind.evidence_strength}
                          </span>
                        </div>

                        {/* Metric Value */}
                        <div className="flex items-baseline gap-1.5 pt-1">
                          <span className="font-metric-display text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
                            {typeof ind.value === 'number'
                              ? ind.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                              : '—'}
                          </span>
                          {ind.unit && (
                            <span className="font-body-sm text-xs font-semibold text-on-surface-variant">
                              {ind.unit}
                            </span>
                          )}
                        </div>

                        {ind.description && (
                          <p className="font-body-sm text-xs text-on-surface-variant line-clamp-3">
                            {ind.description}
                          </p>
                        )}
                      </div>

                      {/* Source & Row IDs Footer */}
                      <div className="flex flex-col gap-1 pt-2 border-t border-outline-variant/20 text-[11px] text-on-surface-variant font-label-mono-sm">
                        {ind.source && <span className="truncate">Source: {ind.source}</span>}
                        {ind.row_ids && ind.row_ids.length > 0 && (
                          <div className="flex items-center gap-1 text-secondary truncate">
                            <span className="material-symbols-outlined text-[12px]">fingerprint</span>
                            <span className="truncate">{ind.row_ids[0]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Clear "Limited evidence" state and NO numbers */
              <div className="relative overflow-hidden p-6 sm:p-8 rounded-xl bg-surface-container-low border border-outline-variant/60 shadow-sm flex flex-col items-center justify-center text-center gap-4">
                {/* Visual hatched overlay for suppressed telemetry */}
                <div
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 0, transparent 12px)',
                  }}
                ></div>

                <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center text-outline shadow-sm relative z-10">
                  <span className="material-symbols-outlined text-[32px]">block</span>
                </div>

                <div className="flex flex-col gap-1 max-w-xl relative z-10">
                  <span className="font-label-mono-sm text-xs font-bold uppercase text-outline tracking-wider">
                    Evidence Level: Limited / Zero Telemetry
                  </span>
                  <h3 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface">
                    No Supported Data in Warehouse
                  </h3>
                  <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed mt-1">
                    {domainData.limitations}
                  </p>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-xs font-label-mono-sm text-on-surface-variant border border-outline-variant/40 relative z-10">
                  <span className="material-symbols-outlined text-[16px] text-amber-500">warning</span>
                  <span>Rule 1 &amp; Rule 2 Compliant: Zero synthetic proxies or fabricated numbers displayed.</span>
                </div>
              </div>
            )}

            {/* Sources & Limitations Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Sources Card */}
              <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2.5">
                  <span className="material-symbols-outlined text-secondary text-[20px]">database</span>
                  <h3 className="font-title-md text-sm sm:text-base font-bold text-on-surface">
                    Verified Data Sources &amp; Registries
                  </h3>
                </div>
                {domainData.source_names && domainData.source_names.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {domainData.source_names.map((src, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-on-surface">
                        <span className="material-symbols-outlined text-[16px] text-secondary shrink-0 mt-0.5">
                          check_circle
                        </span>
                        <span className="font-medium">{src}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-on-surface-variant italic">No primary sources mapped.</span>
                )}
                {domainData.row_ids && domainData.row_ids.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-outline-variant/20">
                    <span className="font-label-mono-sm text-[11px] text-on-surface-variant">Trace Row IDs:</span>
                    {domainData.row_ids.map((rid, idx) => (
                      <span
                        key={idx}
                        className="font-label-mono-sm text-[10px] px-2 py-0.5 rounded bg-surface-container text-secondary border border-outline-variant/30"
                      >
                        {rid}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Limitations Box */}
              <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2.5">
                  <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
                  <h3 className="font-title-md text-sm sm:text-base font-bold text-on-surface">
                    Operational Limitations &amp; Caveats
                  </h3>
                </div>
                <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                  {domainData.limitations}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] font-label-mono-sm text-on-surface-variant pt-2 border-t border-outline-variant/20">
                  <span className="material-symbols-outlined text-[14px] text-secondary">verified_user</span>
                  <span>Evaluated under DuckDB Contract &amp; Data Quality Agent Guidelines</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mandatory Footer (Rule 6) */}
      <footer className="mt-8 pt-4 border-t border-outline-variant/30 text-center text-xs text-on-surface-variant">
        Information only, not professional advice. In an emergency contact official services.
      </footer>
    </div>
  );
};
