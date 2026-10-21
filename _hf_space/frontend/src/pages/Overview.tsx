import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

import { api, formatPKT } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Skeleton } from '../components/Skeleton';
import { PageContainer } from '../components/ui';
import { RiskLevel } from '../types';

interface OverviewProps {
  isSample?: boolean;
}

export const Overview: React.FC<OverviewProps> = ({ isSample = true }) => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [timeRange, setTimeRange] = useState<'24h' | '48h' | '7d'>('24h');
  const [activeHazardView, setActiveHazardView] = useState<'heat' | 'heavy_rain' | 'both'>('both');
  const [priorityHazardFilter, setPriorityHazardFilter] = useState<'all' | 'heat' | 'heavy_rain'>('all');
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  // Fetch Overview summary and prediction curves
  const {
    data: overviewResponse,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['overview', timeRange],
    queryFn: () => api.getOverview(timeRange),
    refetchInterval: 60000,
  });

  // Fetch Ranked Priority Actions from exposure_index
  const {
    data: prioritiesResponse,
    isLoading: isPrioritiesLoading,
    isError: isPrioritiesError,
    refetch: refetchPriorities,
  } = useQuery({
    queryKey: ['priorities', timeRange, priorityHazardFilter],
    queryFn: () =>
      api.getPriorities({
        range: timeRange,
        hazard: priorityHazardFilter === 'all' ? undefined : priorityHazardFilter,
      }),
    refetchInterval: 60000,
  });

  // Fetch total count of all priority actions
  const { data: allPrioritiesResponse } = useQuery({
    queryKey: ['priorities', timeRange, 'all-total'],
    queryFn: () => api.getPriorities({ range: timeRange }),
    staleTime: 60000,
  });

  const overview = overviewResponse?.data;
  const priorities = prioritiesResponse?.data || [];
  const allPrioritiesCount = allPrioritiesResponse?.data?.length || 14;
  const visiblePriorities = showAllPriorities ? priorities : priorities.slice(0, 5);

  // Build combined chart dataset from prediction points
  const rainPoints = overview?.predictions_series?.heavy_rain || [];
  const heatPoints = overview?.predictions_series?.heat || [];

  const chartRows = new Map<string, {
    forecast_time: string;
    short_time: string;
    full_time: string;
    hours_ahead: number;
    heat_c: number | null;
    rain_mm: number | null;
  }>();
  const putPoint = (
    forecastTime: string,
    hoursAhead: number,
    field: 'heat_c' | 'rain_mm',
    value: number | null,
  ) => {
    const pktTime = formatPKT(forecastTime, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const row = chartRows.get(forecastTime) || {
      forecast_time: forecastTime,
      short_time: pktTime.replace(' PKT', ''),
      full_time: pktTime,
      hours_ahead: hoursAhead,
      heat_c: null,
      rain_mm: null,
    };
    row[field] = value;
    chartRows.set(forecastTime, row);
  };
  heatPoints.forEach((point) => putPoint(point.forecast_time, point.hours_ahead, 'heat_c', point.median ?? null));
  rainPoints.forEach((point) => putPoint(point.forecast_time, point.hours_ahead, 'rain_mm', point.median ?? null));
  const chartData = Array.from(chartRows.values()).sort((a, b) => a.forecast_time.localeCompare(b.forecast_time));
  const rainAxisMax = Math.max(1, ...chartData.map((point) => point.rain_mm ?? 0));

  // Mini Map hotspots dynamically populated from API priorities (Requirement 6)
  const mapHotspots = useMemo(() => {
    const baseSpots = [
      { id: 'KHI-MALIR', defaultName: 'Malir Basin', x: '72%', y: '48%' },
      { id: 'KHI-CENTRAL', defaultName: 'Karachi Central', x: '52%', y: '40%' },
      { id: 'KHI-KORANGI', defaultName: 'Korangi Industrial', x: '58%', y: '65%' },
      { id: 'KHI-WEST', defaultName: 'Orangi / SITE', x: '26%', y: '32%' },
      { id: 'KHI-EAST', defaultName: 'Gulshan / East', x: '48%', y: '42%' },
      { id: 'KHI-SOUTH', defaultName: 'Saddar / Lyari', x: '35%', y: '58%' },
      { id: 'KHI-KEAMARI', defaultName: 'Keamari / Port', x: '18%', y: '62%' },
    ];

    return baseSpots.map((spot) => {
      const p = priorities.find((item) => item.zone_id === spot.id);
      return {
        id: spot.id,
        name: p?.zone_name || spot.defaultName,
        x: spot.x,
        y: spot.y,
        level: (overview?.rain_hazard_level || 'Low') as RiskLevel,
        desc: 'City rainfall badge, not a separate district rain gauge.',
      };
    });
  }, [overview?.rain_hazard_level, priorities]);

  if (isOverviewError || isPrioritiesError) {
    return (
      <PageContainer>
        <SampleBanner isSample={isSample} />
        <EmptyState
          icon="error"
          title="Telemetry Feed Disconnected"
          description="Unable to retrieve real-time overview data from DuckDB warehouse. Please verify backend connection and try again."
          actionText="Retry Connection"
          onAction={() => {
            refetchOverview();
            refetchPriorities();
          }}
        />
      </PageContainer>
    );
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-5"
    >
      {/* Sample Data Operational Banner (Rule 2) */}
      <SampleBanner isSample={overviewResponse?.is_sample ?? isSample} />

      {/* Overview Top Bar: Title & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[26px]">dashboard</span>
            <h1 className="font-headline-lg text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
              Operational Hazard Overview
            </h1>
          </div>
          <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Real-time multi-hazard telemetry, ensemble probability curves, and ranked municipal interventions for Karachi Division.
          </p>
        </div>

        {/* Range Selector: 24h / 48h / 7d */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="font-mono text-xs text-on-surface-variant font-semibold uppercase tracking-wider hidden md:inline">
            Horizon:
          </span>
          <div className="flex items-center bg-surface-container-high dark:bg-surface-container-highest/60 rounded-full p-1 shadow-xs border border-outline-variant/40">
            <button
              type="button"
              onClick={() => setTimeRange('24h')}
              className={`min-h-[36px] px-3.5 py-1 rounded-full font-mono text-xs transition-all ${
                timeRange === '24h'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Next 24h
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('48h')}
              className={`min-h-[36px] px-3.5 py-1 rounded-full font-mono text-xs transition-all ${
                timeRange === '48h'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              48 Hours
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7d')}
              className={`min-h-[36px] px-3.5 py-1 rounded-full font-mono text-xs transition-all ${
                timeRange === '7d'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              7 Days
            </button>
          </div>
        </div>
      </div>

      {/* 4 Key Metric Telemetry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isOverviewLoading ? (
          <>
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </>
        ) : (
          <>
            {/* Card 1: Thermal Hazard Level */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Hazard Vector 01
                  </span>
                  <RiskBadge level={overview?.heat_hazard_level || 'Low'} />
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Thermal Hazard Level
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      {overview?.heat_summary?.headline_value == null ? (
                        '—'
                      ) : (
                        <AnimatedNumber value={overview.heat_summary.headline_value} decimals={1} />
                      )}
                      °C
                    </span>
                    <span className="text-xs text-on-surface-variant font-medium">
                      {overview?.heat_summary?.label || 'Observed air temperature'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Kind</span>
                  <span className="font-semibold text-on-surface">
                    {overview?.heat_summary?.kind || 'observed'}
                  </span>
                </div>
                {/* Visual uncertainty bar */}
                <div className="w-full bg-surface-container-highest h-2 rounded-full relative overflow-hidden">
                  <div className="absolute left-[35%] right-[15%] h-full bg-[#f97316] rounded-full opacity-80" />
                  <div className="absolute left-[60%] top-0 bottom-0 w-1 bg-[#ba1a1a]" />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">{overview?.heat_summary?.source || 'Source unavailable'}</span>
                  {isSample && (
                    <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                      Sample data
                    </span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Card 2: Rainfall Hazard */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Hazard Vector 02
                  </span>
                  <RiskBadge level={overview?.rain_hazard_level || 'Low'} />
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Precipitation Accumulation
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      {overview?.rain_summary?.headline_value == null ? (
                        '—'
                      ) : (
                        <AnimatedNumber value={overview.rain_summary.headline_value} decimals={1} />
                      )}
                    </span>
                    <span className="text-lg font-medium text-on-surface">mm</span>
                    <span className="text-xs text-on-surface-variant">/ {timeRange}</span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Ensemble Spread</span>
                  <span className="font-semibold text-on-surface">
                    {overview?.rain_summary?.kind || 'observed'}
                  </span>
                </div>
                {/* Visual uncertainty bar */}
                <div className="w-full bg-surface-container-highest h-2 rounded-full relative overflow-hidden">
                  <div className="absolute left-[20%] right-[30%] h-full bg-secondary rounded-full opacity-80" />
                  <div className="absolute left-[45%] top-0 bottom-0 w-1 bg-primary" />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">{overview?.rain_summary?.source || 'Source unavailable'}</span>
                  {isSample && (
                    <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                      Sample data
                    </span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Card 3: Zones at Severe Risk */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Vulnerability Status
                  </span>
                  <RiskBadge
                    level={overview && overview.severe_zones_count > 0 ? 'Severe' : 'Low'}
                    label={`${overview?.severe_zones_count ?? 0} Critical`}
                  />
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Zones Exceeding Threshold
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      <AnimatedNumber value={overview?.severe_zones_count ?? 0} decimals={0} />
                    </span>
                    <span className="text-base text-on-surface-variant font-normal">
                      / {overview?.total_zones_count ?? 0}
                    </span>
                    <span className="text-xs text-on-surface-variant">Karachi Zones</span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Distress Hotspots</span>
                  <span className="font-semibold text-error truncate max-w-[150px]">
                    {overview?.severe_zone_names?.slice(0, 2).join(', ') || '—'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant truncate">
                  District weather is not stored separately from the Karachi city series.
                </p>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">Exposure index</span>
                  {isSample && (
                    <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                      Sample data
                    </span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Card 4: Data Freshness Status */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Pipeline Health
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container-highest text-on-surface font-mono text-xs font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary text-[16px]">check_circle</span>
                    {overview?.data_freshness_status || 'Nominal'}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Ingestion Integrity
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      <AnimatedNumber value={overview?.freshness_summary?.integrity_pct ?? 100} decimals={0} />%
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {overview?.freshness_summary?.fresh_sources ?? 5}/{overview?.freshness_summary?.total_sources ?? 6} feeds OK
                    </span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Lagging Source</span>
                  <span className="font-semibold text-secondary truncate max-w-[130px]">
                    {overview?.freshness_summary?.lagging_source || 'None (In Sync)'}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono text-xs text-on-surface-variant">
                  <span>Cycle: Micro-Batch</span>
                  <span className="text-secondary font-semibold">T-18m ago</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">Sindh Gateway Node</span>
                  <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                    Telemetry
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Main Operational Workspace: 70% Map & Chart / 30% Decision Support Priorities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* Left Column (8 of 12 cols = ~67%) */}
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          {/* Mini Map Preview Linking to Full Risk Map */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-outline-variant/20">
            {/* Header & Controls */}
            <div className="p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-low border-b border-outline-variant/20">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[22px]">radar</span>
                  <span className="font-title-md text-title-md text-on-surface font-semibold truncate">
                    Karachi Division Urban Hazard Distribution (Mini Preview)
                  </span>
                </div>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                  Sketch of Karachi districts. Colors are not a live rainfall grid.
                </span>
              </div>

              {/* Direct Link to Full Risk Map */}
              <Link
                to="/risk-map"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-on-secondary rounded-lg font-label-mono-sm text-label-mono-sm font-semibold hover:bg-secondary/90 transition-colors shadow-sm shrink-0"
              >
                <span>Launch Interactive Risk Map</span>
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </Link>
            </div>

            {/* Interactive Vector Canvas Preview */}
            <div className="relative w-full h-[380px] bg-[#0c1f33] overflow-hidden select-none">
              <svg className="w-full h-full object-cover" viewBox="0 0 900 440" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="sea-grad" x1="0" y1="440" x2="900" y2="440" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#051424" />
                    <stop offset="100%" stopColor="#092038" />
                  </linearGradient>
                </defs>
                <rect width="900" height="440" fill="url(#sea-grad)" />

                {/* Sea waves */}
                <path d="M 40 390 Q 90 380 140 390 T 240 390" stroke="#1e3a5f" strokeWidth="1.5" strokeDasharray="4 6" />
                <path d="M 120 420 Q 180 410 240 420 T 360 420" stroke="#1e3a5f" strokeWidth="1.5" strokeDasharray="4 6" />
                <text x="50" y="425" fill="#476d99" fontFamily="JetBrains Mono" fontSize="11" letterSpacing="2">
                  ARABIAN SEA (MANORA CHANNEL)
                </text>

                {/* Zones Polygons (Stylized) */}
                {/* Malir Basin (East - Severe) */}
                <path
                  d="M 640 130 L 880 110 L 870 300 L 670 290 L 670 210 Z"
                  fill="#1e3a5f"
                  fillOpacity="0.55"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-MALIR')}
                />
                <text x="700" y="200" fill="#fecaca" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold">
                  MALIR
                </text>

                {/* Central / Gulshan (Mid-East - Severe) */}
                <path
                  d="M 420 120 L 640 130 L 670 210 L 490 220 L 410 170 Z"
                  fill="#1e3a5f"
                  fillOpacity="0.45"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-CENTRAL')}
                />
                <text x="470" y="175" fill="#fee2e2" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  CENTRAL
                </text>

                {/* Orangi & West (North-West - High) */}
                <path
                  d="M 190 70 L 290 60 L 410 120 L 350 190 L 190 160 Z"
                  fill="#ea580c"
                  fillOpacity="0.4"
                  stroke="#f97316"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-WEST')}
                />
                <text x="220" y="125" fill="#fed7aa" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  ORANGI / SITE
                </text>

                {/* Korangi Industrial & Creek (South-East - Severe Flood) */}
                <path
                  d="M 490 220 L 670 210 L 670 320 L 480 330 Z"
                  fill="#16324f"
                  fillOpacity="0.6"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-KORANGI')}
                />
                <text x="520" y="275" fill="#fee2e2" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold">
                  KORANGI
                </text>

                {/* Lyari / South (Central Dense - Moderate) */}
                <path
                  d="M 230 180 L 350 190 L 360 255 L 250 250 Z"
                  fill="#d97706"
                  fillOpacity="0.35"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:fill-opacity-60 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-SOUTH')}
                />
                <text x="260" y="225" fill="#fef08a" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  SADDAR / LYARI
                </text>

                {/* Kemari / Port Zone (South-West Coastal) */}
                <path
                  d="M 120 180 L 230 180 L 250 250 L 220 330 L 90 280 Z"
                  fill="#006398"
                  fillOpacity="0.4"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:fill-opacity-60 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-KEAMARI')}
                />
                <text x="120" y="255" fill="#bae6fd" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  KEAMARI PORT
                </text>

                {/* Major Drains: Gujjar Nullah & Malir River */}
                <path d="M 390 80 Q 380 140 340 185" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
                <path d="M 680 150 Q 610 230 540 330" stroke="#38bdf8" strokeWidth="3" />
                <text x="610" y="270" fill="#38bdf8" fontFamily="JetBrains Mono" fontSize="9">
                  Malir Basin Channel
                </text>
              </svg>

              {/* Interactive Pulsing Hotspot Pins */}
              {mapHotspots.map((hs) => (
                <div
                  key={hs.id}
                  style={{ left: hs.x, top: hs.y }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  onMouseEnter={() => setHoveredZone(hs.id)}
                  onMouseLeave={() => setHoveredZone(null)}
                  onClick={() => navigate(`/risk-map?zone=${hs.id}`)}
                >
                  <div className="relative flex items-center justify-center">
                    <span
                      className={`animate-ping absolute inline-flex h-6 w-6 rounded-full opacity-75 ${
                        hs.level === 'Severe' ? 'bg-error' : hs.level === 'High' ? 'bg-[#f97316]' : hs.level === 'Moderate' ? 'bg-[#eab308]' : 'bg-[#059669]'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white shadow-md ${
                        hs.level === 'Severe' ? 'bg-error' : hs.level === 'High' ? 'bg-[#f97316]' : hs.level === 'Moderate' ? 'bg-[#eab308]' : 'bg-[#059669]'
                      }`}
                    />
                  </div>

                  {/* Hotspot Floating Tooltip */}
                  <div className="hidden group-hover:block absolute bottom-6 left-1/2 -translate-x-1/2 bg-primary-container text-on-primary rounded-lg px-2.5 py-1.5 shadow-xl text-center whitespace-nowrap z-30 pointer-events-none">
                    <div className="font-label-mono-sm text-[11px] font-bold">{hs.name}</div>
                    <div className="font-body-sm text-[10px] text-on-primary-container">{hs.desc}</div>
                    <div className="text-[9px] text-secondary font-semibold mt-0.5">Click to view in Risk Map →</div>
                  </div>
                </div>
              ))}

              {/* Floating Zone Inspector HUD */}
              <div className="absolute top-3 left-3 bg-primary-container/95 backdrop-blur text-on-primary rounded-xl p-space-sm max-w-[260px] shadow-xl border border-white/10 pointer-events-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-label-mono-sm text-[10px] uppercase text-secondary font-bold">
                    Zone Inspector
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-secondary font-label-mono-sm text-[9px] text-on-secondary font-bold">
                    {overview?.rain_hazard_level || 'Low'} RAIN
                  </span>
                </div>
                <div className="font-title-md text-title-md font-semibold text-on-primary mt-0.5">
                  {hoveredZone
                    ? mapHotspots.find((h) => h.id === hoveredZone)?.name
                    : 'Karachi Metropolitan Area'}
                </div>
                <div className="mt-1.5 space-y-0.5 font-label-mono-sm text-[11px]">
                  <div className="flex justify-between text-on-primary-container">
                    <span>Active Horizon:</span>
                    <span className="text-on-primary font-bold">{timeRange}</span>
                  </div>
                  <div className="flex justify-between text-on-primary-container">
                    <span>Rain reading:</span>
                    <span className="text-on-primary font-bold">Karachi city point</span>
                  </div>
                </div>
              </div>

              {/* Legend Footer */}
              <div className="absolute bottom-2 left-2 right-2 bg-primary-container/90 backdrop-blur rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-on-primary font-label-mono-sm text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="text-on-primary-container font-semibold">Tiers:</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-error" /> Severe (Red Alert)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" /> High (Warning)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" /> Moderate (Watch)
                  </span>
                </div>
                <Link to="/risk-map" className="text-secondary hover:underline flex items-center gap-1 font-semibold">
                  <span>Open Risk Map</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Recharts Line Chart: Hazard Probability with Shaded Interval Band & Climatology Baseline */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-md border border-outline-variant/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs border-b border-outline-variant/20">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">show_chart</span>
                  <span className="font-title-md text-title-md text-on-surface font-semibold">
                    Karachi hourly forecast
                  </span>
                </div>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                  Open-Meteo hourly forecast for this window. Heat is temperature. Rain is precipitation. A flat 0 mm line means no rain is forecast.
                </span>
              </div>

              {/* Hazard Mode Switcher (Heat / Rain / Both) */}
              <div className="flex items-center bg-surface-container-high p-1 rounded-lg self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setActiveHazardView('heat')}
                  className={`px-2.5 py-1 rounded font-label-mono-sm text-label-mono-sm transition-all ${
                    activeHazardView === 'heat'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Heat Wave
                </button>
                <button
                  type="button"
                  onClick={() => setActiveHazardView('heavy_rain')}
                  className={`px-2.5 py-1 rounded font-label-mono-sm text-label-mono-sm transition-all ${
                    activeHazardView === 'heavy_rain'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Heavy Rain
                </button>
                <button
                  type="button"
                  onClick={() => setActiveHazardView('both')}
                  className={`px-2.5 py-1 rounded font-label-mono-sm text-label-mono-sm transition-all ${
                    activeHazardView === 'both'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Both Hazards
                </button>
              </div>
            </div>

            {/* Recharts Area + Line Chart */}
            <div className="w-full h-80 sm:h-72 bg-surface-container-low rounded-lg p-2 select-none">
              {isOverviewLoading ? (
                <div className="h-full flex items-center justify-center font-label-mono-sm text-on-surface-variant">
                  Loading the hourly forecast...
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center font-label-mono-sm text-on-surface-variant">
                  The Open-Meteo hourly forecast is not available right now.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 25, left: 0, bottom: 5 }}>
                    <XAxis
                      dataKey="short_time"
                      stroke="#74777e"
                      fontSize={11}
                      tickLine={false}
                      fontFamily="JetBrains Mono"
                      interval="preserveStartEnd"
                      minTickGap={25}
                    />
                    {activeHazardView !== 'heavy_rain' && (
                      <YAxis
                        yAxisId="heat"
                        stroke="#d97706"
                        fontSize={11}
                        tickFormatter={(v) => `${v}°`}
                        tickLine={false}
                        fontFamily="JetBrains Mono"
                        domain={['auto', 'auto']}
                      />
                    )}
                    {activeHazardView !== 'heat' && (
                      <YAxis
                        yAxisId="rain"
                        orientation={activeHazardView === 'both' ? 'right' : 'left'}
                        stroke="#006398"
                        fontSize={11}
                        tickFormatter={(v) => `${v} mm`}
                        domain={[0, rainAxisMax]}
                        tickLine={false}
                        fontFamily="JetBrains Mono"
                      />
                    )}
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="bg-primary-container text-on-primary p-space-sm rounded-lg shadow-xl text-xs font-mono space-y-1 border border-white/10">
                            <div className="font-bold text-secondary-container">
                              {d.full_time}
                            </div>
                            <div className="text-[11px] text-on-primary-container">
                              {d.hours_ahead === 0 ? 'Current hour' : `${d.hours_ahead}h ahead`}
                            </div>
                            {d.heat_c != null && (
                              <div className="text-amber-300">Temperature: {d.heat_c}°C</div>
                            )}
                            {d.rain_mm != null && (
                              <div className="text-[#38bdf8]">Precipitation: {d.rain_mm} mm</div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      content={({ payload }) => {
                        if (!payload || !payload.length) return null;
                        return (
                          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-2.5 px-1 text-xs select-none">
                            {payload.map((entry, index) => (
                              <div key={`legend-${index}`} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span
                                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="font-label-mono-sm text-[11px] text-on-surface">
                                  {entry.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    {activeHazardView !== 'heavy_rain' && (
                      <Line
                        yAxisId="heat"
                        type="monotone"
                        dataKey="heat_c"
                        stroke="#d97706"
                        strokeWidth={2.5}
                        dot={false}
                        name="Forecast temperature °C"
                        connectNulls
                        isAnimationActive={!shouldReduceMotion}
                        animationDuration={800}
                      />
                    )}
                    {activeHazardView !== 'heat' && (
                      <Line
                        yAxisId="rain"
                        type="monotone"
                        dataKey="rain_mm"
                        stroke="#006398"
                        strokeWidth={2.5}
                        dot={false}
                        name="Forecast precipitation mm"
                        connectNulls
                        isAnimationActive={!shouldReduceMotion}
                        animationDuration={800}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex items-center justify-between text-on-surface-variant font-label-mono-sm text-label-mono-sm pt-1">
              <span className="truncate">
                Open-Meteo hourly forecast. The 24h / 48h / 7d buttons change this window. 0 mm means the forecast is dry.
              </span>
              <span className="px-1.5 py-0.5 bg-surface-container rounded text-[10px] uppercase font-mono shrink-0">
                Open-Meteo point
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (4 of 12 cols = ~33%): Ranked Priority Actions Panel */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 flex flex-col lg:max-h-[500px] overflow-visible lg:overflow-hidden">
            {/* Sticky Panel Header */}
            <div className="sticky top-0 z-10 bg-surface-container-lowest border-b border-outline-variant/20 p-space-md shrink-0 rounded-t-xl">
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <span className="font-label-mono-sm text-label-mono-sm uppercase text-secondary font-semibold tracking-wider">
                    Decision Support System
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface font-label-mono-sm text-label-mono-sm font-semibold">
                    {priorities.length} listed
                  </span>
                </div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Ranked Priority Actions
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Seeded district exposure table, not current rainfall. A dry Karachi hour does not clear these stored ranks.
                </p>

                {/* Filter Pills for Priorities */}
                <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-lg mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPriorityHazardFilter('all');
                      setShowAllPriorities(false);
                    }}
                    className={`flex-1 py-1 px-2 rounded font-label-mono-sm text-xs transition-colors ${
                      priorityHazardFilter === 'all'
                        ? 'bg-primary text-on-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    All ({allPrioritiesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPriorityHazardFilter('heat');
                      setShowAllPriorities(false);
                    }}
                    className={`flex-1 py-1 px-2 rounded font-label-mono-sm text-xs transition-colors ${
                      priorityHazardFilter === 'heat'
                        ? 'bg-primary text-on-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Heat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPriorityHazardFilter('heavy_rain');
                      setShowAllPriorities(false);
                    }}
                    className={`flex-1 py-1 px-2 rounded font-label-mono-sm text-xs transition-colors ${
                      priorityHazardFilter === 'heavy_rain'
                        ? 'bg-primary text-on-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Rain
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Items List on Desktop / Natural Flow on Mobile */}
            <div className="p-space-md flex flex-col gap-2 flex-1 lg:overflow-y-auto">
              {isPrioritiesLoading ? (
                <div className="py-8 text-center font-label-mono-sm text-on-surface-variant">
                  Computing priority directives...
                </div>
              ) : visiblePriorities.length === 0 ? (
                <div className="py-8 text-center font-label-mono-sm text-on-surface-variant">
                  No priority interventions match active filters.
                </div>
              ) : (
                <>
                  {visiblePriorities.map((item) => (
                    <Link
                      to={`/risk-map?zone=${item.zone_id}`}
                      key={`${item.zone_id}-${item.hazard_type}-${item.rank}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/15 transition-all min-h-[56px] group text-left focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {/* Rank number on the left */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center font-label-mono-sm text-xs font-bold text-secondary">
                        #{item.rank}
                      </div>

                      {/* Zone name (bold) with one-line reason below it */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">
                          {item.zone_name || item.zone_id}
                        </div>
                        <div
                          className="text-xs text-on-surface-variant truncate"
                          title={item.reason}
                        >
                          {item.reason}
                        </div>
                      </div>

                      {/* Risk badge on the right that never shrinks */}
                      <div className="flex-shrink-0 whitespace-nowrap">
                        <RiskBadge level={item.risk_level} />
                      </div>
                    </Link>
                  ))}

                  {/* Toggle Button for Top 5 / Show all */}
                  {priorities.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPriorities(!showAllPriorities)}
                      className="mt-1 w-full py-2 px-3 rounded-lg border border-outline-variant/30 bg-surface-container/60 hover:bg-surface-container text-xs font-semibold text-secondary flex items-center justify-center gap-1.5 transition-colors shrink-0"
                    >
                      <span>{showAllPriorities ? 'Show top 5' : `Show all ${priorities.length}`}</span>
                      <span className="material-symbols-outlined text-[16px]">
                        {showAllPriorities ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Quick Dispatch Actions Footer Bar */}
            <div className="p-space-sm bg-surface-container border-t border-outline-variant/20 shrink-0">
              <button
                type="button"
                onClick={() => alert(`Directives dispatched to KMC Command Cell for ${priorities.length} priority zones.`)}
                className="w-full py-2 px-4 bg-primary text-on-primary rounded-lg font-title-md text-sm hover:bg-primary-container transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">send_time_extension</span>
                <span>Broadcast Directives to KMC Cell</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
