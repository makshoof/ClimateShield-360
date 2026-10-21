"""
Pydantic schemas matching the ClimateShield 360 table contract and API conventions.
Defined in doc/AGENT_RULES.md.
"""

from datetime import datetime
from typing import Any, Dict, Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


# --- API Standard Response Wrappers ---

class APIResponse(BaseModel, Generic[T]):
    """Standard API response structure adhering to doc/AGENT_RULES.md convention."""
    data: T
    generated_at: datetime = Field(
        description="Timestamp in UTC when this response payload was generated"
    )
    is_sample: bool = Field(
        description="True if the data originates from synthetic or seeded demo warehouse"
    )


class ErrorResponse(BaseModel):
    """Standard error response structure adhering to doc/AGENT_RULES.md convention."""
    error: str
    detail: Optional[str] = None


# --- Table Contract Models ---

class RunStatus(BaseModel):
    """Contract: run_status(run_id, started_at, finished_at, status, notes)"""
    run_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: Literal["pending", "running", "success", "failed"]
    notes: Optional[str] = None


class RunStatusExtended(RunStatus):
    """RunStatus with execution duration metrics for timeline visualization."""
    duration_seconds: Optional[float] = None
    is_latest: bool = False


class SourceFreshness(BaseModel):
    """Contract: source_freshness(source_name, publisher, licence, last_fetched_at, expected_every_minutes, status)"""
    source_name: str
    publisher: str
    licence: str
    last_fetched_at: datetime
    expected_every_minutes: int
    status: Literal["fresh", "delayed", "stale", "error"]


class SourceFreshnessComputed(BaseModel):
    """
    Source freshness with dynamically computed SLA status:
    - Fresh: <= 1.0x expected_every_minutes
    - Late: <= 3.0x expected_every_minutes
    - Stale: > 3.0x expected_every_minutes
    """
    source_name: str
    publisher: str
    licence: str
    last_fetched_at: datetime
    expected_every_minutes: int
    stored_status: str
    computed_status: Literal["Fresh", "Late", "Stale"]
    minutes_since_fetch: float
    ratio: float
    delay_minutes: float


class FreshnessSummary(BaseModel):
    total: int
    fresh: int
    late: int
    stale: int
    availability_pct: float


class FreshnessResponseData(BaseModel):
    sources: List[SourceFreshnessComputed]
    summary: FreshnessSummary


class QualityLog(BaseModel):
    """Contract: quality_log(logged_at, source_name, rule, action[fix|fill|flag|exclude], rows_affected, explanation)"""
    logged_at: datetime
    source_name: str
    rule: str
    action: str  # fix, fill, flag, exclude, keep
    rows_affected: int
    explanation: str
    column: Optional[str] = None
    details: Optional[str] = None
    before_value: Optional[str] = None
    after_value: Optional[str] = None


class QualitySummaryCounts(BaseModel):
    fix: int = 0
    fill: int = 0
    flag: int = 0
    exclude: int = 0
    total_actions: int = 0
    rules_audited: int = 0


class QualitySummaryResponseData(BaseModel):
    total_checks: int
    total_records_inspected: int = 0
    missing_count: int = 0
    duplicate_count: int = 0
    excluded_count: int = 0
    fixed: int = 0
    filled: int = 0
    flagged: int = 0
    excluded: int = 0
    fix_count: int = 0
    fill_count: int = 0
    flag_count: int = 0
    exclude_count: int = 0
    total_anomalies: int
    pass_rate_pct: float
    sources_audited: int


class QualityDecisionsResponseData(BaseModel):
    items: List[QualityLog]
    total: int
    limit: int
    offset: int
    sources: List[str]


class DailyQualityCount(BaseModel):
    date: str
    fix: int = 0
    fill: int = 0
    flag: int = 0
    exclude: int = 0
    keep: int = 0
    total: int = 0


class Prediction(BaseModel):
    """Contract: predictions(zone_id, forecast_time, hazard_type, probability, interval_low, interval_high, baseline_value)"""
    zone_id: str
    forecast_time: datetime
    hazard_type: Literal["heat", "heavy_rain"]
    probability: float
    interval_low: float
    interval_high: float
    baseline_value: float


class ModelEval(BaseModel):
    """Contract: model_eval(group_type, group_value, metric, baseline_score, model_score)"""
    group_type: str
    group_value: str
    metric: str
    baseline_score: float
    model_score: float


class ModelEvalExtended(ModelEval):
    """ModelEval with computed error reduction and weakest group flag."""
    error_reduction_pct: Optional[float] = None
    is_weakest: bool = False


class ModelEvalResponseData(BaseModel):
    evaluations: List[ModelEvalExtended]
    weakest_group: Optional[ModelEvalExtended] = None
    overall_baseline_mae: Optional[float] = None
    overall_model_mae: Optional[float] = None
    overall_reduction_pct: Optional[float] = None


class ExposureIndex(BaseModel):
    """Contract: exposure_index(zone_id, hazard_type, exposed_population, facilities_count, vulnerability_score, risk_level, evidence_strength)"""
    zone_id: str
    hazard_type: Literal["heat", "heavy_rain"]
    exposed_population: int
    facilities_count: int
    vulnerability_score: float
    risk_level: Literal["Low", "Moderate", "High", "Severe"]
    evidence_strength: Literal["low", "medium", "high"]


class Facility(BaseModel):
    """Contract: facilities(facility_id, type, name, zone_id, lat, lon)"""
    facility_id: str
    type: str
    name: str
    zone_id: str
    lat: float
    lon: float


class ImpactIndicator(BaseModel):
    """Contract: impact_indicators(zone_id, impact_area, indicator, value, evidence_strength, source, row_ids)"""
    zone_id: str
    impact_area: str
    indicator: str
    value: float
    evidence_strength: Literal["low", "medium", "high"]
    source: str
    row_ids: str


class Zone(BaseModel):
    """Contract: zones(zone_id, name, geometry_geojson)"""
    zone_id: str
    name: str
    geometry_geojson: str


# --- Pipeline Status Schemas ---

class NextScheduledRunInfo(BaseModel):
    source: str
    cron: Optional[str] = None
    next_run_utc: Optional[datetime] = None
    next_run_pkt: Optional[str] = None
    display_text: str


class HourlyEvidenceInfo(BaseModel):
    runs_last_24h: int
    success_count: int
    failed_count: int
    success_rate_pct: float
    avg_duration_seconds: Optional[float] = None
    has_runs: bool


class ErrorLogEntry(BaseModel):
    run_id: str
    started_at: datetime
    status: str
    error_message: str
    duration_seconds: Optional[float] = None


class PipelineStatusData(BaseModel):
    latest_successful_run: Optional[RunStatusExtended] = None
    latest_run: Optional[RunStatusExtended] = None
    is_late: bool
    minutes_since_last_success: Optional[float] = None
    status_indicator: Literal["ok", "late", "failed"]
    quality_summary: QualitySummaryCounts
    next_scheduled_run: Optional[NextScheduledRunInfo] = None
    hourly_evidence: Optional[HourlyEvidenceInfo] = None
    error_logs: List[ErrorLogEntry] = []
    model_version: Optional[str] = None
    evaluation_status: Optional[str] = None


# --- Health & Metadata Models ---

class HealthData(BaseModel):
    status: str = "ok"
    db_connected: bool
    duckdb_version: str
    tables_found: List[str]


class LastRunSummary(BaseModel):
    run_id: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class SourceMetaInfo(BaseModel):
    source_name: str
    age_minutes: float
    status: str
    expected_every_minutes: int
    publisher: Optional[str] = None
    licence: Optional[str] = None
    last_fetched_at: Optional[datetime] = None
    last_data_timestamp: Optional[datetime] = None


class MetaData(BaseModel):
    app_name: str = "ClimateShield 360"
    version: str = "0.1.0"
    is_sample: bool
    timezone_stored: str = "UTC"
    timezone_display: str = "PKT (UTC+5)"
    db_path: str
    last_run: Optional[LastRunSummary] = None
    data_as_of: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    next_run_at: Optional[datetime] = None
    sources: List[SourceMetaInfo] = []
    is_live: bool = False


# --- Overview & Priorities Schemas ---

class PredictionPoint(BaseModel):
    forecast_time: datetime
    hours_ahead: int
    probability: float
    interval_low: float
    interval_high: float
    baseline_value: float
    hazard_type: str
    median: Optional[float] = None


class HazardMetricSummary(BaseModel):
    hazard_type: str
    hazard_level: str  # Severe, High, Moderate, Low
    headline_value: Optional[float] = None
    unit: str
    interval_low: Optional[float] = None
    interval_high: Optional[float] = None
    source: str
    label: str
    kind: str = "observed"


class FreshnessMetricSummary(BaseModel):
    status: str  # Nominal, Degraded, Stale
    fresh_sources: int
    total_sources: int
    lagging_source: Optional[str] = None
    integrity_pct: float


class SevereZonesMetricSummary(BaseModel):
    severe_count: int
    total_count: int
    hotspots: List[str]
    risk_level: str = "Severe"


class OverviewData(BaseModel):
    time_range: str
    heat_hazard_level: str
    rain_hazard_level: str
    severe_zones_count: int
    total_zones_count: int
    severe_zone_names: List[str]
    data_freshness_status: str
    heat_summary: HazardMetricSummary
    rain_summary: HazardMetricSummary
    freshness_summary: FreshnessMetricSummary
    severe_summary: SevereZonesMetricSummary
    predictions_series: dict[str, List[PredictionPoint]]


class PriorityItem(BaseModel):
    rank: int
    zone_id: str
    zone_name: str
    hazard_type: str
    risk_level: str
    exposed_population: int
    facilities_count: int
    vulnerability_score: float
    evidence_strength: str
    score: float
    action_title: str
    reason: str


# --- Map & GeoJSON Schemas ---

class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: Any


class ZoneFeatureProperties(BaseModel):
    zone_id: str
    name: str
    hazard_type: str
    risk_level: Literal["Low", "Moderate", "High", "Severe"]
    probability: float
    interval_low: float
    interval_high: float
    interval: List[float] = Field(description="[interval_low, interval_high]")
    exposed_population: int
    facilities_count: int
    vulnerability_score: float
    evidence_strength: str
    baseline_value: float


class ZoneGeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: GeoJSONGeometry
    properties: ZoneFeatureProperties


class ZoneGeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[ZoneGeoJSONFeature]


class FacilityFeatureProperties(BaseModel):
    facility_id: str
    type: str
    name: str
    zone_id: str
    lat: float
    lon: float


class FacilityGeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: GeoJSONGeometry
    properties: FacilityFeatureProperties


class FacilityGeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[FacilityGeoJSONFeature]


class ZoneHazardDetail(BaseModel):
    hazard_type: str
    probability: Optional[float] = None
    interval_low: Optional[float] = None
    interval_high: Optional[float] = None
    interval: List[float] = []
    baseline_value: Optional[float] = None
    heat_probability: Optional[float] = None
    heat_interval: Optional[List[float]] = None
    rain_probability: Optional[float] = None
    rain_interval: Optional[List[float]] = None
    wbgt_celsius: Optional[float] = None
    rainfall_6h_mm: Optional[float] = None
    warning_label: str


class DemographicBreakdown(BaseModel):
    children_under_5: int
    elderly_65_plus: int
    informal_settlements_pct: float


class ZoneExposureDetail(BaseModel):
    exposed_population: int
    facilities_count: int
    demographics: Optional[DemographicBreakdown] = None
    critical_facilities: List[Facility] = []


class ZoneVulnerabilityDetail(BaseModel):
    vulnerability_score: float
    risk_level: Literal["Low", "Moderate", "High", "Severe"]
    heat_risk_level: str
    rain_risk_level: str
    chokepoint_notes: Optional[str] = None
    indicators: List[ImpactIndicator] = []


class EvidenceSourceItem(BaseModel):
    source: str
    row_ids: str
    indicator: str
    impact_area: str
    evidence_strength: str


class ZoneEvidenceDetail(BaseModel):
    evidence_strength: str
    sources_count: int
    sources: List[EvidenceSourceItem]
    model_provenance: str = "ClimateShield 360 Urban Ensemble v1.0"
    last_calibrated: Optional[str] = None


class ZoneDetailResponseData(BaseModel):
    zone_id: str
    name: str
    geometry: Optional[GeoJSONGeometry] = None
    hazard: ZoneHazardDetail
    exposure: ZoneExposureDetail
    vulnerability: ZoneVulnerabilityDetail
    evidence: ZoneEvidenceDetail


# --- Forecast and Weather Time-Series Models ---

class ObservedWeatherPoint(BaseModel):
    timestamp_utc: datetime
    timestamp_pkt: str
    value: float
    unit: str
    relative_humidity_pct: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    weather_condition: Optional[str] = None


class PredictedPoint(BaseModel):
    forecast_time_utc: datetime
    forecast_time_pkt: str
    probability: float
    interval_low: float
    interval_high: float
    median: float
    baseline_value: float
    unit: str = "mm/hr"


class ThresholdLevel(BaseModel):
    level: str  # "advisory", "warning", "severe"
    value: float
    label: str
    color: str


class ForecastThresholds(BaseModel):
    unit: str
    primary_threshold: float
    primary_label: str
    levels: List[ThresholdLevel]


class BaselineInfo(BaseModel):
    name: str = "24h Persistence Baseline"
    description: str = "y_hat_t = y_{t-24h}"
    value: Optional[float] = None


class ForecastResponseData(BaseModel):
    hazard: Literal["heavy_rain", "heat"]
    city: str
    range: Literal["24h", "48h", "7d"]
    observed: List[ObservedWeatherPoint]
    predicted: Optional[List[PredictedPoint]] = None
    baseline: BaselineInfo
    declared_target: str
    thresholds: ForecastThresholds
    note: Optional[str] = None
    model_version: Optional[str] = None
    generated_at: datetime
    issued_at: Optional[datetime] = None
    horizon_hours: Optional[int] = None
    forecast_origin: Literal["model", "external", "none"] = "none"
    is_stale: bool = False
    stale_reason: Optional[str] = None


# --- Model Summary and Evaluation Models ---

class ModelVsBaselineMetrics(BaseModel):
    baseline_declared: str
    model_architecture: str
    model_mae: float
    baseline_mae: float
    mae_improvement_pct: float
    model_rmse: float
    baseline_rmse: float
    rmse_improvement_pct: float
    model_brier: Optional[float] = None
    baseline_brier: Optional[float] = None
    model_r2: Optional[float] = None
    meets_20pct_target: bool


class PeriodInfo(BaseModel):
    description: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    rows_count: int


class IntervalCoverageInfo(BaseModel):
    nominal_coverage_pct: float = 80.0
    observed_coverage_pct: float = 97.42
    average_interval_width: float = 0.11
    width_unit: str = "mm"


class WeakestGroupInfo(BaseModel):
    dimension: str
    name: str
    mae: float
    recommendation: str


class GroupErrorItem(BaseModel):
    group_type: str
    group_value: str
    metric: str
    baseline_score: float
    model_score: float
    gain_pct: float
    is_weakest: bool = False


class ModelSummaryResponseData(BaseModel):
    metrics: ModelVsBaselineMetrics
    training_period: PeriodInfo
    test_period: PeriodInfo
    interval_coverage: IntervalCoverageInfo
    weakest_group: WeakestGroupInfo
    groups: List[GroupErrorItem]
    model_version: str = "lightgbm_quantile_v1.0"


class ImpactIndicatorMetric(BaseModel):
    name: str
    value: Optional[float] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    evidence_strength: Literal["low", "medium", "high", "limited"] = "medium"
    source: Optional[str] = None
    row_ids: List[str] = []


class TimeSeriesPoint(BaseModel):
    timestamp_utc: datetime
    timestamp_pkt: Optional[str] = None
    metrics: Dict[str, Optional[float]] = {}


class ImpactTimeSeries(BaseModel):
    variable_name: str
    unit: str
    points: List[TimeSeriesPoint] = []


class ImpactDomainData(BaseModel):
    impact_area: str
    title: str
    evidence_level: Literal["measured", "indicator-based", "limited"]
    supported_data: bool
    risk_level: Optional[Literal["Low", "Moderate", "High", "Severe"]] = None
    coverage: float  # percent of districts with data (e.g. 100.0 or 0.0)
    coverage_count: Optional[int] = None
    coverage_total: Optional[int] = None
    source_names: List[str] = []
    row_ids: List[str] = []
    limitations: str
    indicators: List[ImpactIndicatorMetric] = []
    time_series: Optional[ImpactTimeSeries] = None


# --- Emergency Action Planner Models ---

class PlannerMeasureItem(BaseModel):
    measure_id: str
    title: str
    category: str
    action: str
    target: str
    priority: Literal["Immediate", "Urgent", "Standard"]


class ResourceGapDetail(BaseModel):
    is_gap: bool
    population_per_facility: int
    severity: Literal["Severe", "Elevated", "Normal"]
    explanation: str
    mitigation_action: str


class PlannerDistrictItem(BaseModel):
    rank: int
    district_id: str
    district_name: str
    hazard_type: Literal["heat", "heavy_rain"]
    risk_level: Literal["Low", "Moderate", "High", "Severe"]
    vulnerability_score: float
    exposed_population: int
    facilities_count: int
    evidence_strength: str
    # Reason fields
    forecast_probability: Optional[float] = None
    forecast_interval_low: Optional[float] = None
    forecast_interval_high: Optional[float] = None
    baseline_value: Optional[float] = None
    interval_unit: str = "unavailable"
    reason_summary: str
    # Suggested measures from fixed mapping in code
    suggested_measures: List[PlannerMeasureItem]
    # Row IDs used
    row_ids: List[str]
    # Resource gap flag
    resource_gap: bool
    resource_gap_details: ResourceGapDetail


class CityForecastSummary(BaseModel):
    hazard_type: str
    time_range: str
    avg_probability: Optional[float] = None
    interval_low: Optional[float] = None
    interval_high: Optional[float] = None
    baseline_value: Optional[float] = None
    interval_unit: str = "unavailable"
    cutoff_time_utc: datetime
    cutoff_time_pkt: str
    note: Optional[str] = None
    display_value: Optional[float] = None
    display_unit: str = ""
    display_label: str = ""
    origin: str = "none"
    issued_at: Optional[datetime] = None


class ResourceGapSummary(BaseModel):
    total_districts_evaluated: int
    flagged_gap_districts_count: int
    total_exposed_population: int
    total_facilities_registered: int
    citywide_ratio: int
    flagged_district_names: List[str]
    facilities_by_type: Dict[str, int]
    policy_notice: str


class PlannerResponseData(BaseModel):
    hazard: Literal["heat", "heavy_rain"]
    range: Literal["24h", "48h", "7d"]
    city: str
    city_forecast: CityForecastSummary
    districts: List[PlannerDistrictItem]
    resource_summary: ResourceGapSummary
    operational_note: str = "Decision support only, not emergency dispatch instructions."


# --- Methodology & Data Governance Models ---

class DatasetCollectionTimes(BaseModel):
    earliest: str
    latest: str
    frequency: str
    cadence: str


class DatasetCoverage(BaseModel):
    spatial: str
    temporal: str
    total_records: str
    file_count: int
    total_bytes: int


class DatasetItem(BaseModel):
    id: str
    name: str
    publisher: str
    source_links: List[str]
    licence: str
    collection_times: DatasetCollectionTimes
    coverage: DatasetCoverage
    variables_extracted: str
    credibility_rationale: str
    status: str


class ManifestFileItem(BaseModel):
    filepath: str
    source: str
    source_folder: str
    licence: str
    source_url: str
    fetch_time_utc: str
    bytes: int
    sha256_short: str


class QualityRuleItem(BaseModel):
    rule_id: str
    dataset: str
    action: str  # keep, fix, fill, flag
    what: str
    why: str


class MLTargetInfo(BaseModel):
    primary_target: str
    secondary_targets: List[str]
    units: str
    prediction_horizon: str
    training_split: str
    test_split: str
    architecture: str
    description: str


class MethodologyBaselineInfo(BaseModel):
    declared_name: str
    formula: str
    description: str
    road_condition_rule: str
    baseline_mae: float
    baseline_rmse: float
    baseline_brier: float
    success_criterion: str


class EvaluationMethodInfo(BaseModel):
    validation_strategy: str
    train_period: str
    train_rows: int
    test_period: str
    test_rows: int
    model_mae: float
    model_rmse: float
    model_r2: float
    model_brier: float
    mae_improvement_pct: float
    rmse_improvement_pct: float
    brier_improvement_pct: float
    meets_20pct_target: bool
    uncertainty_interval_80pct_coverage: float
    average_interval_width_mm: float
    weakest_group: Dict[str, Any]


class LimitationItem(BaseModel):
    title: str
    category: str
    description: str
    operational_impact: str


class RiskLevelDefinition(BaseModel):
    level: str  # Low, Moderate, High, Severe
    color: str  # green, yellow, orange, red
    rainfall_threshold: str
    wbgt_threshold: str
    inundation_threshold: str
    operational_posture: str


class EvidenceTierDefinition(BaseModel):
    tier: str
    description: str
    criteria: str


class RiverDangerThresholdItem(BaseModel):
    river_basin: str
    station_name: str
    province: str
    low_flood_cusecs: Optional[int] = None
    medium_flood_cusecs: Optional[int] = None
    high_flood_cusecs: Optional[int] = None
    very_high_flood_cusecs: Optional[int] = None
    exceptionally_high_cusecs: Optional[int] = None


class RiskScoreDefinitions(BaseModel):
    levels: List[RiskLevelDefinition]
    evidence_tiers: List[EvidenceTierDefinition]
    river_thresholds: List[RiverDangerThresholdItem]


class KnownGapItem(BaseModel):
    source: str
    severity: str  # high, medium, info
    gap: str
    handling_strategy: str


class EmergencyContactItem(BaseModel):
    agency: str
    service_type: str
    contact_number: str
    tel_link: str
    badge_color: str


class SafetyBoundaryItem(BaseModel):
    boundary_title: str
    icon: str
    description: str
    constraint_tag: str


class ResponsibleUseNotes(BaseModel):
    primary_notice: str
    crop_data_exclusion: str
    safety_boundaries: List[SafetyBoundaryItem]
    emergency_contacts: List[EmergencyContactItem]


class MethodologyResponseData(BaseModel):
    system_title: str
    system_version: str
    jurisdiction: str
    audited_at: str
    datasets: List[DatasetItem]
    manifest_files: List[ManifestFileItem]
    quality_rules: List[QualityRuleItem]
    ml_target: MLTargetInfo
    baseline: MethodologyBaselineInfo
    evaluation_method: EvaluationMethodInfo
    limitations: List[LimitationItem]
    risk_score_definitions: RiskScoreDefinitions
    known_gaps: List[KnownGapItem]
    responsible_use: ResponsibleUseNotes


class InsightQuestion(BaseModel):
    question: str = ""


class InsightCitation(BaseModel):
    source: str
    detail: str
    title: Optional[str] = None
    section: Optional[str] = None


class InsightFact(BaseModel):
    label: str
    value: str
    unit: str


class InsightDataRow(BaseModel):
    label: str
    row_id: str


class InsightAnswer(BaseModel):
    question: str
    status: Literal["answered", "unknown", "unavailable"]
    answer: str
    citations: List[InsightCitation] = []
    limitations: Optional[str] = None
    supported: bool = False
    facts: List[InsightFact] = []
    data_rows: List[InsightDataRow] = []
    model_label: Optional[str] = None
    zone: Optional[str] = None
    safety_related: bool = False


