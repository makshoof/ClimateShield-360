import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatPKT } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PlannerMeasureItem } from '../types';

interface EmergencyPlannerProps {
  isSample?: boolean;
}

export const EmergencyPlanner: React.FC<EmergencyPlannerProps> = ({ isSample = false }) => {
  const [selectedHazard, setSelectedHazard] = useState<'heat' | 'heavy_rain'>('heat');
  const [selectedRange, setSelectedRange] = useState<'24h' | '48h' | '7d'>('24h');
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [filterGapOnly, setFilterGapOnly] = useState<boolean>(false);

  // Fetch Emergency Action Planner data from read-only DuckDB warehouse via API
  const {
    data: plannerRes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['emergency-planner', selectedHazard, selectedRange],
    queryFn: () => api.getPlanner({ hazard: selectedHazard, range: selectedRange }),
  });

  const plannerData = plannerRes?.data;
  const isSampleData = plannerRes?.is_sample ?? isSample;
  const districts = plannerData?.districts || [];
  const cityForecast = plannerData?.city_forecast;
  const resourceSummary = plannerData?.resource_summary;

  // Toggle district row expansion
  const toggleDistrictExpand = (zoneId: string) => {
    setExpandedZoneId((prev) => (prev === zoneId ? null : zoneId));
  };

  // Filter districts if user toggles resource gap filter
  const displayedDistricts = filterGapOnly
    ? districts.filter((d) => d.resource_gap)
    : districts;

  return (
    <div className="w-full flex-1 flex flex-col px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
      {/* 1. Header & Emergency Context */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
              Emergency Action Planner
            </h1>
            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/10 text-primary border border-primary/30">
              DECISION SUPPORT SYSTEM
            </span>
            {isSampleData && (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                SAMPLE DATA
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant mt-1.5 max-w-3xl">
            Sindh PDMA & KMC Multi-Hazard Priority Triage: ranked district exposure, critical resource gap detection,
            and deterministic standard operating procedures.
          </p>
        </div>

        {/* Emergency Direct Hotlines (Informational Only) */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="tel:1736"
            className="px-3 py-2 rounded-xl bg-error/10 hover:bg-error/20 text-error border border-error/30 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
            title="Sindh PDMA Provincial Disaster Management Authority Hotline"
          >
            <span className="material-symbols-outlined text-[16px]">call</span>
            <span>Sindh PDMA: 1736</span>
          </a>
          <a
            href="tel:1122"
            className="px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
            title="Rescue 1122 Emergency Dispatch"
          >
            <span className="material-symbols-outlined text-[16px]">emergency</span>
            <span>Rescue 1122</span>
          </a>
        </div>
      </div>

      {/* 2. Mandatory Operational Notice: Decision support only */}
      <div
        className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 flex items-start gap-3 shadow-2xs"
        role="alert"
      >
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[22px] shrink-0 mt-0.5">
          gavel
        </span>
        <div className="flex-1 text-xs">
          <p className="font-bold text-amber-900 dark:text-amber-200 text-sm">
            Decision support only, not emergency dispatch instructions.
          </p>
          <p className="text-amber-800/90 dark:text-amber-300/90 mt-0.5 leading-relaxed">
            All rankings, reason justifications, and suggested measures are rule-based algorithms derived strictly from
            verified DuckDB warehouse contracts, meteorological predictions, and census exposure data. These protocols
            provide municipal decision support and must be ratified by authorized incident commanders. In an active life safety emergency, contact official services immediately.
          </p>
        </div>
      </div>

      {/* 3. Control Filters & Meteorological Horizon Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Hazard & Horizon Selectors */}
        <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
              Extreme Weather Hazard
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedHazard('heat')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  selectedHazard === 'heat'
                    ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/30'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">thermostat</span>
                <span>Extreme Heat</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedHazard('heavy_rain')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  selectedHazard === 'heavy_rain'
                    ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">rainy</span>
                <span>Heavy Rain</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
              Forecast Time Horizon
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['24h', '48h', '7d'] as const).map((rng) => (
                <button
                  key={rng}
                  type="button"
                  onClick={() => setSelectedRange(rng)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                    selectedRange === rng
                      ? 'bg-secondary text-on-secondary shadow-2xs'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {rng === '24h' ? '24 Hours' : rng === '48h' ? '48 Hours' : '7 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* City Meteorological Forecast Summary (Rule 5: Always show intervals & baseline) */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
              Met Forecast Horizon ({selectedHazard === 'heat' ? 'Heatwave Warning' : 'Precipitation Inundation'})
            </span>
            <span className="text-[11px] font-mono text-on-surface-variant">
              Issued: {cityForecast?.issued_at ? formatPKT(cityForecast.issued_at) : '—'}
            </span>
          </div>

          {isLoading ? (
            <Skeleton className="h-20 w-full mt-2 rounded-xl" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div className="p-3 rounded-xl bg-surface border border-outline-variant/20">
                <span className="text-[11px] text-on-surface-variant font-medium">
                  {cityForecast?.display_label || (selectedHazard === 'heat' ? 'Forecast high' : 'Forecast precipitation')}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold font-mono text-on-surface">
                    {cityForecast?.display_value == null
                      ? '—'
                      : cityForecast.display_value}
                  </span>
                  <span className="text-[11px] font-mono text-on-surface-variant">
                    {cityForecast?.display_unit || ''}
                  </span>
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1 font-mono">
                  {selectedHazard === 'heat'
                    ? 'Hottest hour in the Open-Meteo window'
                    : cityForecast?.avg_probability == null
                      ? 'Hourly precipitation total'
                      : `${(cityForecast.avg_probability * 100).toFixed(1)}% of hours reach 2.5 mm/h`}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-outline-variant/20">
                <span className="text-[11px] text-on-surface-variant font-medium">Hourly range</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-primary">
                    {cityForecast?.interval_low == null || cityForecast?.interval_high == null
                      ? 'Forecast unavailable'
                      : `${cityForecast.interval_low}–${cityForecast.interval_high} ${cityForecast.interval_unit || ''}`}
                  </span>
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1 font-mono">
                  Lowest to highest forecast hour
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-outline-variant/20">
                <span className="text-[11px] text-on-surface-variant font-medium">
                  {selectedHazard === 'heat' ? 'Temperature 24h ago' : 'Observed precipitation'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold font-mono text-secondary">
                    {cityForecast?.baseline_value == null
                      ? '—'
                      : `${cityForecast.baseline_value}`}
                  </span>
                  <span className="text-[11px] font-mono text-on-surface-variant">
                    {selectedHazard === 'heat' ? '°C' : 'mm'}
                  </span>
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1 font-mono">
                  {selectedHazard === 'heat'
                    ? 'Same Karachi point, 24 hours earlier'
                    : 'Observed total over the same length window'}
                </p>
              </div>
            </div>
          )}

          <div className="mt-2 text-[11px] text-on-surface-variant flex items-center justify-between gap-3">
            <span className="min-w-0">{cityForecast?.note || 'Waiting for the hourly forecast.'}</span>
            <span className="font-mono text-primary shrink-0">Open-Meteo hourly</span>
          </div>
        </div>
      </div>

      {/* 4. Resource and Gap Panel */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-on-surface">
                Resource & Critical Capacity Gap Panel
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                AUDIT THRESHOLD: &gt; 55,000 POP/FACILITY
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Assesses emergency facility density against census exposed populations to detect critical relief bottlenecks.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setFilterGapOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
              filterGapOnly
                ? 'bg-amber-600 text-white shadow-2xs ring-2 ring-amber-500/30'
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">filter_alt</span>
            <span>{filterGapOnly ? 'Showing Gaps Only' : 'Filter Resource Gaps'}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Top 4 Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-surface border border-outline-variant/30">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                  Total Exposed Population
                </span>
                <span className="text-2xl font-bold font-mono text-on-surface mt-1 block">
                  {resourceSummary?.total_exposed_population.toLocaleString() || '—'}
                </span>
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                  Across 7 monitored Karachi zones
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-outline-variant/30">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                  Catalogued Emergency Facilities
                </span>
                <span className="text-2xl font-bold font-mono text-secondary mt-1 block">
                  {resourceSummary?.total_facilities_registered || '—'}
                </span>
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                  Hospitals, relief shelters & pumps
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-outline-variant/30">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                  Citywide Average Load
                </span>
                <span className="text-2xl font-bold font-mono text-primary mt-1 block">
                  {resourceSummary ? `${resourceSummary.citywide_ratio.toLocaleString()} / fac` : '—'}
                </span>
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                  Residents per registered asset
                </span>
              </div>

              <div className={`p-3.5 rounded-xl border ${
                (resourceSummary?.flagged_gap_districts_count || 0) > 0
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-emerald-500/10 border-emerald-500/30'
              }`}>
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                  Active Resource Gaps Flagged
                </span>
                <span className={`text-2xl font-bold font-mono mt-1 block ${
                  (resourceSummary?.flagged_gap_districts_count || 0) > 0
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  {resourceSummary?.flagged_gap_districts_count ?? 0} Districts
                </span>
                <span className="text-[10px] text-on-surface-variant mt-0.5 block">
                  Exposed population high & facilities few
                </span>
              </div>
            </div>

            {/* Gap Analysis Details & Inter-District Aid Advisory */}
            {resourceSummary && resourceSummary.flagged_gap_districts_count > 0 && (
              <div className="p-4 rounded-xl bg-surface border border-amber-500/30 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  <span>Districts with Acute Critical Asset Shortages:</span>
                  <span className="font-mono underline">
                    {resourceSummary.flagged_district_names.join(', ')}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <strong>Operational Triage Rule:</strong> Districts flagged with a Resource Gap exhibit over 55,000 residents per emergency facility.
                  Incident commanders should initiate inter-district mutual aid protocols, staging mobile cooling bowsers (during heatwaves)
                  or mobile trailer dewatering pumps (during heavy rainfall) from higher-density sectors such as Karachi South (28,709/fac) and East (33,823/fac).
                </p>

                {/* Facility Catalog Asset Breakdown */}
                {resourceSummary.facilities_by_type && Object.keys(resourceSummary.facilities_by_type).length > 0 && (
                  <div className="pt-2 border-t border-outline-variant/20 flex flex-wrap items-center gap-3 text-[11px] font-mono text-on-surface-variant">
                    <span className="font-bold text-on-surface">Registered Assets by Class:</span>
                    {Object.entries(resourceSummary.facilities_by_type).map(([ftype, count]) => (
                      <span key={ftype} className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30">
                        {ftype.replace('_', ' ')}: <strong className="text-on-surface">{count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Ranked Districts Priority Table with Expandable Reasons */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-on-surface">
              Ranked District Priority Roster
            </h2>
            <p className="text-xs text-on-surface-variant">
              Ordered deterministically by <strong>Risk Level</strong> (Severe &gt; High &gt; Moderate &gt; Low), then <strong>Vulnerability Score</strong> (DESC), then <strong>Exposed Population</strong> (DESC).
            </p>
          </div>

          <div className="text-xs text-on-surface-variant font-mono">
            Displaying {displayedDistricts.length} of {districts.length} zones
          </div>
        </div>

        {/* Loading and Error States */}
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        )}

        {isError && (
          <EmptyState
            title="Failed to Load Emergency Planner"
            description="Could not query district exposure indices or predictions from the warehouse."
            icon="error"
            actionText="Retry Request"
            onAction={() => refetch()}
          />
        )}

        {!isLoading && !isError && displayedDistricts.length === 0 && (
          <EmptyState
            title="No Districts Match Filter"
            description="No zones found matching the selected criteria. Toggle off 'Show Gaps Only' to view all districts."
            icon="filter_alt_off"
            actionText="Show All Districts"
            onAction={() => setFilterGapOnly(false)}
          />
        )}

        {!isLoading && !isError && displayedDistricts.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/30">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">Rank</th>
                  <th className="px-4 py-3">District / Zone</th>
                  <th className="px-3 py-3 text-center">Hazard</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-3 py-3 text-right">Vulnerability</th>
                  <th className="px-4 py-3 text-right">Exposed Pop.</th>
                  <th className="px-3 py-3 text-right">Facilities</th>
                  <th className="px-3 py-3 text-center">Resource Gap</th>
                  <th className="px-4 py-3 text-right">Audit & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 bg-surface">
                {displayedDistricts.map((district) => {
                  const isExpanded = expandedZoneId === district.district_id;
                  const ratio = Math.round(district.exposed_population / Math.max(district.facilities_count, 1));

                  return (
                    <React.Fragment key={district.district_id}>
                      <tr
                        onClick={() => toggleDistrictExpand(district.district_id)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded
                            ? 'bg-surface-container-highest/60'
                            : district.risk_level === 'Severe'
                            ? 'hover:bg-error/5'
                            : 'hover:bg-surface-container'
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="px-3 py-3 text-center font-mono font-bold text-on-surface">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                              district.rank === 1
                                ? 'bg-error text-on-error shadow-2xs'
                                : district.rank <= 3
                                ? 'bg-secondary text-on-secondary'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            #{district.rank}
                          </span>
                        </td>

                        {/* District Name & ID */}
                        <td className="px-4 py-3">
                          <div className="font-bold text-on-surface">{district.district_name}</div>
                          <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                            {district.district_id}
                          </div>
                        </td>

                        {/* Hazard Type */}
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] capitalize text-on-surface-variant">
                            <span className="material-symbols-outlined text-[14px]">
                              {district.hazard_type === 'heat' ? 'thermostat' : 'rainy'}
                            </span>
                            {district.hazard_type.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Risk Level Badge (Rule 4: accessible text labels) */}
                        <td className="px-4 py-3">
                          <RiskBadge level={district.risk_level} />
                        </td>

                        {/* Vulnerability Score */}
                        <td className="px-3 py-3 text-right font-mono font-semibold text-on-surface">
                          <div className="flex items-center justify-end gap-2">
                            <span>{district.vulnerability_score.toFixed(2)}</span>
                            <div className="w-12 bg-outline-variant/30 h-1.5 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="bg-primary h-full rounded-full"
                                style={{ width: `${Math.round(district.vulnerability_score * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Exposed Population */}
                        <td className="px-4 py-3 text-right font-mono text-on-surface">
                          {district.exposed_population.toLocaleString()}
                        </td>

                        {/* Critical Facilities Count */}
                        <td className="px-3 py-3 text-right font-mono text-on-surface-variant">
                          <span className="font-bold text-on-surface">{district.facilities_count}</span>
                          <span className="text-[10px] block opacity-75">
                            ({ratio.toLocaleString()} / fac)
                          </span>
                        </td>

                        {/* Resource Gap Flag */}
                        <td className="px-3 py-3 text-center">
                          {district.resource_gap ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              <span className="material-symbols-outlined text-[12px]">warning</span>
                              GAP FLAGGED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              <span className="material-symbols-outlined text-[12px]">check</span>
                              Adequate
                            </span>
                          )}
                        </td>

                        {/* Expand / Collapse Action */}
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDistrictExpand(district.district_id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors shadow-2xs"
                            aria-expanded={isExpanded}
                          >
                            <span>{isExpanded ? 'Hide' : 'Details'}</span>
                            <span className="material-symbols-outlined text-[14px]">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Reasons & Suggested Measures Drawer */}
                      {isExpanded && (
                        <tr className="bg-surface-container-lowest border-y border-outline-variant/30">
                          <td colSpan={9} className="p-4 sm:p-6 space-y-5">
                            {/* Drawer Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/20">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[20px]">
                                  info
                                </span>
                                <h3 className="font-bold text-sm text-on-surface">
                                  Operational Reason Audit & SOP Measures — {district.district_name}
                                </h3>
                              </div>
                              <span className="text-[11px] font-mono text-on-surface-variant">
                                Zone Ref: {district.district_id} | Evidence Strength: <span className="uppercase font-bold text-on-surface">{district.evidence_strength}</span>
                              </span>
                            </div>

                            {/* Section 1: Reason Fields (Prompt requirement) */}
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                                1. Why this District is Ranked #{district.rank} (Audit Reason Fields)
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Reason Field 1: Forecast Probability & Interval */}
                                <div className="p-3 rounded-xl bg-surface border border-outline-variant/20 shadow-2xs">
                                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">
                                    Forecast Probability & Interval
                                  </span>
                                  <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-lg font-bold font-mono text-on-surface">
                                      {district.forecast_probability == null
                                        ? '—'
                                        : `${(district.forecast_probability * 100).toFixed(1)}%`}
                                    </span>
                                    <span className="text-xs font-mono text-primary font-semibold">
                                      {district.forecast_interval_low == null
                                        ? 'No model interval'
                                        : `${district.forecast_interval_low}–${district.forecast_interval_high} ${district.interval_unit || ''}`}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-on-surface-variant font-mono block mt-0.5">
                                    Baseline: {district.baseline_value ?? '—'} {district.interval_unit || ''}
                                  </span>
                                </div>

                                {/* Reason Field 2: Vulnerability Score */}
                                <div className="p-3 rounded-xl bg-surface border border-outline-variant/20 shadow-2xs">
                                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">
                                    Vulnerability Score
                                  </span>
                                  <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-lg font-bold font-mono text-on-surface">
                                      {district.vulnerability_score.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-on-surface-variant">/ 1.00</span>
                                  </div>
                                  <span className="text-[10px] text-on-surface-variant font-mono block mt-0.5">
                                    Risk tier: {district.risk_level}
                                  </span>
                                </div>

                                {/* Reason Field 3: Exposed Population */}
                                <div className="p-3 rounded-xl bg-surface border border-outline-variant/20 shadow-2xs">
                                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">
                                    Exposed Population
                                  </span>
                                  <div className="mt-1">
                                    <span className="text-lg font-bold font-mono text-on-surface">
                                      {district.exposed_population.toLocaleString()}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-on-surface-variant font-mono block mt-0.5">
                                    High-density urban exposure
                                  </span>
                                </div>

                                {/* Reason Field 4: Facilities Count & Density */}
                                <div className="p-3 rounded-xl bg-surface border border-outline-variant/20 shadow-2xs">
                                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">
                                    Registered Facilities
                                  </span>
                                  <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-lg font-bold font-mono text-secondary">
                                      {district.facilities_count}
                                    </span>
                                    <span className="text-xs text-on-surface-variant">
                                      ({ratio.toLocaleString()} / fac)
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-on-surface-variant font-mono block mt-0.5">
                                    {district.resource_gap ? 'Severe capacity bottleneck' : 'Standard sector ratio'}
                                  </span>
                                </div>
                              </div>

                              {/* Rule-Based Deterministic Justification String */}
                              <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 mt-3 text-xs leading-relaxed text-on-surface">
                                <span className="font-bold text-primary mr-1">Algorithm Justification:</span>
                                {district.reason_summary}
                              </div>

                              {/* Verified Row IDs Used (Audit Provenance) */}
                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                                <span className="text-on-surface-variant font-bold">DuckDB Provenance Row IDs:</span>
                                {district.row_ids.map((rid) => (
                                  <span
                                    key={rid}
                                    className="px-1.5 py-0.5 rounded bg-surface border border-outline-variant/30 text-on-surface"
                                  >
                                    {rid}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Section 2: Suggested Measures from Fixed Mapping in Code */}
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                                  2. Rule-Based Suggested Measures ({selectedHazard === 'heat' ? 'Heat Warning & Cooling Support' : 'Drainage Inspection & Flood Preparedness'})
                                </h4>
                                <span className="text-[10px] font-mono text-on-surface-variant">
                                  NO LLM GENERATION • DETERMINISTIC SINDH PDMA MAPPINGS
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {district.suggested_measures.map((m: PlannerMeasureItem) => (
                                  <div
                                    key={m.measure_id}
                                    className={`p-3.5 rounded-xl border flex flex-col justify-between transition-colors ${
                                      m.measure_id.startsWith('GAP-')
                                        ? 'bg-amber-500/10 border-amber-500/40 shadow-2xs'
                                        : 'bg-surface border-outline-variant/25'
                                    }`}
                                  >
                                    <div>
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="font-mono text-[10px] font-bold text-on-surface-variant">
                                          {m.measure_id}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                            m.priority === 'Immediate'
                                              ? 'bg-error/15 text-error border border-error/30'
                                              : m.priority === 'Urgent'
                                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                              : 'bg-surface-container-high text-on-surface-variant'
                                          }`}
                                        >
                                          {m.priority}
                                        </span>
                                      </div>
                                      <h5 className="font-bold text-xs text-on-surface mb-1">
                                        {m.title}
                                      </h5>
                                      <p className="text-xs text-on-surface-variant leading-relaxed">
                                        {m.action}
                                      </p>
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-outline-variant/15 flex items-center justify-between text-[10px] text-on-surface-variant">
                                      <span className="font-medium text-secondary">{m.category}</span>
                                      <span className="truncate max-w-[50%] opacity-85">Target: {m.target}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Page Footer (Rule 6: Mandatory exact disclaimer) */}
      <footer className="pt-4 pb-2 border-t border-outline-variant/30 text-center text-xs text-on-surface-variant">
        <p className="font-medium">
          Information only, not professional advice. In an emergency contact official services.
        </p>
        <p className="text-[11px] opacity-75 mt-0.5 font-mono">
          Sindh PDMA Disaster Cell (1736) • Rescue 1122 Karachi • Karachi Metropolitan Corporation (KMC) Command Room
        </p>
      </footer>
    </div>
  );
};

export default EmergencyPlanner;
