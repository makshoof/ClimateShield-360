/**
 * TypeScript types matching ClimateShield 360 table contract and API conventions.
 * Defined in doc/AGENT_RULES.md.
 */

export interface APIResponse<T> {
  data: T;
  generated_at: string;
  is_sample: boolean;
}

export interface ErrorResponse {
  error: string;
  detail?: string;
}

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe';
export type HazardType = 'heat' | 'heavy_rain';
export type EvidenceStrength = 'low' | 'medium' | 'high';
export type SLAStatus = 'Fresh' | 'Late' | 'Stale';

export interface HealthData {
  status: string;
  db_connected: boolean;
  duckdb_version: string;
  tables_found: string[];
}

export interface LastRunSummary {
  run_id?: string;
  started_at?: string;
  finished_at?: string;
  status?: 'pending' | 'running' | 'success' | 'failed';
  notes?: string;
}

export interface SourceMetaInfo {
  source_name: string;
  age_minutes: number;
  status: string;
  expected_every_minutes: number;
  publisher?: string | null;
  licence?: string | null;
  last_fetched_at?: string | null;
  last_data_timestamp?: string | null;
}

export interface MetaData {
  app_name: string;
  version: string;
  is_sample: boolean;
  timezone_stored: string;
  timezone_display: string;
  db_path: string;
  last_run?: LastRunSummary | null;
  data_as_of?: string | null;
  last_run_at?: string | null;
  last_run_status?: string | null;
  next_run_at?: string | null;
  sources?: SourceMetaInfo[];
  is_live?: boolean;
}

export interface RunStatus {
  run_id: string;
  started_at: string;
  finished_at?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  notes?: string;
}

export interface RunStatusExtended extends RunStatus {
  duration_seconds?: number | null;
  is_latest?: boolean;
}

export interface SourceFreshness {
  source_name: string;
  publisher: string;
  licence: string;
  last_fetched_at: string;
  expected_every_minutes: number;
  status: 'fresh' | 'delayed' | 'stale' | 'error';
}

export interface SourceFreshnessComputed {
  source_name: string;
  publisher: string;
  licence: string;
  last_fetched_at: string;
  expected_every_minutes: number;
  stored_status: string;
  computed_status: SLAStatus;
  minutes_since_fetch: number;
  ratio: number;
  delay_minutes: number;
}

export interface FreshnessSummary {
  total: number;
  fresh: number;
  late: number;
  stale: number;
  availability_pct: number;
}

export interface FreshnessResponseData {
  sources: SourceFreshnessComputed[];
  summary: FreshnessSummary;
}

export interface NextScheduledRunInfo {
  source: string;
  cron?: string | null;
  next_run_utc?: string | null;
  next_run_pkt?: string | null;
  display_text: string;
}

export interface HourlyEvidenceInfo {
  runs_last_24h: number;
  success_count: number;
  failed_count: number;
  success_rate_pct: number;
  avg_duration_seconds?: number | null;
  has_runs: boolean;
}

export interface ErrorLogEntry {
  run_id: string;
  started_at: string;
  status: string;
  error_message: string;
  duration_seconds?: number | null;
}

export interface QualitySummaryCounts {
  fix: number;
  fill: number;
  flag: number;
  exclude?: number;
  total_actions: number;
  rules_audited: number;
}

export interface PipelineStatusData {
  latest_successful_run?: RunStatusExtended | null;
  latest_run?: RunStatusExtended | null;
  is_late: boolean;
  minutes_since_last_success?: number | null;
  status_indicator: 'ok' | 'late' | 'failed';
  quality_summary: QualitySummaryCounts;
  next_scheduled_run?: NextScheduledRunInfo | null;
  hourly_evidence?: HourlyEvidenceInfo | null;
  error_logs?: ErrorLogEntry[];
  model_version?: string | null;
  evaluation_status?: string | null;
}

export interface QualityLog {
  logged_at: string;
  source_name: string;
  rule: string;
  action: 'fix' | 'fill' | 'flag' | 'exclude' | 'keep' | string;
  rows_affected: number;
  explanation: string;
  column?: string | null;
  details?: string | null;
  before_value?: string | null;
  after_value?: string | null;
}

export interface QualitySummaryResponseData {
  total_checks: number;
  total_records_inspected: number;
  missing_count: number;
  duplicate_count: number;
  excluded_count: number;
  fixed: number;
  filled: number;
  flagged: number;
  excluded?: number;
  fix_count: number;
  fill_count: number;
  flag_count: number;
  exclude_count: number;
  total_anomalies: number;
  pass_rate_pct: number;
  sources_audited: number;
}

export interface QualityDecisionsResponseData {
  items: QualityLog[];
  total: number;
  limit: number;
  offset: number;
  sources: string[];
}

export interface DailyQualityCount {
  date: string;
  fix: number;
  fill: number;
  flag: number;
  exclude?: number;
  total: number;
}

export interface Prediction {
  zone_id: string;
  forecast_time: string;
  hazard_type: HazardType;
  probability: number;
  interval_low: number;
  interval_high: number;
  baseline_value: number;
}

export interface ModelEval {
  group_type: string;
  group_value: string;
  metric: string;
  baseline_score: number;
  model_score: number;
}

export interface ModelEvalExtended extends ModelEval {
  error_reduction_pct?: number | null;
  is_weakest: boolean;
}

export interface ModelEvalResponseData {
  evaluations: ModelEvalExtended[];
  weakest_group?: ModelEvalExtended | null;
  overall_baseline_mae?: number | null;
  overall_model_mae?: number | null;
  overall_reduction_pct?: number | null;
}

export interface ExposureIndex {
  zone_id: string;
  hazard_type: HazardType;
  exposed_population: number;
  facilities_count: number;
  vulnerability_score: number;
  risk_level: RiskLevel;
  evidence_strength: EvidenceStrength;
}

export interface Facility {
  facility_id: string;
  type: string;
  name: string;
  zone_id: string;
  lat: number;
  lon: number;
}

export interface ImpactIndicator {
  zone_id: string;
  impact_area: string;
  indicator: string;
  value: number;
  evidence_strength: EvidenceStrength;
  source: string;
  row_ids: string;
}

export interface Zone {
  zone_id: string;
  name: string;
  geometry_geojson: string;
}

// --- Overview & Priorities Interfaces ---

export interface PredictionPoint {
  forecast_time: string;
  hours_ahead: number;
  probability: number;
  interval_low: number;
  interval_high: number;
  baseline_value: number;
  hazard_type: string;
  median?: number | null;
}

export interface HazardMetricSummary {
  hazard_type: string;
  hazard_level: RiskLevel;
  headline_value: number | null;
  unit: string;
  interval_low?: number | null;
  interval_high?: number | null;
  source: string;
  label: string;
  kind?: string;
}

export interface FreshnessMetricSummary {
  status: string;
  fresh_sources: number;
  total_sources: number;
  lagging_source?: string | null;
  integrity_pct: number;
}

export interface SevereZonesMetricSummary {
  severe_count: number;
  total_count: number;
  hotspots: string[];
  risk_level: RiskLevel;
}

export interface OverviewData {
  time_range: '24h' | '48h' | '7d';
  heat_hazard_level: RiskLevel;
  rain_hazard_level: RiskLevel;
  severe_zones_count: number;
  total_zones_count: number;
  severe_zone_names: string[];
  data_freshness_status: string;
  heat_summary: HazardMetricSummary;
  rain_summary: HazardMetricSummary;
  freshness_summary: FreshnessMetricSummary;
  severe_summary: SevereZonesMetricSummary;
  predictions_series: Record<string, PredictionPoint[]>;
}

export interface PriorityItem {
  rank: number;
  zone_id: string;
  zone_name: string;
  hazard_type: string;
  risk_level: RiskLevel;
  exposed_population: number;
  facilities_count: number;
  vulnerability_score: number;
  evidence_strength: string;
  score: number;
  action_title: string;
  reason: string;
}

// --- Map & Geospatial Types ---

export interface GeoJSONGeometry {
  type: string;
  coordinates: any;
}

export interface ZoneFeatureProperties {
  zone_id: string;
  name: string;
  hazard_type: string;
  risk_level: RiskLevel;
  probability: number;
  interval_low: number;
  interval_high: number;
  interval: [number, number];
  exposed_population: number;
  facilities_count: number;
  vulnerability_score: number;
  evidence_strength: EvidenceStrength;
  baseline_value: number;
}

export interface ZoneGeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: ZoneFeatureProperties;
}

export interface ZoneGeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneGeoJSONFeature[];
}

export interface FacilityFeatureProperties {
  facility_id: string;
  type: string;
  name: string;
  zone_id: string;
  lat: number;
  lon: number;
}

export interface FacilityGeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: FacilityFeatureProperties;
}

export interface FacilityGeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: FacilityGeoJSONFeature[];
}

export interface DemographicBreakdown {
  children_under_5: number;
  elderly_65_plus: number;
  informal_settlements_pct: number;
}

export interface ZoneHazardDetail {
  hazard_type: string;
  probability: number;
  interval_low: number;
  interval_high: number;
  interval: [number, number];
  baseline_value: number;
  heat_probability?: number | null;
  heat_interval?: [number, number] | null;
  rain_probability?: number | null;
  rain_interval?: [number, number] | null;
  wbgt_celsius?: number | null;
  rainfall_6h_mm?: number | null;
  warning_label: string;
}

export interface ZoneExposureDetail {
  exposed_population: number;
  facilities_count: number;
  demographics?: DemographicBreakdown | null;
  critical_facilities: Facility[];
}

export interface ZoneVulnerabilityDetail {
  vulnerability_score: number;
  risk_level: RiskLevel;
  heat_risk_level: string;
  rain_risk_level: string;
  chokepoint_notes?: string | null;
  indicators: ImpactIndicator[];
}

export interface EvidenceSourceItem {
  source: string;
  row_ids: string;
  indicator: string;
  impact_area: string;
  evidence_strength: string;
}

export interface ZoneEvidenceDetail {
  evidence_strength: EvidenceStrength;
  sources_count: number;
  sources: EvidenceSourceItem[];
  model_provenance: string;
  last_calibrated?: string | null;
}

export interface ZoneDetailData {
  zone_id: string;
  name: string;
  geometry?: GeoJSONGeometry | null;
  hazard: ZoneHazardDetail;
  exposure: ZoneExposureDetail;
  vulnerability: ZoneVulnerabilityDetail;
  evidence: ZoneEvidenceDetail;
}

export interface ObservedWeatherPoint {
  timestamp_utc: string;
  timestamp_pkt: string;
  value: number;
  unit: string;
  relative_humidity_pct?: number | null;
  wind_speed_kmh?: number | null;
  weather_condition?: string | null;
}

export interface PredictedPoint {
  forecast_time_utc: string;
  forecast_time_pkt: string;
  probability: number;
  interval_low: number;
  interval_high: number;
  median: number;
  baseline_value: number;
  unit: string;
}

export interface ThresholdLevel {
  level: string;
  value: number;
  label: string;
  color: string;
}

export interface ForecastThresholds {
  unit: string;
  primary_threshold: number;
  primary_label: string;
  levels: ThresholdLevel[];
}

export interface BaselineInfo {
  name: string;
  description: string;
  value?: number | null;
}

export interface ForecastData {
  hazard: 'heavy_rain' | 'heat';
  city: string;
  range: '24h' | '48h' | '7d';
  observed: ObservedWeatherPoint[];
  predicted?: PredictedPoint[] | null;
  baseline: BaselineInfo;
  declared_target: string;
  thresholds: ForecastThresholds;
  note?: string | null;
  model_version?: string | null;
  generated_at: string;
  issued_at?: string | null;
  horizon_hours?: number | null;
  forecast_origin?: 'model' | 'external' | 'none';
  is_stale?: boolean;
  stale_reason?: string | null;
}

export interface ModelVsBaselineMetrics {
  baseline_declared: string;
  model_architecture: string;
  model_mae: number;
  baseline_mae: number;
  mae_improvement_pct: number;
  model_rmse: number;
  baseline_rmse: number;
  rmse_improvement_pct: number;
  model_brier?: number | null;
  baseline_brier?: number | null;
  model_r2?: number | null;
  meets_20pct_target: boolean;
}

export interface PeriodInfo {
  description: string;
  start_date?: string | null;
  end_date?: string | null;
  rows_count: number;
}

export interface IntervalCoverageInfo {
  nominal_coverage_pct: number;
  observed_coverage_pct: number;
  average_interval_width: number;
  width_unit: string;
}

export interface WeakestGroupInfo {
  dimension: string;
  name: string;
  mae: number;
  recommendation: string;
}

export interface GroupErrorItem {
  group_type: string;
  group_value: string;
  metric: string;
  baseline_score: number;
  model_score: number;
  gain_pct: number;
  is_weakest: boolean;
}

export interface ModelSummaryData {
  metrics: ModelVsBaselineMetrics;
  training_period: PeriodInfo;
  test_period: PeriodInfo;
  interval_coverage: IntervalCoverageInfo;
  weakest_group: WeakestGroupInfo;
  groups: GroupErrorItem[];
  model_version: string;
}

export interface ImpactIndicatorMetric {
  name: string;
  value?: number | null;
  unit?: string | null;
  description?: string | null;
  evidence_strength: 'low' | 'medium' | 'high' | 'limited';
  source?: string | null;
  row_ids: string[];
}

export interface TimeSeriesPoint {
  timestamp_utc: string;
  timestamp_pkt?: string | null;
  metrics: Record<string, number | null>;
}

export interface ImpactTimeSeries {
  variable_name: string;
  unit: string;
  points: TimeSeriesPoint[];
}

export interface ImpactDomainData {
  impact_area: string;
  title: string;
  evidence_level: 'measured' | 'indicator-based' | 'limited';
  supported_data: boolean;
  risk_level?: RiskLevel | null;
  coverage: number;
  coverage_count?: number | null;
  coverage_total?: number | null;
  source_names: string[];
  row_ids: string[];
  limitations: string;
  indicators: ImpactIndicatorMetric[];
  time_series?: ImpactTimeSeries | null;
}

// --- Emergency Action Planner Types ---

export interface PlannerMeasureItem {
  measure_id: string;
  title: string;
  category: string;
  action: string;
  target: string;
  priority: 'Immediate' | 'Urgent' | 'Standard';
}

export interface ResourceGapDetail {
  is_gap: boolean;
  population_per_facility: number;
  severity: 'Severe' | 'Elevated' | 'Normal';
  explanation: string;
  mitigation_action: string;
}

export interface PlannerDistrictItem {
  rank: number;
  district_id: string;
  district_name: string;
  hazard_type: 'heat' | 'heavy_rain';
  risk_level: RiskLevel;
  vulnerability_score: number;
  exposed_population: number;
  facilities_count: number;
  evidence_strength: string;
  // Reason fields
  forecast_probability: number | null;
  forecast_interval_low: number | null;
  forecast_interval_high: number | null;
  baseline_value: number | null;
  interval_unit?: string;
  reason_summary: string;
  // Suggested measures
  suggested_measures: PlannerMeasureItem[];
  // Row IDs used
  row_ids: string[];
  // Resource gap
  resource_gap: boolean;
  resource_gap_details: ResourceGapDetail;
}

export interface CityForecastSummary {
  hazard_type: string;
  time_range: string;
  avg_probability: number | null;
  interval_low: number | null;
  interval_high: number | null;
  baseline_value: number | null;
  interval_unit?: string;
  cutoff_time_utc: string;
  cutoff_time_pkt: string;
  note?: string | null;
  display_value?: number | null;
  display_unit?: string;
  display_label?: string;
  origin?: string;
  issued_at?: string | null;
}

export interface ResourceGapSummary {
  total_districts_evaluated: number;
  flagged_gap_districts_count: number;
  total_exposed_population: number;
  total_facilities_registered: number;
  citywide_ratio: number;
  flagged_district_names: string[];
  facilities_by_type: Record<string, number>;
  policy_notice: string;
}

export interface PlannerResponseData {
  hazard: 'heat' | 'heavy_rain';
  range: '24h' | '48h' | '7d';
  city: string;
  city_forecast: CityForecastSummary;
  districts: PlannerDistrictItem[];
  resource_summary: ResourceGapSummary;
  operational_note: string;
}

// --- Methodology & Data Governance Types ---

export interface DatasetCollectionTimes {
  earliest: string;
  latest: string;
  frequency: string;
  cadence: string;
}

export interface DatasetCoverage {
  spatial: string;
  temporal: string;
  total_records: string;
  file_count: number;
  total_bytes: number;
}

export interface DatasetItem {
  id: string;
  name: string;
  publisher: string;
  source_links: string[];
  licence: string;
  collection_times: DatasetCollectionTimes;
  coverage: DatasetCoverage;
  variables_extracted: string;
  credibility_rationale: string;
  status: string;
}

export interface ManifestFileItem {
  filepath: string;
  source: string;
  source_folder: string;
  licence: string;
  source_url: string;
  fetch_time_utc: string;
  bytes: number;
  sha256_short: string;
}

export interface QualityRuleItem {
  rule_id: string;
  dataset: string;
  action: 'keep' | 'fix' | 'fill' | 'flag' | 'exclude' | string;
  what: string;
  why: string;
}

export interface MLTargetInfo {
  primary_target: string;
  secondary_targets: string[];
  units: string;
  prediction_horizon: string;
  training_split: string;
  test_split: string;
  architecture: string;
  description: string;
}

export interface MethodologyBaselineInfo {
  declared_name: string;
  formula: string;
  description: string;
  road_condition_rule: string;
  baseline_mae: number;
  baseline_rmse: number;
  baseline_brier: number;
  success_criterion: string;
}

export interface EvaluationMethodInfo {
  validation_strategy: string;
  train_period: string;
  train_rows: number;
  test_period: string;
  test_rows: number;
  model_mae: number;
  model_rmse: number;
  model_r2: number;
  model_brier: number;
  mae_improvement_pct: number;
  rmse_improvement_pct: number;
  brier_improvement_pct: number;
  meets_20pct_target: boolean;
  uncertainty_interval_80pct_coverage: number;
  average_interval_width_mm: number;
  weakest_group: {
    dimension?: string;
    name?: string;
    mae?: number;
    recommendation?: string;
    [key: string]: any;
  };
}

export interface LimitationItem {
  title: string;
  category: string;
  description: string;
  operational_impact: string;
}

export interface RiskLevelDefinition {
  level: string; // Low, Moderate, High, Severe
  color: string; // green, yellow, orange, red
  rainfall_threshold: string;
  wbgt_threshold: string;
  inundation_threshold: string;
  operational_posture: string;
}

export interface EvidenceTierDefinition {
  tier: string;
  description: string;
  criteria: string;
}

export interface RiverDangerThresholdItem {
  river_basin: string;
  station_name: string;
  province: string;
  low_flood_cusecs?: number | null;
  medium_flood_cusecs?: number | null;
  high_flood_cusecs?: number | null;
  very_high_flood_cusecs?: number | null;
  exceptionally_high_cusecs?: number | null;
}

export interface RiskScoreDefinitions {
  levels: RiskLevelDefinition[];
  evidence_tiers: EvidenceTierDefinition[];
  river_thresholds: RiverDangerThresholdItem[];
}

export interface KnownGapItem {
  source: string;
  severity: 'high' | 'medium' | 'info' | string;
  gap: string;
  handling_strategy: string;
}

export interface EmergencyContactItem {
  agency: string;
  service_type: string;
  contact_number: string;
  tel_link: string;
  badge_color: string;
}

export interface SafetyBoundaryItem {
  boundary_title: string;
  icon: string;
  description: string;
  constraint_tag: string;
}

export interface ResponsibleUseNotes {
  primary_notice: string;
  crop_data_exclusion: string;
  safety_boundaries: SafetyBoundaryItem[];
  emergency_contacts: EmergencyContactItem[];
}

export interface InsightCitation {
  source: string;
  detail: string;
  title?: string | null;
  section?: string | null;
}

export interface InsightFact {
  label: string;
  value: string;
  unit: string;
}

export interface InsightDataRow {
  label: string;
  row_id: string;
}

export interface InsightAnswer {
  question: string;
  status: 'answered' | 'unknown' | 'unavailable';
  answer: string;
  citations: InsightCitation[];
  limitations?: string | null;
  supported?: boolean;
  facts?: InsightFact[];
  data_rows?: InsightDataRow[];
  model_label?: string | null;
  zone?: string | null;
  safety_related?: boolean;
}

export interface MethodologyResponseData {
  system_title: string;
  system_version: string;
  jurisdiction: string;
  audited_at: string;
  datasets: DatasetItem[];
  manifest_files: ManifestFileItem[];
  quality_rules: QualityRuleItem[];
  ml_target: MLTargetInfo;
  baseline: MethodologyBaselineInfo;
  evaluation_method: EvaluationMethodInfo;
  limitations: LimitationItem[];
  risk_score_definitions: RiskScoreDefinitions;
  known_gaps: KnownGapItem[];
  responsible_use: ResponsibleUseNotes;
}


