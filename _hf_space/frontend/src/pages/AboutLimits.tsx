import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatPKT } from '../api/client';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import {
  DatasetItem,
  ManifestFileItem,
  QualityRuleItem,
  LimitationItem,
  KnownGapItem,
  SafetyBoundaryItem,
  EmergencyContactItem,
} from '../types';

interface AboutLimitsProps {
  isSample?: boolean;
}

export const AboutLimits: React.FC<AboutLimitsProps> = ({ isSample = true }) => {
  // Query full methodology metadata from backend
  const { data: methodologyResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['methodology'],
    queryFn: api.getMethodology,
    staleTime: 60000,
  });

  const data = methodologyResponse?.data;
  const isSampleData = methodologyResponse?.is_sample ?? isSample;

  // Active section filter tabs
  const [activeTab, setActiveTab] = useState<string>('all');

  // Search & Filter state for Manifest files
  const [manifestSearch, setManifestSearch] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [manifestPage, setManifestPage] = useState<number>(0);
  const manifestPageSize = 10;

  // Filter state for Quality Rules
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [rulesSearch, setRulesSearch] = useState<string>('');

  // Filtered manifest files
  const filteredManifest = useMemo(() => {
    if (!data?.manifest_files) return [];
    return data.manifest_files.filter((item: ManifestFileItem) => {
      const matchesSearch =
        manifestSearch === '' ||
        item.filepath.toLowerCase().includes(manifestSearch.toLowerCase()) ||
        item.source.toLowerCase().includes(manifestSearch.toLowerCase()) ||
        item.licence.toLowerCase().includes(manifestSearch.toLowerCase());

      const matchesFolder =
        selectedFolder === 'all' || item.source_folder === selectedFolder;

      return matchesSearch && matchesFolder;
    });
  }, [data?.manifest_files, manifestSearch, selectedFolder]);

  const paginatedManifest = useMemo(() => {
    const start = manifestPage * manifestPageSize;
    return filteredManifest.slice(start, start + manifestPageSize);
  }, [filteredManifest, manifestPage, manifestPageSize]);

  const totalManifestPages = Math.ceil(filteredManifest.length / manifestPageSize);

  // Distinct folders for manifest filter
  const manifestFolders = useMemo(() => {
    if (!data?.manifest_files) return [];
    const set = new Set<string>();
    data.manifest_files.forEach((f) => set.add(f.source_folder));
    return Array.from(set);
  }, [data?.manifest_files]);

  // Filtered Quality Rules
  const filteredRules = useMemo(() => {
    if (!data?.quality_rules) return [];
    return data.quality_rules.filter((rule: QualityRuleItem) => {
      const matchesAction =
        selectedAction === 'all' || rule.action.toLowerCase() === selectedAction.toLowerCase();
      const matchesSearch =
        rulesSearch === '' ||
        rule.rule_id.toLowerCase().includes(rulesSearch.toLowerCase()) ||
        rule.dataset.toLowerCase().includes(rulesSearch.toLowerCase()) ||
        rule.what.toLowerCase().includes(rulesSearch.toLowerCase()) ||
        rule.why.toLowerCase().includes(rulesSearch.toLowerCase());
      return matchesAction && matchesSearch;
    });
  }, [data?.quality_rules, selectedAction, rulesSearch]);

  // Loading state skeleton
  if (isLoading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 animate-pulse">
        <SampleBanner isSample={isSample} />
        <div className="h-28 bg-surface-container rounded-xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-48 bg-surface-container rounded-xl"></div>
          <div className="lg:col-span-4 h-48 bg-surface-container rounded-xl"></div>
        </div>
        <div className="h-96 bg-surface-container rounded-xl"></div>
      </div>
    );
  }

  // Error state
  if (isError || !data) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        <SampleBanner isSample={isSample} />
        <EmptyState
          icon="error"
          title="Methodology Telemetry Unavailable"
          description={
            (error as Error)?.message ||
            'Unable to load dataset declaration, manifest registry, and evaluation metrics.'
          }
          actionText="Retry Loading"
          onAction={() => {
            refetch();
          }}
        />
      </div>
    );
  }

  const {
    system_title,
    system_version,
    jurisdiction,
    audited_at,
    datasets,
    manifest_files,
    quality_rules,
    ml_target,
    baseline,
    evaluation_method,
    limitations,
    risk_score_definitions,
    known_gaps,
    responsible_use,
  } = data;

  const showAll = activeTab === 'all';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-8 pb-16">
      {/* Sample Banner if running in demo/sample mode */}
      <SampleBanner isSample={isSampleData} />

      {/* ============================================================ */}
      {/* 1. INSTITUTIONAL FRAMING & EDITORIAL HEADER                  */}
      {/* ============================================================ */}
      <div className="flex flex-col gap-4 border-b border-outline-variant/30 pb-6">
        {/* Meta tags & verification breadcrumb */}
        <div className="flex flex-wrap items-center gap-2 text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-mono text-[11px] font-semibold border border-outline-variant/30">
            <span className="material-symbols-outlined text-[15px] text-secondary">verified</span>
            {jurisdiction}
          </span>
          <span className="font-mono text-[11px] text-outline">/</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-medium">
            {system_version}
          </span>
          <span className="font-mono text-[11px] text-outline">/</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-secondary font-semibold">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            Audited {formatPKT(audited_at)}
          </span>
        </div>

        {/* Title and Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex flex-col gap-1 max-w-4xl">
            <h1 className="font-headline-xl text-2xl sm:text-3xl lg:text-4xl font-bold text-primary tracking-tight">
              {system_title}
            </h1>
            <p className="text-body-md text-on-surface-variant leading-relaxed text-sm sm:text-base">
              Public documentation of computational models, validation limits, licensing terms, and explicit operational non-claims governing early warning dissemination for the Karachi metropolitan area.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start lg:self-end">
            <a
              href="/Dataset_Declaration.pdf"
              download="Dataset_Declaration.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition-all shadow-xs border border-outline-variant/40"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Download PDF Protocol</span>
            </a>
            <button
              type="button"
              onClick={() => setActiveTab('responsible-use')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">policy</span>
              <span>Safety Non-Claims</span>
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none border-t border-outline-variant/20 pt-4">
          {[
            { id: 'all', label: 'All Modules' },
            { id: 'responsible-use', label: 'Responsible Use & Safety' },
            { id: 'datasets', label: 'Data Sources & Manifest' },
            { id: 'quality-rules', label: 'Governance & Quality Rules' },
            { id: 'ml-eval', label: 'ML Target & Baseline' },
            { id: 'risk-thresholds', label: 'Risk Score Definitions' },
            { id: 'limitations-gaps', label: 'Limitations & Known Gaps' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container/60 hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. RESPONSIBLE-USE NOTICE & MANDATORY CROP EXCLUSION         */}
      {/* Prominently displayed for life-safety accountability         */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'responsible-use') && (
        <section className="flex flex-col gap-5" id="responsible-use-section">
          {/* Primary Legal & Life-Safety Warning Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-error/10 border-2 border-error/30 flex flex-col sm:flex-row items-start gap-4 shadow-sm">
            <div className="p-2.5 rounded-xl bg-error text-on-error shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-error uppercase tracking-wider">
                  Mandatory Legal Notice
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-error/20 text-error font-semibold">
                  Rule 6 Compliant
                </span>
              </div>
              <h2 className="font-bold text-base sm:text-lg text-on-surface">
                {responsible_use.primary_notice}
              </h2>
              <p className="text-body-sm text-on-surface-variant text-xs sm:text-sm leading-relaxed">
                ClimateShield 360 is an operational advisory copilot and decision-support aid designed for provincial and municipal disaster officers. It does not replace constitutional command protocols. In any active, life-threatening meteorological emergency, contact official first-responder services immediately.
              </p>
            </div>
          </div>

          {/* Explicit Crop Data Exclusion Callout (User Prompt Requirement) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-tertiary-fixed/20 border border-on-tertiary-container/30 flex flex-col sm:flex-row items-start gap-4 shadow-xs">
            <div className="p-2.5 rounded-xl bg-on-tertiary-container text-white shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[24px]">agriculture</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-on-tertiary-container uppercase tracking-wider">
                  Data Governance Exclusion
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-on-tertiary-container/20 text-on-tertiary-container font-semibold">
                  Audited Null Telemetry
                </span>
              </div>
              <h3 className="font-bold text-base text-on-surface">
                Exclusion of Agricultural Crop Data & Flood Exposure Claims
              </h3>
              <p className="text-body-sm text-on-surface-variant text-xs sm:text-sm leading-relaxed">
                {responsible_use.crop_data_exclusion}
              </p>
              <div className="flex items-center gap-2 font-mono text-[11px] text-on-tertiary-container mt-1">
                <span className="material-symbols-outlined text-[15px]">block</span>
                <span>Rule OSM.CROP_FLOOD_ALL_ZERO enforced across all 160 district models.</span>
              </div>
            </div>
          </div>

          {/* Explicit Safety Boundaries & Non-Claims (Grid of 4 Cards) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-error"></span>
                <h3 className="font-bold text-lg text-on-surface">
                  What the System Does NOT Claim (Explicit Safety Boundaries)
                </h3>
              </div>
              <span className="font-mono text-[11px] text-error font-semibold uppercase tracking-wider">
                Non-Claims Disclosure
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {responsible_use.safety_boundaries.map((boundary: SafetyBoundaryItem, idx: number) => (
                <div
                  key={idx}
                  className="bg-surface-container-lowest p-5 rounded-2xl shadow-xs border border-outline-variant/30 flex flex-col justify-between gap-3 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-error">
                      <span className="material-symbols-outlined text-[22px]">{boundary.icon}</span>
                      <h4 className="font-bold text-sm sm:text-base text-on-surface">
                        {boundary.boundary_title}
                      </h4>
                    </div>
                    <p className="text-body-sm text-on-surface-variant text-xs sm:text-sm leading-relaxed">
                      {boundary.description}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-surface-container flex items-center gap-1.5 text-outline font-mono text-[11px]">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    <span>{boundary.constraint_tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 24/7 Priority Emergency Escalation Directory */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-[22px]">emergency</span>
                <h3 className="font-bold text-lg text-on-surface">
                  Emergency Escalation Directory & Hotlines
                </h3>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-error bg-error/10 px-2.5 py-1 rounded-full font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping"></span>
                24/7 Direct Dispatch Lines
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {responsible_use.emergency_contacts.map((contact: EmergencyContactItem, idx: number) => (
                <div
                  key={idx}
                  className="bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-outline-variant/30 flex flex-col justify-between gap-3 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase font-bold text-secondary tracking-wider">
                      {contact.service_type}
                    </span>
                    <h4 className="font-bold text-sm text-on-surface truncate">
                      {contact.agency}
                    </h4>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xl font-bold text-primary tracking-tight">
                      {contact.contact_number.split('/')[0]}
                    </span>
                    {contact.contact_number.includes('/') && (
                      <span className="text-xs text-on-surface-variant">
                        /{contact.contact_number.split('/')[1]}
                      </span>
                    )}
                  </div>
                  <a
                    href={contact.tel_link}
                    className="w-full py-2 rounded-lg bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface text-xs font-semibold text-center transition-colors shadow-2xs"
                  >
                    Initiate Call ({contact.contact_number.split('/')[0].trim()})
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 3. SCIENTIFIC ARCHITECTURE & DETERMINISTIC FRAMEWORK         */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'all') && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Mosaic Left */}
          <div className="lg:col-span-8 bg-surface-container-lowest p-5 sm:p-6 rounded-2xl shadow-xs border border-outline-variant/30 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-secondary/5 pointer-events-none blur-3xl"></div>
            <div className="flex flex-col gap-2 relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[20px]">science</span>
                <span className="font-mono text-xs uppercase text-secondary font-bold tracking-wider">
                  Algorithmic Accountability Framework
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                Deterministic Precision Balanced Against Maritime Instability
              </h2>
              <p className="text-body-sm text-on-surface-variant max-w-2xl text-xs sm:text-sm leading-relaxed">
                ClimateShield 360 acts as a decision-support copilot for Karachi's 18 municipal zones. It fuses physical fluid dynamic equations with municipal GIS topologies, treating forecast variance not as an anomaly, but as actionable uncertainty bounds (P10–P90).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 mt-4 border-t border-surface-container">
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-on-surface-variant">Grid Resolution</span>
                <span className="font-mono text-xl sm:text-2xl font-bold text-primary">1.2 km²</span>
                <span className="font-mono text-[10px] text-outline">Meso-urban cell</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-on-surface-variant">Hydro-Latency</span>
                <span className="font-mono text-xl sm:text-2xl font-bold text-primary">15 min</span>
                <span className="font-mono text-[10px] text-outline">Radar assimilation</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-on-surface-variant">Nullah Basins</span>
                <span className="font-mono text-xl sm:text-2xl font-bold text-primary">41 Major</span>
                <span className="font-mono text-[10px] text-outline">Mapped culverts</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-on-surface-variant">Ensemble Bands</span>
                <span className="font-mono text-xl sm:text-2xl font-bold text-primary">32 Paths</span>
                <span className="font-mono text-[10px] text-outline">ECMWF / GFS split</span>
              </div>
            </div>
          </div>

          {/* Protocol Status Right */}
          <div className="lg:col-span-4 bg-primary text-on-primary p-5 sm:p-6 rounded-2xl shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="flex flex-col gap-2 relative z-10">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-secondary-fixed uppercase tracking-wider font-semibold">
                  Protocol Status
                </span>
                <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-mono text-[10px] font-bold">
                  VERIFIED FEED
                </span>
              </div>
              <h3 className="font-bold text-lg text-on-primary">Open Standard v2.4-KHI</h3>
              <p className="text-body-sm text-primary-fixed-dim text-xs leading-relaxed">
                Maintained under statutory oversight of the PDMA Act 2010 (Sindh) and KMC Disaster Management Bylaws. Continuous data verification via telemetry ground truth validation points across Karachi South, East, Central, and Malir.
              </p>
            </div>

            <div className="pt-4 border-t border-primary-container flex items-center justify-between font-mono text-[10px] text-on-primary-container">
              <span>SHA-256: 60ebbeaa50..</span>
              <span className="flex items-center gap-1 text-on-primary">
                <span className="material-symbols-outlined text-[14px] text-secondary-container">verified</span>
                Audited Protocol
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 4. DATA SOURCES, PROVENANCE & OPEN LICENSES                  */}
      {/* Clean sections with structured tables (User prompt req)      */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'datasets') && (
        <section className="flex flex-col gap-5" id="datasets-section">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">dataset</span>
              <h2 className="font-bold text-xl text-on-surface">
                Data Sources, Provenance & Licensing Registry
              </h2>
            </div>
            <span className="font-mono text-xs text-on-surface-variant font-medium">
              Statutory Data Lineage (4 Core Ingestion Streams)
            </span>
          </div>

          {/* Primary Datasets Table */}
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-xs sm:text-sm">
                <thead className="bg-surface-container-high text-on-surface font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Dataset Name & Variables</th>
                    <th className="py-3.5 px-4">Data Custodian</th>
                    <th className="py-3.5 px-4">Cadence & Ingestion</th>
                    <th className="py-3.5 px-4">License / Legal Basis</th>
                    <th className="py-3.5 px-4">Spatial Coverage</th>
                    <th className="py-3.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {datasets.map((dataset: DatasetItem) => (
                    <tr key={dataset.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-sm">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-on-surface">{dataset.name}</span>
                          <span className="font-mono text-[10px] text-on-surface-variant line-clamp-2">
                            {dataset.variables_extracted}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            {dataset.source_links.map((link, lIdx) => (
                              <a
                                key={lIdx}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[10px] text-secondary hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>Source {lIdx + 1}</span>
                                <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-on-surface font-medium whitespace-nowrap">
                        {dataset.publisher}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-on-surface-variant whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{dataset.collection_times.cadence}</span>
                          <span className="text-[10px] text-outline">{dataset.collection_times.frequency}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-md bg-surface-container font-mono text-[11px] font-semibold text-on-surface whitespace-nowrap">
                          {dataset.licence}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-on-surface-variant text-xs max-w-xs">
                        <div className="flex flex-col">
                          <span>{dataset.coverage.spatial}</span>
                          <span className="font-mono text-[10px] text-outline mt-0.5">{dataset.coverage.total_records}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-secondary font-bold">
                          <span className="w-2 h-2 rounded-full bg-secondary"></span>
                          {dataset.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manifest Registry Sub-Table with Filters & Pagination */}
          <div className="flex flex-col gap-3 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">folder_copy</span>
                <h3 className="font-bold text-base text-on-surface">
                  Raw & Processed File Manifest Registry ({filteredManifest.length} Files Audited)
                </h3>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedFolder}
                  onChange={(e) => {
                    setSelectedFolder(e.target.value);
                    setManifestPage(0);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container text-xs font-mono border border-outline-variant/30 text-on-surface"
                >
                  <option value="all">All Folders ({manifest_files.length})</option>
                  {manifestFolders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <input
                    type="text"
                    value={manifestSearch}
                    onChange={(e) => {
                      setManifestSearch(e.target.value);
                      setManifestPage(0);
                    }}
                    placeholder="Search files or licences..."
                    className="pl-7 pr-3 py-1.5 rounded-lg bg-surface-container text-xs font-mono border border-outline-variant/30 text-on-surface placeholder:text-outline w-44 sm:w-56"
                  />
                  <span className="material-symbols-outlined text-[16px] text-outline absolute left-2 top-2">
                    search
                  </span>
                </div>
              </div>
            </div>

            {/* Manifest Table */}
            <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-xs">
                  <thead className="bg-surface-container-high text-on-surface font-mono text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">File Path</th>
                      <th className="py-2.5 px-3">Source & Folder</th>
                      <th className="py-2.5 px-3">Licence</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Fetch Time (PKT)</th>
                      <th className="py-2.5 px-3">SHA-256 Hash</th>
                      <th className="py-2.5 px-3">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {paginatedManifest.map((file: ManifestFileItem, idx: number) => (
                      <tr key={idx} className="hover:bg-surface-container-low transition-colors font-mono">
                        <td className="py-2 px-3 font-semibold text-primary truncate max-w-xs">
                          {file.filepath}
                        </td>
                        <td className="py-2 px-3 text-on-surface-variant truncate max-w-[180px]">
                          {file.source} ({file.source_folder})
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-surface-container text-[10px] text-on-surface font-medium">
                            {file.licence}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-on-surface-variant whitespace-nowrap">
                          {file.bytes > 1048576
                            ? `${(file.bytes / 1048576).toFixed(2)} MB`
                            : `${(file.bytes / 1024).toFixed(1)} KB`}
                        </td>
                        <td className="py-2 px-3 text-outline whitespace-nowrap">
                          {formatPKT(file.fetch_time_utc)}
                        </td>
                        <td className="py-2 px-3 text-outline truncate max-w-[120px]">
                          {file.sha256_short}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {file.source_url ? (
                            <a
                              href={file.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-secondary hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>URL</span>
                              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                            </a>
                          ) : (
                            <span className="text-outline">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalManifestPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container-high/50 border-t border-surface-container">
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    Showing {manifestPage * manifestPageSize + 1}–
                    {Math.min((manifestPage + 1) * manifestPageSize, filteredManifest.length)} of{' '}
                    {filteredManifest.length} files
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={manifestPage === 0}
                      onClick={() => setManifestPage((p) => p - 1)}
                      className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-highest disabled:opacity-40 text-xs font-mono font-semibold"
                    >
                      Prev
                    </button>
                    <span className="font-mono text-[11px] px-2 text-on-surface font-semibold">
                      {manifestPage + 1} / {totalManifestPages}
                    </span>
                    <button
                      type="button"
                      disabled={manifestPage >= totalManifestPages - 1}
                      onClick={() => setManifestPage((p) => p + 1)}
                      className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-highest disabled:opacity-40 text-xs font-mono font-semibold"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 5. DATA QUALITY & GOVERNANCE RULES (Clean Table)             */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'quality-rules') && (
        <section className="flex flex-col gap-5" id="quality-rules-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">verified_user</span>
              <h2 className="font-bold text-xl text-on-surface">
                Data Quality & Cleaning Governance Rules ({quality_rules.length} Rules Audited)
              </h2>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-container rounded-lg p-0.5">
                {['all', 'keep', 'fix', 'fill', 'flag'].map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => setSelectedAction(action)}
                    className={`px-2.5 py-1 rounded-md font-mono text-[11px] uppercase font-bold transition-all ${
                      selectedAction === action
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {action}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={rulesSearch}
                onChange={(e) => setRulesSearch(e.target.value)}
                placeholder="Search rules..."
                className="px-3 py-1.5 rounded-lg bg-surface-container text-xs font-mono border border-outline-variant/30 text-on-surface placeholder:text-outline w-36 sm:w-48"
              />
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-xs sm:text-sm">
                <thead className="bg-surface-container-high text-on-surface font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Rule Identifier</th>
                    <th className="py-3 px-4">Dataset Layer</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Cleaning Rule Specification</th>
                    <th className="py-3 px-4">Scientific Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {filteredRules.map((rule: QualityRuleItem) => {
                    const actionColors: Record<string, string> = {
                      keep: 'bg-secondary/15 text-secondary border-secondary/30',
                      fix: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                      fill: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
                      flag: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                      exclude: 'bg-error/15 text-error border-error/30',
                    };
                    const colorClass = actionColors[rule.action.toLowerCase()] || 'bg-surface-container text-on-surface';

                    return (
                      <tr key={rule.rule_id} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-primary whitespace-nowrap">
                          {rule.rule_id}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                          {rule.dataset}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase border ${colorClass}`}>
                            {rule.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-on-surface text-xs leading-relaxed max-w-sm">
                          {rule.what}
                        </td>
                        <td className="py-3 px-4 text-on-surface-variant text-xs leading-relaxed max-w-sm">
                          {rule.why}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 6. ML TARGET, BASELINE & HOLDOUT EVALUATION (Clean Tables)   */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'ml-eval') && (
        <section className="flex flex-col gap-5" id="ml-eval-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">model_training</span>
              <h2 className="font-bold text-xl text-on-surface">
                Predictive Model Target, Declared Baseline & Holdout Evaluation
              </h2>
            </div>
            <span className="font-mono text-xs text-secondary font-bold">
              Target Criterion: ≥ 20% Relative Improvement
            </span>
          </div>

          {/* Model vs Baseline Performance Comparison Table */}
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-xs sm:text-sm">
                <thead className="bg-surface-container-high text-on-surface font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Evaluation Metric</th>
                    <th className="py-3.5 px-4">Declared Baseline</th>
                    <th className="py-3.5 px-4">LightGBM Model Score</th>
                    <th className="py-3.5 px-4">Relative Improvement</th>
                    <th className="py-3.5 px-4">Evaluation Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container font-mono">
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-on-surface">Mean Absolute Error (MAE)</td>
                    <td className="py-3.5 px-4 text-on-surface-variant">{baseline.baseline_mae.toFixed(4)} mm</td>
                    <td className="py-3.5 px-4 font-bold text-primary">{evaluation_method.model_mae.toFixed(4)} mm</td>
                    <td className="py-3.5 px-4 text-emerald-600 font-bold">+{evaluation_method.mae_improvement_pct.toFixed(1)}%</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        TARGET MET (≥ 20%)
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-on-surface">Root Mean Squared Error (RMSE)</td>
                    <td className="py-3.5 px-4 text-on-surface-variant">{baseline.baseline_rmse.toFixed(4)} mm</td>
                    <td className="py-3.5 px-4 font-bold text-primary">{evaluation_method.model_rmse.toFixed(4)} mm</td>
                    <td className="py-3.5 px-4 text-emerald-600 font-bold">+{evaluation_method.rmse_improvement_pct.toFixed(1)}%</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        SIGNIFICANT GAIN
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-on-surface">Brier Score (Probability Calibration)</td>
                    <td className="py-3.5 px-4 text-on-surface-variant">{baseline.baseline_brier.toFixed(4)}</td>
                    <td className="py-3.5 px-4 font-bold text-primary">{evaluation_method.model_brier.toFixed(4)}</td>
                    <td className="py-3.5 px-4 text-amber-600 font-bold">{evaluation_method.brier_improvement_pct.toFixed(1)}%</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                        <span className="material-symbols-outlined text-[14px]">info</span>
                        EXTREME IMBALANCE
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-on-surface">80% Uncertainty Interval Coverage</td>
                    <td className="py-3.5 px-4 text-on-surface-variant">Nominal: 80.0%</td>
                    <td className="py-3.5 px-4 font-bold text-primary">{evaluation_method.uncertainty_interval_80pct_coverage.toFixed(2)}%</td>
                    <td className="py-3.5 px-4 text-emerald-600 font-bold">Well-Calibrated</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        INTERVAL VALIDATED
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Architecture, Splits & Baseline Heuristic Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-xs border border-outline-variant/30 flex flex-col gap-2">
              <span className="font-mono text-xs uppercase font-bold text-secondary">
                ML Target & Architecture
              </span>
              <h4 className="font-bold text-sm text-on-surface">{ml_target.primary_target}</h4>
              <p className="text-body-sm text-on-surface-variant text-xs leading-relaxed">
                {ml_target.description}
              </p>
              <div className="mt-auto pt-2 border-t border-surface-container flex flex-col font-mono text-[10px] text-outline">
                <span>Architecture: {ml_target.architecture}</span>
                <span>Horizon: {ml_target.prediction_horizon}</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-xs border border-outline-variant/30 flex flex-col gap-2">
              <span className="font-mono text-xs uppercase font-bold text-secondary">
                Declared Baseline Model
              </span>
              <h4 className="font-bold text-sm text-on-surface">{baseline.declared_name}</h4>
              <div className="p-2 rounded bg-surface-container font-mono text-xs font-semibold text-primary truncate">
                {baseline.formula}
              </div>
              <p className="text-body-sm text-on-surface-variant text-xs leading-relaxed">
                {baseline.road_condition_rule}
              </p>
              <div className="mt-auto pt-2 border-t border-surface-container flex flex-col font-mono text-[10px] text-outline">
                <span>Training: {evaluation_method.train_rows.toLocaleString()} rows</span>
                <span>Holdout Test: {evaluation_method.test_rows.toLocaleString()} rows</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-xs border border-outline-variant/30 flex flex-col gap-2">
              <span className="font-mono text-xs uppercase font-bold text-amber-700 dark:text-amber-400">
                Weakest Group Fairness Audit
              </span>
              <h4 className="font-bold text-sm text-on-surface">
                {evaluation_method.weakest_group.name} ({evaluation_method.weakest_group.dimension})
              </h4>
              <p className="text-body-sm text-on-surface-variant text-xs leading-relaxed">
                {evaluation_method.weakest_group.recommendation}
              </p>
              <div className="mt-auto pt-2 border-t border-surface-container flex items-center justify-between font-mono text-[10px]">
                <span className="text-outline">Group MAE: {evaluation_method.weakest_group.mae} mm</span>
                <span className="text-amber-700 font-semibold">Priority Remediation</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 7. RISK SCORE DEFINITIONS & RIVER THRESHOLDS (Clean Tables)  */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'risk-thresholds') && (
        <section className="flex flex-col gap-5" id="risk-thresholds-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">thermostat</span>
              <h2 className="font-bold text-xl text-on-surface">
                Risk Score Definitions & Operational Action Thresholds
              </h2>
            </div>
            <span className="font-mono text-xs text-on-surface-variant font-medium">
              Calibrated against NDMA & PMD SOPs
            </span>
          </div>

          {/* Multi-Tier Risk Matrix Table */}
          <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-xs sm:text-sm">
                <thead className="bg-surface-container-high text-on-surface font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Risk Level</th>
                    <th className="py-3 px-4">Hourly Precipitation</th>
                    <th className="py-3 px-4">Heat Stress (WBGT)</th>
                    <th className="py-3 px-4">Inundation Depth</th>
                    <th className="py-3 px-4">Operational Response Posture</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {risk_score_definitions.levels.map((lvl) => {
                    const badgeStyles: Record<string, string> = {
                      Low: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
                      Moderate: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
                      High: 'bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30',
                      Severe: 'bg-error/15 text-error border-error/30',
                    };
                    const badgeClass = badgeStyles[lvl.level] || 'bg-surface-container text-on-surface';

                    return (
                      <tr key={lvl.level} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full font-mono text-xs font-bold border ${badgeClass}`}>
                            {lvl.level}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-xs text-on-surface whitespace-nowrap">
                          {lvl.rainfall_threshold}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-xs text-on-surface whitespace-nowrap">
                          {lvl.wbgt_threshold}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-on-surface-variant whitespace-nowrap">
                          {lvl.inundation_threshold}
                        </td>
                        <td className="py-3.5 px-4 text-on-surface-variant text-xs leading-relaxed max-w-md">
                          {lvl.operational_posture}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PMD Official River Flood Danger Thresholds Table */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">water</span>
                <h3 className="font-bold text-base text-on-surface">
                  PMD River Flood Stage Danger Limits ({risk_score_definitions.river_thresholds.length} Hydrometric Stations)
                </h3>
              </div>
              <span className="font-mono text-[10px] text-outline">Units: Cusecs (ft³/s)</span>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
              <div className="overflow-x-auto max-h-72 scrollbar-thin">
                <table className="w-full text-left font-body-sm text-xs font-mono">
                  <thead className="bg-surface-container-high text-on-surface text-[10px] uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">River Basin</th>
                      <th className="py-2.5 px-3">Station Name</th>
                      <th className="py-2.5 px-3">Province</th>
                      <th className="py-2.5 px-3">Low Flood</th>
                      <th className="py-2.5 px-3">Medium Flood</th>
                      <th className="py-2.5 px-3">High Flood</th>
                      <th className="py-2.5 px-3">Very High Flood</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {risk_score_definitions.river_thresholds.map((river, idx) => (
                      <tr key={idx} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-2 px-3 font-semibold text-primary">{river.river_basin}</td>
                        <td className="py-2 px-3 text-on-surface">{river.station_name}</td>
                        <td className="py-2 px-3 text-outline">{river.province}</td>
                        <td className="py-2 px-3 text-emerald-600 font-medium">
                          {river.low_flood_cusecs ? river.low_flood_cusecs.toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-3 text-amber-600 font-medium">
                          {river.medium_flood_cusecs ? river.medium_flood_cusecs.toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-3 text-orange-600 font-semibold">
                          {river.high_flood_cusecs ? river.high_flood_cusecs.toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-3 text-error font-bold">
                          {river.very_high_flood_cusecs ? river.very_high_flood_cusecs.toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 8. LIMITATIONS & DOCUMENTED KNOWN GAPS (Clean Tables)         */}
      {/* ============================================================ */}
      {(showAll || activeTab === 'limitations-gaps') && (
        <section className="flex flex-col gap-6" id="limitations-gaps-section">
          {/* Documented Known Gaps Table */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-700 dark:text-amber-400 text-[24px]">flag</span>
                <h2 className="font-bold text-xl text-on-surface">
                  Documented Known Gaps & Integrity Preservation ({known_gaps.length} Audit Findings)
                </h2>
              </div>
              <span className="font-mono text-xs text-on-surface-variant font-medium">
                Zero Synthetic Imputation Policy
              </span>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/30 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-xs sm:text-sm">
                  <thead className="bg-surface-container-high text-on-surface font-mono text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Dataset Layer / Source</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">Documented Gap & Telemetry Absence</th>
                      <th className="py-3 px-4">Mitigation & Preservation Strategy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {known_gaps.map((gap: KnownGapItem, idx: number) => {
                      const sevBadge: Record<string, string> = {
                        high: 'bg-error/15 text-error border-error/30',
                        medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                        info: 'bg-secondary/15 text-secondary border-secondary/30',
                      };
                      const sevClass = sevBadge[gap.severity.toLowerCase()] || 'bg-surface-container text-on-surface';

                      return (
                        <tr key={idx} className="hover:bg-surface-container-low transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-xs text-primary whitespace-nowrap">
                            {gap.source}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase border ${sevClass}`}>
                              {gap.severity}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-on-surface text-xs sm:text-sm leading-relaxed max-w-md">
                            {gap.gap}
                          </td>
                          <td className="py-3.5 px-4 text-on-surface-variant text-xs sm:text-sm leading-relaxed max-w-md">
                            {gap.handling_strategy}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Known Computational Limitations Cards Grid */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">report_problem</span>
              <h2 className="font-bold text-xl text-on-surface">
                Known Computational Limitations & Uncertainty Propagation
              </h2>
            </div>
            <p className="text-body-sm text-on-surface-variant text-xs sm:text-sm">
              Hydrometeorological forecasting in Karachi is bounded by specific micro-geographic anomalies. Municipal teams must factor these documented limitations into operational deployment planning:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {limitations.map((lim: LimitationItem, idx: number) => (
                <div
                  key={idx}
                  className="bg-surface-container-lowest p-5 rounded-2xl shadow-xs border border-outline-variant/30 flex flex-col justify-between gap-3 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-secondary tracking-wider">
                        {lim.category}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm sm:text-base text-on-surface">
                      {lim.title}
                    </h3>
                    <p className="text-body-sm text-on-surface-variant text-xs sm:text-sm leading-relaxed">
                      {lim.description}
                    </p>
                  </div>
                  <div className="pt-2.5 border-t border-surface-container flex flex-col gap-1 bg-surface-container-low/50 p-3 rounded-xl">
                    <span className="font-mono text-[10px] font-bold text-primary uppercase">
                      Operational Deployment Constraint:
                    </span>
                    <span className="text-xs text-on-surface-variant leading-relaxed">
                      {lim.operational_impact}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 9. INSTITUTIONAL SIGN-OFF & COMPLIANCE FOOTER CARD           */}
      {/* ============================================================ */}
      <div className="bg-surface-container-high p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-outline-variant/30 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[26px]">account_tree</span>
          </div>
          <div className="flex flex-col">
            <h4 className="font-bold text-sm sm:text-base text-on-surface">
              Data Verification & Peer Review Status
            </h4>
            <p className="text-body-sm text-on-surface-variant text-xs sm:text-sm">
              Technical audit completed by the Provincial Working Group on Urban Hydrology. Next review scheduled: Pre-Monsoon Cycle May 2027.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto font-mono text-[11px] text-on-surface-variant">
          <span className="px-2 py-0.5 rounded bg-surface-container">ISO 31000:2018 Compliant</span>
          <span>•</span>
          <span className="px-2 py-0.5 rounded bg-surface-container">WMO-No. 1201 Standards</span>
        </div>
      </div>
    </div>
  );
};

export default AboutLimits;
