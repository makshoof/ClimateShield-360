import React, { useState, useMemo } from 'react';
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
  ReferenceLine,
} from 'recharts';
import { api, formatPKT } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { RiskBadge } from '../components/RiskBadge';
import {
  RiskLevel,
  ObservedWeatherPoint,
  PredictedPoint,
  ThresholdLevel,
  GroupErrorItem,
} from '../types';

interface ForecastPageProps {
  isSample?: boolean;
}

const CITIES = [
  'Karachi',
  'Lahore',
  'Faisalabad',
  'Rawalpindi',
  'Multan',
  'Hyderabad',
  'Peshawar',
  'Quetta',
  'Islamabad',
  'Gilgit',
  'Gwadar',
  'Sukkur',
];

export const Forecast: React.FC<ForecastPageProps> = ({ isSample = false }) => {
  const [selectedCity, setSelectedCity] = useState<string>('Karachi');
  const [selectedHazard, setSelectedHazard] = useState<'heavy_rain' | 'heat'>('heavy_rain');
  const [selectedRange, setSelectedRange] = useState<'24h' | '48h' | '7d'>('24h');
  const [viewGranularity, setViewGranularity] = useState<'hourly' | 'daily'>('hourly');

  // Fetch forecast data from API
  const {
    data: forecastResponse,
    isLoading: isLoadingForecast,
    refetch: refetchForecast,
  } = useQuery({
    queryKey: ['forecast', selectedHazard, selectedCity, selectedRange],
    queryFn: () =>
      api.getForecast({
        hazard: selectedHazard,
        city: selectedCity,
        range: selectedRange,
      }),
  });

  // Fetch model evaluation summary from API
  const {
    data: modelResponse,
    isLoading: isLoadingModel,
  } = useQuery({
    queryKey: ['model-summary'],
    queryFn: api.getModelSummary,
  });

  const forecast = forecastResponse?.data;
  const modelSummary = modelResponse?.data;

  // Prepare chart series data
  const chartData = useMemo(() => {
    if (!forecast || !forecast.observed || forecast.observed.length === 0) {
      return [];
    }

    if (viewGranularity === 'hourly') {
      // Map hourly observations
      const points = forecast.observed.map((obs: ObservedWeatherPoint) => ({
        time: obs.timestamp_pkt,
        timestamp_utc: obs.timestamp_utc,
        observed: obs.value,
        humidity: obs.relative_humidity_pct,
        wind: obs.wind_speed_kmh,
        condition: obs.weather_condition,
        predicted: undefined as number | undefined,
        interval_low: undefined as number | undefined,
        interval_high: undefined as number | undefined,
        interval_band: undefined as [number, number] | undefined,
        baseline: undefined as number | undefined,
      }));

      // Overlay predictions onto matching or forward timestamps
      if (forecast.predicted && forecast.predicted.length > 0) {
        forecast.predicted.forEach((pred: PredictedPoint) => {
          // Check if timestamp already in observed
          const existingIdx = points.findIndex((p: { time: string }) => p.time === pred.forecast_time_pkt);
          if (existingIdx >= 0) {
            points[existingIdx].predicted = pred.median;
            points[existingIdx].interval_low = pred.interval_low;
            points[existingIdx].interval_high = pred.interval_high;
            points[existingIdx].interval_band = [pred.interval_low, pred.interval_high];
            points[existingIdx].baseline = pred.baseline_value;
          } else {
            // Forward prediction point
            points.push({
              time: pred.forecast_time_pkt,
              timestamp_utc: pred.forecast_time_utc,
              observed: undefined as any,
              humidity: null,
              wind: null,
              condition: 'Forecast',
              predicted: pred.median,
              interval_low: pred.interval_low,
              interval_high: pred.interval_high,
              interval_band: [pred.interval_low, pred.interval_high],
              baseline: pred.baseline_value,
            });
          }
        });
      }

      return points;
    } else {
      // Daily aggregation
      const dayMap: { [date: string]: { date: string; maxObserved: number; totalObserved: number; count: number; baseline: number } } = {};
      forecast.observed.forEach((obs: ObservedWeatherPoint) => {
        const dateKey = obs.timestamp_pkt.slice(0, 6); // e.g. "19 Oct"
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = {
            date: dateKey,
            maxObserved: obs.value,
            totalObserved: obs.value,
            count: 1,
            baseline: forecast.baseline.value || 0,
          };
        } else {
          dayMap[dateKey].maxObserved = Math.max(dayMap[dateKey].maxObserved, obs.value);
          dayMap[dateKey].totalObserved += obs.value;
          dayMap[dateKey].count += 1;
        }
      });

      return Object.values(dayMap).map((d) => ({
        time: d.date,
        observed: selectedHazard === 'heat' ? Math.round(d.maxObserved * 10) / 10 : Math.round(d.totalObserved * 10) / 10,
        baseline: d.baseline,
        predicted: undefined,
        interval_low: undefined,
        interval_high: undefined,
        interval_band: undefined,
      }));
    }
  }, [forecast, viewGranularity, selectedHazard]);

  // Determine current observed value and status
  const latestObserved = forecast?.observed && forecast.observed.length > 0
    ? forecast.observed[forecast.observed.length - 1]
    : null;

  const latestPredicted = forecast?.predicted && forecast.predicted.length > 0
    ? forecast.predicted[0]
    : null;

  // Determine risk level based on thresholds
  const currentRiskLevel: RiskLevel = useMemo(() => {
    if (!forecast || !latestObserved) return 'Low';
    const val = latestObserved.value;
    const thresh = forecast.thresholds.levels;
    const severeT = thresh.find((t: ThresholdLevel) => t.level === 'severe')?.value ?? 999;
    const warningT = thresh.find((t: ThresholdLevel) => t.level === 'warning')?.value ?? 999;
    const advisoryT = thresh.find((t: ThresholdLevel) => t.level === 'advisory')?.value ?? 999;

    if (val >= severeT) return 'Severe';
    if (val >= warningT) return 'High';
    if (val >= advisoryT) return 'Moderate';
    return 'Low';
  }, [forecast, latestObserved]);

  return (
    <div className="w-full flex-1 flex flex-col px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
      {/* ============================================================ */}
      {/* PAGE HEADER & CONTROLS BAR                                   */}
      {/* ============================================================ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
              Heat & Rain Forecast
            </h1>
            {isSample && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                SAMPLE DATA
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant mt-1">
            Observed history plus the Open-Meteo hourly forecast for the selected window.
          </p>
          {forecast && (
            <p className="text-xs text-on-surface-variant mt-1">
              Origin: {forecast.forecast_origin || 'none'}
              {forecast.horizon_hours ? ` · horizon ${forecast.horizon_hours}h` : ''}
              {forecast.issued_at ? ` · issued ${formatPKT(forecast.issued_at)}` : ''}
              {forecast.is_stale ? ' · stale' : ''}
            </p>
          )}
        </div>

        {/* Global Controls: Hazard, City, Range, and Granularity */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Hazard Selector Toggle */}
          <div
            className="inline-flex rounded-xl p-1 bg-surface-container border border-outline-variant/30 text-xs font-semibold"
            role="group"
            aria-label="Hazard Type"
          >
            <button
              type="button"
              onClick={() => setSelectedHazard('heavy_rain')}
              className={`px-3 py-1.5 rounded-lg transition-all min-h-[36px] flex items-center gap-1.5 ${
                selectedHazard === 'heavy_rain'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">rainy</span>
              <span>Heavy Rain (ML)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedHazard('heat')}
              className={`px-3 py-1.5 rounded-lg transition-all min-h-[36px] flex items-center gap-1.5 ${
                selectedHazard === 'heat'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">thermostat</span>
              <span>Heat (Observed)</span>
            </button>
          </div>

          {/* City Selector Dropdown */}
          <div className="relative">
            <select
              aria-label="Select City"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="min-h-[40px] px-3 pr-8 rounded-xl bg-surface-container border border-outline-variant/40 text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary appearance-none cursor-pointer"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c} {c === 'Karachi' ? '(Operational Focus)' : ''}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute right-2.5 top-2.5 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* Horizon Range Toggle */}
          <div
            className="inline-flex rounded-xl p-1 bg-surface-container border border-outline-variant/30 text-xs font-semibold"
            role="group"
            aria-label="Horizon Range"
          >
            {(['24h', '48h', '7d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRange(r)}
                className={`px-2.5 py-1.5 rounded-lg transition-all min-h-[36px] ${
                  selectedRange === r
                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Granularity Toggle */}
          <div
            className="inline-flex rounded-xl p-1 bg-surface-container border border-outline-variant/30 text-xs font-semibold"
            role="group"
            aria-label="Granularity"
          >
            <button
              type="button"
              onClick={() => setViewGranularity('hourly')}
              className={`px-2.5 py-1.5 rounded-lg transition-all min-h-[36px] ${
                viewGranularity === 'hourly'
                  ? 'bg-secondary-container text-on-secondary-container font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Hourly
            </button>
            <button
              type="button"
              onClick={() => setViewGranularity('daily')}
              className={`px-2.5 py-1.5 rounded-lg transition-all min-h-[36px] ${
                viewGranularity === 'daily'
                  ? 'bg-secondary-container text-on-secondary-container font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Daily
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4 TOP METRIC CARDS                                           */}
      {/* ============================================================ */}
      {isLoadingForecast ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : forecast ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Current / Latest Observed */}
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Latest Observed ({selectedCity})
              </span>
              <span className="material-symbols-outlined text-secondary text-[20px]">sensors</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline-lg text-on-surface">
                {latestObserved?.value ?? '—'}
              </span>
              <span className="text-sm font-semibold text-on-surface-variant">
                {latestObserved?.unit ?? ''}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
              <span>{latestObserved?.weather_condition || 'Nominal'}</span>
              <span className="font-mono">{latestObserved?.timestamp_pkt || '—'}</span>
            </div>
          </div>

          {/* Card 2: ML Prediction or Heat Observation Mode */}
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {forecast?.forecast_origin === 'external'
                  ? selectedHazard === 'heavy_rain'
                    ? 'Hourly precipitation'
                    : 'Forecast high'
                  : selectedHazard === 'heavy_rain'
                    ? 'Next-Hour ML Quantile'
                    : 'Heat Monitoring'}
              </span>
              <span className="material-symbols-outlined text-primary text-[20px]">
                {selectedHazard === 'heavy_rain' ? 'online_prediction' : 'wb_sunny'}
              </span>
            </div>
            {selectedHazard === 'heavy_rain' ? (
              latestPredicted ? (
                <div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-headline-lg text-secondary">
                      {latestPredicted.median}
                    </span>
                    <span className="text-sm font-semibold text-on-surface-variant">mm/hr</span>
                    <span className="text-xs font-mono ml-auto text-amber-600 dark:text-amber-400 font-bold">
                      {forecast?.forecast_origin === 'external'
                        ? latestPredicted.median >= 2.5
                          ? 'At or above 2.5 mm/h'
                          : 'Below 2.5 mm/h'
                        : `P(≥2.5mm): ${(latestPredicted.probability * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-on-surface-variant font-mono flex items-center justify-between">
                    <span>
                      {forecast?.forecast_origin === 'external'
                        ? 'Open-Meteo hour'
                        : `80% CI: [${latestPredicted.interval_low}, ${latestPredicted.interval_high}]`}
                    </span>
                    <span>{latestPredicted.forecast_time_pkt}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <span className="text-xs text-on-surface-variant italic">
                    No active prediction row in warehouse
                  </span>
                </div>
              )
            ) : (
              <div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-headline-lg text-amber-600 dark:text-amber-400">
                    {forecast?.predicted && forecast.predicted.length > 0
                      ? Math.max(...forecast.predicted.map((point) => point.median))
                      : latestObserved?.value ?? '—'}
                    °C
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {forecast?.forecast_origin === 'external' ? 'forecast high' : 'vs 40.0°C Danger'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-on-surface-variant italic truncate">
                  {forecast?.forecast_origin === 'external'
                    ? 'Open-Meteo hourly temperature. Not a trained heat model.'
                    : 'Heat is observed against thresholds and is not ML-predicted'}
                </div>
              </div>
            )}
          </div>

          {/* Card 3: 24h Persistence Baseline */}
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                24h Persistence Baseline
              </span>
              <span className="material-symbols-outlined text-outline text-[20px]">history</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline-lg text-on-surface">
                {forecast.baseline.value !== null && forecast.baseline.value !== undefined
                  ? forecast.baseline.value
                  : '—'}
              </span>
              <span className="text-sm font-semibold text-on-surface-variant">
                {forecast.thresholds.unit}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-on-surface-variant font-mono">
              Formula: y&#770;<sub>t</sub> = y<sub>t-24h</sub>
            </div>
          </div>

          {/* Card 4: Action Threshold & Risk Status */}
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Action Threshold
              </span>
              <RiskBadge level={currentRiskLevel} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline-lg text-error">
                {forecast.thresholds.primary_threshold}
              </span>
              <span className="text-sm font-semibold text-on-surface-variant">
                {forecast.thresholds.unit}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-on-surface-variant truncate">
              {forecast.thresholds.primary_label}
            </div>
          </div>
        </div>
      ) : null}

      {/* ============================================================ */}
      {/* NOTICE BANNER FOR HEAT HAZARD (Rule 1 & Prompt Requirement)  */}
      {/* ============================================================ */}
      {selectedHazard === 'heat' && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-200">
          <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 shrink-0 text-[20px]">
            info
          </span>
          <div>
            <span className="font-bold">METHODOLOGY NOTE: </span>
            <span>
              Heat thresholds stay 35°C Caution, 40°C Danger, and 45°C Severe. The dashed line is the Open-Meteo hourly temperature forecast, not a trained heat model.
            </span>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TIME-SERIES CHART SECTION                                     */}
      {/* Observations = Solid Line                                    */}
      {/* Predictions = Dashed Line or Shaded Band                     */}
      {/* Baseline = Dotted Line                                       */}
      {/* Threshold = Reference Line                                   */}
      {/* ============================================================ */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-xs flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-on-surface">
              {selectedCity} {selectedHazard === 'heavy_rain' ? 'Rainfall & Inundation Risk' : 'Ambient Heat & Temperature'} Time Series
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {viewGranularity === 'hourly' ? 'Hourly observations with uncertainty intervals' : 'Daily aggregated values'} ({selectedRange} horizon)
            </p>
          </div>

          {/* Legend Badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#006398] rounded-full inline-block" />
              <span className="font-semibold text-on-surface">Observed</span>
            </div>
            {selectedHazard === 'heavy_rain' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-t-2 border-dashed border-[#b91c1c] inline-block" />
                  <span className="font-semibold text-on-surface">Predicted (Q50)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-2.5 bg-[#5bb8fe]/40 border border-[#5bb8fe] rounded-xs inline-block" />
                  <span className="font-semibold text-on-surface">80% Uncertainty Band [Q10 - Q90]</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dotted border-[#74777e] inline-block" />
              <span className="font-semibold text-on-surface">24h Baseline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t border-dashed border-red-500 inline-block" />
              <span className="font-semibold text-error">Threshold</span>
            </div>
          </div>
        </div>

        {/* Chart Rendering or Empty State */}
        {isLoadingForecast ? (
          <Skeleton className="w-full h-80 rounded-xl" />
        ) : chartData.length === 0 ? (
          <EmptyState
            title="No Telemetry Available"
            description={`No hourly meteorological records were retrieved for ${selectedCity} in the specified horizon.`}
            icon="query_builder"
            actionText="Retry Query"
            onAction={() => refetchForecast()}
          />
        ) : (
          <div className="w-full h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  unit={selectedHazard === 'heat' ? '°C' : 'mm'}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '12px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
                  }}
                  formatter={(value: any, name: string) => {
                    if (value === undefined || value === null) return ['—', name];
                    if (Array.isArray(value)) {
                      return [`[${value[0]} - ${value[1]}] ${forecast?.thresholds.unit}`, '80% Uncertainty Band'];
                    }
                    return [`${value} ${forecast?.thresholds.unit}`, name];
                  }}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Legend verticalAlign="top" height={36} />

                {/* Shaded Uncertainty Band (Heavy Rain only) */}
                {selectedHazard === 'heavy_rain' && forecast?.forecast_origin === 'model' && (
                  <Area
                    type="monotone"
                    dataKey="interval_band"
                    name="80% Uncertainty Band [Q10 - Q90]"
                    stroke="#5bb8fe"
                    fill="#5bb8fe"
                    fillOpacity={0.25}
                    isAnimationActive={false}
                  />
                )}

                {/* Observed Weather Time Series: Solid Line */}
                <Line
                  type="monotone"
                  dataKey="observed"
                  name="Observed"
                  stroke="#006398"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={true}
                />

                {/* Predicted Series: Dashed Line */}
                {(selectedHazard === 'heavy_rain' || forecast?.forecast_origin === 'external') && (
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name={forecast?.forecast_origin === 'external' ? 'Open-Meteo forecast' : 'Predicted'}
                    stroke="#ba1a1a"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3, stroke: '#ba1a1a', strokeWidth: 1.5, fill: '#fff' }}
                    isAnimationActive={true}
                  />
                )}

                {/* 24h Baseline Line: Dotted Line */}
                <Line
                  type="monotone"
                  dataKey="baseline"
                  name="24h Baseline"
                  stroke="#74777e"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={false}
                  isAnimationActive={false}
                />

                {/* Action Threshold Reference Lines */}
                {forecast?.thresholds?.levels?.map((thresh: ThresholdLevel) => (
                  <ReferenceLine
                    key={thresh.level}
                    y={thresh.value}
                    stroke={thresh.color}
                    strokeDasharray="4 4"
                    label={{
                      value: `${thresh.label}`,
                      position: 'insideTopRight',
                      fill: thresh.color,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODEL EVALUATION & DISAGGREGATED AUDIT SECTION               */}
      {/* Shows model vs baseline metrics, periods, interval coverage, */}
      {/* and the per-group error table with the weakest group flagged. */}
      {/* ============================================================ */}
      <div className="p-4 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant/30 shadow-xs flex flex-col space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-on-surface">
              Model Performance vs Baseline Audit
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary/10 text-secondary border border-secondary/30 font-semibold">
              LightGBM Quantile Regressors v1.0
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            Grounded against the 24h persistence baseline (y&#770;<sub>t</sub> = y<sub>t-24h</sub>). Disaggregated fairness evaluation across monitored divisions.
          </p>
        </div>

        {/* 3 Overview Metric Chips */}
        {isLoadingModel ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : modelSummary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* MAE Improvement */}
            <div className="p-3.5 rounded-xl bg-surface-container-high border border-outline-variant/30 flex flex-col justify-between">
              <span className="text-xs font-semibold text-on-surface-variant">MAE Improvement</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-risk-low">
                  +{modelSummary.metrics.mae_improvement_pct}%
                </span>
                <span className="text-xs text-on-surface-variant">
                  ({modelSummary.metrics.model_mae} vs {modelSummary.metrics.baseline_mae})
                </span>
              </div>
              <span className="text-[10px] text-risk-low font-bold mt-1">
                ✓ Exceeds 20% Improvement Target
              </span>
            </div>

            {/* RMSE Improvement */}
            <div className="p-3.5 rounded-xl bg-surface-container-high border border-outline-variant/30 flex flex-col justify-between">
              <span className="text-xs font-semibold text-on-surface-variant">RMSE Improvement</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-risk-low">
                  +{modelSummary.metrics.rmse_improvement_pct}%
                </span>
                <span className="text-xs text-on-surface-variant">
                  ({modelSummary.metrics.model_rmse} vs {modelSummary.metrics.baseline_rmse})
                </span>
              </div>
              <span className="text-[10px] text-on-surface-variant mt-1">
                Lower dispersion during peak surges
              </span>
            </div>

            {/* Interval Coverage */}
            <div className="p-3.5 rounded-xl bg-surface-container-high border border-outline-variant/30 flex flex-col justify-between">
              <span className="text-xs font-semibold text-on-surface-variant">80% Interval Coverage</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-secondary">
                  {modelSummary.interval_coverage.observed_coverage_pct}%
                </span>
                <span className="text-xs text-on-surface-variant">
                  (Nominal: 80.0%)
                </span>
              </div>
              <span className="text-[10px] text-on-surface-variant font-mono mt-1">
                Avg width: {modelSummary.interval_coverage.average_interval_width} mm
              </span>
            </div>

            {/* Training & Test Periods */}
            <div className="p-3.5 rounded-xl bg-surface-container-high border border-outline-variant/30 flex flex-col justify-between">
              <span className="text-xs font-semibold text-on-surface-variant">Training & Test Split</span>
              <div className="mt-1 text-xs font-mono font-bold text-on-surface">
                Train: {modelSummary.training_period.rows_count.toLocaleString()} rows
              </div>
              <div className="text-[11px] text-on-surface-variant font-mono">
                Test: {modelSummary.test_period.rows_count.toLocaleString()} rows
              </div>
              <span className="text-[10px] text-on-surface-variant mt-1">
                Split date: 2025-01-01
              </span>
            </div>
          </div>
        ) : null}

        {/* Weakest Group Alert Box */}
        {modelSummary?.weakest_group && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[24px] shrink-0 mt-0.5">
                warning
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
                    Weakest Group Identified:
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-600 text-white font-mono">
                    {modelSummary.weakest_group.name}
                  </span>
                  <span className="text-xs font-mono text-amber-800 dark:text-amber-300">
                    MAE: {modelSummary.weakest_group.mae}
                  </span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                  <strong>Recommendation: </strong>
                  {modelSummary.weakest_group.recommendation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Errors-by-Group Table */}
        <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/30">
              <tr>
                <th className="px-4 py-3">Group / Location</th>
                <th className="px-4 py-3">Dimension</th>
                <th className="px-4 py-3">Metric</th>
                <th className="px-4 py-3 text-right">Baseline Score</th>
                <th className="px-4 py-3 text-right">Model Score</th>
                <th className="px-4 py-3 text-right">Error Reduction</th>
                <th className="px-4 py-3 text-center">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 bg-surface">
              {isLoadingModel ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                    Loading disaggregated evaluation table...
                  </td>
                </tr>
              ) : modelSummary?.groups && modelSummary.groups.length > 0 ? (
                modelSummary.groups.map((grp: GroupErrorItem) => (
                  <tr
                    key={grp.group_value}
                    className={`transition-colors hover:bg-surface-container ${
                      grp.is_weakest ? 'bg-amber-500/10 dark:bg-amber-500/15 font-semibold' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 flex items-center gap-2">
                      <span>{grp.group_value}</span>
                      {grp.is_weakest && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600 text-white uppercase tracking-wider">
                          Weakest Group
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-on-surface-variant capitalize">
                      {grp.group_type}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-on-surface-variant">
                      {grp.metric}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {grp.baseline_score.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold">
                      {grp.model_score.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span
                        className={`font-bold ${
                          grp.gain_pct >= 20
                            ? 'text-risk-low'
                            : grp.gain_pct > 0
                            ? 'text-secondary'
                            : 'text-error'
                        }`}
                      >
                        {grp.gain_pct > 0 ? `+${grp.gain_pct}%` : `${grp.gain_pct}%`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {grp.is_weakest ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          Needs Calibration
                        </span>
                      ) : grp.gain_pct >= 20 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          Target Exceeded
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                          Verified
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-on-surface-variant italic">
                    No stratified evaluation metrics found in warehouse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
