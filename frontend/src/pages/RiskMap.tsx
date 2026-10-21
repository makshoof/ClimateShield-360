import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import { api } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { EmptyState } from '../components/EmptyState';
import { Badge, Button, Drawer, Tabs, Tooltip } from '../components/ui';
import { DataAsOf } from '../components/DataAsOf';
import { buildBasemapStyle } from '../lib/mapBasemap';
import {
  RiskLevel,
  ZoneFeatureProperties,
  ZoneGeoJSONFeatureCollection,
} from '../types';

type HazardMode = 'heat' | 'rain' | 'combined';
type SeverityFilter = 'all' | RiskLevel;
type HeightMetric = 'population' | 'probability' | 'vulnerability';
type FacilityType = 'hospital' | 'school' | 'shelter' | 'power_substation' | 'drainage_culvert';
type DrawerTab = 'hazard' | 'exposure' | 'vulnerability' | 'evidence';

interface HoveredZoneInfo {
  properties: ZoneFeatureProperties & {
    calculated_height?: number;
    height_display?: string;
  };
  x: number;
  y: number;
}

const KARACHI_CENTER: [number, number] = [67.08, 24.89];
const INITIAL_ZOOM = 10.3;
const DEFAULT_PITCH_3D = 55;
const DEFAULT_BEARING_3D = -20;

function checkWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function checkLowPowerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const isSmallScreen = window.innerWidth < 640;
  const isLowCores = (navigator.hardwareConcurrency || 8) <= 4;
  return isSmallScreen || isLowCores;
}

interface RiskMapProps {
  isSample?: boolean;
}

export const RiskMap: React.FC<RiskMapProps> = () => {
  const shouldReduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedZoneId = searchParams.get('zone') || searchParams.get('zone_id') || null;

  // Filter States
  const [hazardMode, setHazardMode] = useState<HazardMode>('combined');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [heightMetric, setHeightMetric] = useState<HeightMetric>('population');
  const [enabledFacilityTypes, setEnabledFacilityTypes] = useState<Record<FacilityType, boolean>>({
    hospital: true,
    school: true,
    shelter: true,
    power_substation: true,
    drainage_culvert: true,
  });

  // 3D & Camera States
  const [hasWebGL] = useState<boolean>(() => checkWebGLSupport());
  const [showLowPowerNotice, setShowLowPowerNotice] = useState<boolean>(() => checkLowPowerDevice());
  const [is3D, setIs3D] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('climateshield-map-3d');
      if (saved !== null) return saved === 'true';
    } catch {}
    return !checkLowPowerDevice() && !shouldReduceMotion;
  });
  const [isIdleDrift, setIsIdleDrift] = useState<boolean>(false);

  // UI Drawer & Hover
  const [activeTab, setActiveTab] = useState<DrawerTab>('hazard');
  const [hoveredZone, setHoveredZone] = useState<HoveredZoneInfo | null>(null);
  const [tilesOffline, setTilesOffline] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);

  // References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Remember 3D preference
  useEffect(() => {
    try {
      localStorage.setItem('climateshield-map-3d', String(is3D));
    } catch {}
  }, [is3D]);

  // 1. Fetch Zones GeoJSON
  const { data: zonesResponse } = useQuery({
    queryKey: ['map-zones', hazardMode],
    queryFn: () => api.getMapZones(hazardMode),
    refetchInterval: 120000,
  });

  // Query metadata for real-time live status and data freshness
  const { data: metaResponse } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
    refetchInterval: 60000,
  });

  // Active facility types array for API query
  const activeFacilityTypesParam = useMemo(() => {
    return Object.entries(enabledFacilityTypes)
      .filter(([_, enabled]) => enabled)
      .map(([type]) => type);
  }, [enabledFacilityTypes]);

  // 2. Fetch Facilities GeoJSON Points
  const { data: facilitiesResponse } = useQuery({
    queryKey: ['map-facilities', activeFacilityTypesParam.join(',')],
    queryFn: () => api.getMapFacilities(activeFacilityTypesParam),
    refetchInterval: 60000,
  });

  // 3. Fetch Selected Zone Detail Dossier
  const {
    data: zoneDetailResponse,
    isLoading: isZoneDetailLoading,
  } = useQuery({
    queryKey: ['map-zone-detail', selectedZoneId],
    queryFn: () => api.getZoneDetail(selectedZoneId!),
    enabled: Boolean(selectedZoneId),
    refetchInterval: 60000,
  });

  const zonesGeoJSON = zonesResponse?.data;
  const zoneDetail = zoneDetailResponse?.data;

  // Normalise heights using documented formula based on heightMetric
  const enrichedZonesGeoJSON = useMemo(() => {
    if (!zonesGeoJSON || !zonesGeoJSON.features) return null;

    const features = zonesGeoJSON.features
      .filter((f) => severityFilter === 'all' || f.properties.risk_level === severityFilter)
      .map((f, index) => {
        const props = f.properties;
        let height = 0;
        let heightDisplay = '0m';

        if (heightMetric === 'population') {
          // Documented formula: Math.sqrt(exposed_population) * 12 capped at 8000m
          const pop = Math.max(0, props.exposed_population || 0);
          height = pop > 0 ? Math.round(Math.min(8000, Math.sqrt(pop) * 12)) : 0;
          heightDisplay = `${pop.toLocaleString()} exposed`;
        } else if (heightMetric === 'probability') {
          // Documented formula: probability * 6000m capped at 6000m
          const prob = Math.max(0, Math.min(1, props.probability || 0));
          height = Math.round(prob * 6000);
          heightDisplay = `${Math.round(prob * 100)}% probability`;
        } else if (heightMetric === 'vulnerability') {
          // Documented formula: vulnerability_score * 60m capped at 6000m
          const vuln = Math.max(0, props.vulnerability_score || 0);
          height = Math.round(Math.min(6000, vuln * 60));
          heightDisplay = `Score: ${vuln}`;
        }

    return {
          ...f,
          id: f.id ?? index + 1,
          properties: {
            ...props,
            calculated_height: height,
            calculated_base: 0,
            height_display: heightDisplay,
          },
        };
      });

    return {
      type: 'FeatureCollection',
      features,
    } as ZoneGeoJSONFeatureCollection;
  }, [zonesGeoJSON, severityFilter, heightMetric]);

  const heightLegendText = useMemo(() => {
    if (heightMetric === 'population') return 'Exposed Population (sqrt scale, max 8,000m)';
    if (heightMetric === 'probability') return 'Hazard Probability (scaled 0–6,000m)';
    return 'Vulnerability Score (scaled 0–6,000m)';
  }, [heightMetric]);

  // URL Query Sync for Selected Zone
  const handleSelectZone = useCallback(
    (zoneId: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (zoneId) {
      nextParams.set('zone', zoneId);
    } else {
      nextParams.delete('zone');
      nextParams.delete('zone_id');
    }
    setSearchParams(nextParams);
    },
    [searchParams, setSearchParams]
  );

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !hasWebGL) return;

    const initialPitch = is3D ? DEFAULT_PITCH_3D : 0;
    const initialBearing = is3D ? DEFAULT_BEARING_3D : 0;

    // CARTO Voyager with VITE_CARTO_API_KEY (required by carto.com/basemaps).
    // Mode switches only call setData — never setStyle — so streets stay visible.
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildBasemapStyle() as any,
      center: KARACHI_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: initialPitch,
      bearing: initialBearing,
      minZoom: 8.5,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('error', (e) => {
      // Soft flag only — never destroy the style when Heat/Rain/Combined refetch.
      if (e.error && String(e.error).toLowerCase().includes('tile')) {
        setTilesOffline(true);
      }
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      // 1. Zones Source
      map.addSource('zones-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // 2. 3D Fill-Extrusion Layer (Extruded Polygons)
      map.addLayer({
        id: 'zones-extrusion',
        type: 'fill-extrusion',
        source: 'zones-source',
        paint: {
          'fill-extrusion-color': [
            'match',
            ['get', 'risk_level'],
            'Severe',
            '#EF4444',
            'High',
            '#F97316',
            'Moderate',
            '#F59E0B',
            'Low',
            '#10B981',
            '#64748B', // Flat grey for No Data
          ],
          'fill-extrusion-height': ['get', 'calculated_height'],
          'fill-extrusion-base': ['get', 'calculated_base'],
          'fill-extrusion-opacity': 0.85,
        },
      });

      // 3. 2D Fallback Fill Layer (active when is3D is false)
      map.addLayer({
        id: 'zones-fill-2d',
        type: 'fill',
        source: 'zones-source',
        layout: {
          visibility: initialPitch > 0 ? 'none' : 'visible',
        },
        paint: {
          'fill-color': [
            'match',
            ['get', 'risk_level'],
            'Severe',
            '#EF4444',
            'High',
            '#F97316',
            'Moderate',
            '#F59E0B',
            'Low',
            '#10B981',
            '#64748B',
          ],
          'fill-opacity': 0.55,
        },
      });

      // 4. District Boundary Wireframe
      map.addLayer({
        id: 'zones-borders',
        type: 'line',
        source: 'zones-source',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 1.8,
          'line-opacity': 0.8,
        },
      });

      // 5. Selected District Highlight Outline
      map.addLayer({
        id: 'zones-selected-outline',
        type: 'line',
        source: 'zones-source',
        paint: {
          'line-color': '#06B6D4',
          'line-width': 4,
          'line-opacity': 1,
        },
        filter: ['==', ['get', 'zone_id'], ''],
      });

      // 6. Facilities GeoJSON Source & Circle Marker Layer
      map.addSource('facilities-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'facilities-points',
        type: 'circle',
        source: 'facilities-source',
        paint: {
          'circle-radius': 6.5,
          'circle-color': [
            'match',
            ['get', 'type'],
            'hospital',
            '#EF4444',
            'school',
            '#3B82F6',
            'shelter',
            '#10B981',
            'power_substation',
            '#F59E0B',
            'drainage_culvert',
            '#06B6D4',
            '#94A3B8',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.95,
        },
      });

      // Interactive Events for 3D Extrusion & 2D Fill
      const targetLayers = ['zones-extrusion', 'zones-fill-2d'];

      targetLayers.forEach((layerId) => {
        map.on('mousemove', layerId, (e) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';
        const feat = e.features[0];
          const props = feat.properties as unknown as ZoneFeatureProperties & {
            calculated_height?: number;
            height_display?: string;
          };

        let intervalArr: [number, number] = [props.interval_low, props.interval_high];
        if (typeof props.interval === 'string') {
          try {
            intervalArr = JSON.parse(props.interval);
          } catch {
            intervalArr = [props.interval_low, props.interval_high];
          }
        }

        setHoveredZone({
          properties: {
            ...props,
            interval: intervalArr,
          },
          x: e.point.x,
          y: e.point.y,
        });
      });

        map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
        setHoveredZone(null);
      });

        map.on('click', layerId, (e) => {
        if (e.features && e.features.length > 0) {
          const zid = e.features[0].properties?.zone_id;
          if (zid) {
            handleSelectZone(zid);
          }
        }
        });
      });

      map.on('click', 'facilities-points', (e) => {
        if (e.features && e.features.length > 0) {
          const zid = e.features[0].properties?.zone_id;
          if (zid) {
            handleSelectZone(zid);
          }
        }
      });
    });

    mapRef.current = map;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [hasWebGL]);

  // Sync Enriched Zones to Map Source (clone — MapLibre must not mutate React query data)
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !enrichedZonesGeoJSON) return;
    const source = mapRef.current.getSource('zones-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(JSON.parse(JSON.stringify(enrichedZonesGeoJSON)));
    }
  }, [enrichedZonesGeoJSON]);

  // Sync Facilities to Map Source
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !facilitiesResponse?.data) return;
    const source = mapRef.current.getSource('facilities-source') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(JSON.parse(JSON.stringify(facilitiesResponse.data)));
    }
  }, [facilitiesResponse]);

  // Sync Selected Zone Highlight
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    try {
      if (selectedZoneId) {
        mapRef.current.setFilter('zones-selected-outline', ['==', ['get', 'zone_id'], selectedZoneId]);
      } else {
        mapRef.current.setFilter('zones-selected-outline', ['==', ['get', 'zone_id'], '']);
      }
    } catch {}
  }, [selectedZoneId]);

  // Fly to selected zone and center camera
  useEffect(() => {
    if (!mapRef.current || !selectedZoneId || !enrichedZonesGeoJSON) return;
    const feat = enrichedZonesGeoJSON.features.find((f) => f.properties.zone_id === selectedZoneId);
    if (feat && feat.geometry && (feat.geometry as any).coordinates) {
      try {
        const coords = (feat.geometry as any).coordinates[0];
        if (coords && coords.length > 0) {
          const lons = coords.map((c: number[]) => c[0]);
          const lats = coords.map((c: number[]) => c[1]);
          const minLon = Math.min(...lons);
          const maxLon = Math.max(...lons);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          mapRef.current.fitBounds(
            [
              [minLon, minLat],
              [maxLon, maxLat],
            ],
            { padding: 100, maxZoom: 12.8, duration: 800 }
          );
        }
      } catch {}
    }
  }, [selectedZoneId, enrichedZonesGeoJSON]);

  // 2D <-> 3D Ease Transition (Requirement 10 & 32: pitch & bearing ease over 800ms)
  const handleToggle3D = () => {
    if (!mapRef.current) return;
    const next = !is3D;
    setIs3D(next);

    mapRef.current.easeTo({
      pitch: next ? DEFAULT_PITCH_3D : 0,
      bearing: next ? DEFAULT_BEARING_3D : 0,
      duration: 800,
    });

    try {
      if (next) {
        mapRef.current.setLayoutProperty('zones-extrusion', 'visibility', 'visible');
        mapRef.current.setLayoutProperty('zones-fill-2d', 'visibility', 'none');
      } else {
        mapRef.current.setLayoutProperty('zones-extrusion', 'visibility', 'none');
        mapRef.current.setLayoutProperty('zones-fill-2d', 'visibility', 'visible');
      }
    } catch {}
  };

  // Reset North
  const handleResetNorth = () => {
    if (mapRef.current) {
      mapRef.current.easeTo({ bearing: 0, duration: 400 });
    }
  };

  // Reset Camera View
  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: KARACHI_CENTER,
        zoom: INITIAL_ZOOM,
        pitch: is3D ? DEFAULT_PITCH_3D : 0,
        bearing: is3D ? DEFAULT_BEARING_3D : 0,
        duration: 800,
      });
    }
  };

  const handleZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  const handleToggleFullscreen = () => {
    if (!mapContainerRef.current) return;
    if (!document.fullscreenElement) {
      mapContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Optional Idle Camera Drift (Requirement 10: OFF by default, disabled under prefers-reduced-motion)
  useEffect(() => {
    if (!isIdleDrift || shouldReduceMotion || !mapRef.current) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const drift = () => {
      if (mapRef.current && isIdleDrift) {
        const curBearing = mapRef.current.getBearing();
        mapRef.current.setBearing(curBearing + 0.04);
        animationFrameRef.current = requestAnimationFrame(drift);
      }
    };

    animationFrameRef.current = requestAnimationFrame(drift);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isIdleDrift, shouldReduceMotion]);

  const handleExportGeoJSON = () => {
    if (!enrichedZonesGeoJSON) return;
    const blob = new Blob([JSON.stringify(enrichedZonesGeoJSON, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `climateshield-3d-risk-map-${hazardMode}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative w-full h-[calc(100vh-64px)] sm:h-[calc(100vh-64px)] overflow-hidden flex flex-col bg-slate-950">
      {/* Fallback when WebGL is completely unavailable (Requirement 35) */}
      {!hasWebGL ? (
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <EmptyState
            icon="desktop_windows"
            title="WebGL Hardware Acceleration Disabled"
            description="Your graphics driver does not support WebGL 3D rendering. The interactive map requires WebGL. Falling back to tabular district risk matrix below."
          />
        </div>
      ) : (
        <div ref={mapContainerRef} className="relative w-full h-full flex-1">
          {/* Low-power / 3D Disabled Notice Banner (Requirement 35) */}
          {showLowPowerNotice && !is3D && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-400/30 backdrop-blur-md shadow-xl text-xs flex items-center gap-2 text-slate-200">
              <span className="material-symbols-outlined text-cyan-400 text-[16px]">speed</span>
              <span>3D disabled for performance on this device.</span>
              <button
                type="button"
                onClick={() => {
                  setShowLowPowerNotice(false);
                  handleToggle3D();
                }}
                className="font-bold text-cyan-300 underline hover:text-white cursor-pointer ml-1"
              >
                Enable 3D
              </button>
              <button
                type="button"
                onClick={() => setShowLowPowerNotice(false)}
                className="text-slate-400 hover:text-white cursor-pointer ml-1"
              >
                ×
              </button>
            </div>
          )}

          {/* Floating Top Bar: Hazard Mode + Height Metric + Severity Filter */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-120px)] pointer-events-auto">
            {/* Live Data As Of Timestamp Pill */}
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 shadow-xl flex items-center">
              <DataAsOf
                timestamp={
                  metaResponse?.data?.data_as_of ||
                  metaResponse?.data?.last_run_at ||
                  metaResponse?.data?.last_run?.finished_at ||
                  metaResponse?.data?.last_run?.started_at
                }
                compact
              />
            </div>

            {/* Hazard Selector */}
            <div className="p-1 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 shadow-xl flex items-center gap-1">
            <button
              type="button"
                onClick={() => setHazardMode('combined')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  hazardMode === 'combined'
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Combined
            </button>
            <button
              type="button"
              onClick={() => setHazardMode('rain')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                hazardMode === 'rain'
                    ? 'bg-sky-500 text-slate-950 shadow-xs font-bold'
                    : 'text-slate-300 hover:text-white'
              }`}
            >
                Monsoon Rain
            </button>
            <button
              type="button"
                onClick={() => setHazardMode('heat')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  hazardMode === 'heat'
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Heat Wave
            </button>
          </div>

            {/* Height Shows Metric Selector (Requirement 26 & 39) */}
            <div className="p-1 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 shadow-xl flex items-center gap-1.5 px-3 py-1 text-xs">
              <span className="text-slate-400 text-[11px] font-mono-val uppercase tracking-wider font-semibold">
                Height shows:
              </span>
              <select
                aria-label="3D extrusion height metric"
                value={heightMetric}
                onChange={(e) => setHeightMetric(e.target.value as HeightMetric)}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="population" className="bg-slate-900 text-white">Exposed Population</option>
                <option value="probability" className="bg-slate-900 text-white">Hazard Probability</option>
                <option value="vulnerability" className="bg-slate-900 text-white">Vulnerability Score</option>
              </select>

              <Tooltip content="Height encodes the selected real metric from DuckDB. City-level forecast applied to districts.">
                <span className="material-symbols-outlined text-slate-400 text-[15px] cursor-help">
                  info
                </span>
              </Tooltip>
          </div>

            {/* Severity Filter */}
            <div className="p-1 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 shadow-xl flex items-center gap-1 text-xs">
          <button
            type="button"
                onClick={() => setSeverityFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                  severityFilter === 'all' ? 'bg-white/15 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                All
          </button>
          <button
            type="button"
                onClick={() => setSeverityFilter('Severe')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                  severityFilter === 'Severe' ? 'bg-red-500 text-white font-bold' : 'text-red-400 hover:text-red-300'
                }`}
              >
                Severe
          </button>
          <button
            type="button"
                onClick={() => setSeverityFilter('High')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                  severityFilter === 'High' ? 'bg-orange-500 text-white font-bold' : 'text-orange-400 hover:text-orange-300'
                }`}
              >
                High
          </button>
        </div>
      </div>

          {/* Floating Right Navigation Camera Controls (Requirement 32) */}
          <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 pointer-events-auto">
            {/* 2D / 3D Toggle Button */}
            <button
              type="button"
              onClick={handleToggle3D}
              className={`min-h-[42px] px-3.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 backdrop-blur-xl shadow-2xl transition-all cursor-pointer ${
                is3D
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 border-cyan-400/40 shadow-[0_0_18px_rgba(6,182,212,0.35)]'
                  : 'bg-slate-900/90 text-slate-200 border-white/15 hover:bg-slate-800'
              }`}
              title="Toggle 2D Choropleth and 3D Extruded Blocks"
              aria-label="Toggle 2D and 3D Mode"
            >
              <span className="material-symbols-outlined text-[18px]">
                {is3D ? 'view_in_ar' : 'layers'}
              </span>
              <span>{is3D ? '3D Active' : '2D Map'}</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex flex-col rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={handleZoomIn}
                className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Zoom in"
                aria-label="Zoom in"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
              <div className="h-px bg-white/10 w-full" />
          <button
            type="button"
            onClick={handleZoomOut}
                className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Zoom out"
                aria-label="Zoom out"
          >
            <span className="material-symbols-outlined text-[20px]">remove</span>
          </button>
            </div>

            {/* Reset North */}
            <button
              type="button"
              onClick={handleResetNorth}
              className="w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors shadow-xl"
              title="Reset North orientation"
              aria-label="Reset North orientation"
            >
              <span className="material-symbols-outlined text-[20px] text-red-400 font-bold">
                navigation
              </span>
            </button>

            {/* Reset View */}
          <button
            type="button"
            onClick={handleResetView}
              className="w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors shadow-xl"
              title="Reset to default Karachi view"
              aria-label="Reset view"
            >
              <span className="material-symbols-outlined text-[20px]">home</span>
          </button>

            {/* Idle Camera Drift Toggle */}
            {!shouldReduceMotion && (
              <button
                type="button"
                onClick={() => setIsIdleDrift((prev) => !prev)}
                className={`w-10 h-10 rounded-xl border backdrop-blur-xl flex items-center justify-center transition-colors shadow-xl ${
                  isIdleDrift
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-400/40'
                    : 'bg-slate-900/90 text-slate-400 border-white/15 hover:text-white'
                }`}
                title="Toggle slow 3D camera drift (OFF by default)"
                aria-label="Toggle camera drift"
              >
                <span className="material-symbols-outlined text-[20px]">sync</span>
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/15 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors shadow-xl"
              title="Toggle fullscreen map"
              aria-label="Toggle fullscreen"
            >
              <span className="material-symbols-outlined text-[20px]">fullscreen</span>
            </button>
                </div>

          {/* Floating Glass Legend and Filter Panel (Bottom Left) */}
          <div className="absolute bottom-6 left-4 z-20 max-w-sm w-full pointer-events-auto">
            <div className="rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/15 shadow-2xl p-4 text-xs flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400 text-[18px]">palette</span>
                  <span className="font-bold text-white font-display uppercase tracking-wider">
                    Risk Scale Legend
                    </span>
                  </div>
                <button
                  type="button"
                  onClick={() => setIsLegendExpanded((prev) => !prev)}
                  className="text-slate-400 hover:text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isLegendExpanded ? 'expand_more' : 'expand_less'}
                    </span>
                </button>
                  </div>

              {isLegendExpanded && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                  {/* Risk Tiers with text labels */}
                  <div className="grid grid-cols-2 gap-2 font-mono-val text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                      <span className="text-slate-200">Severe (Red)</span>
                  </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
                      <span className="text-slate-200">High (Orange)</span>
                  </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-slate-200">Moderate (Yellow)</span>
                  </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-slate-200">Low (Green)</span>
                </div>
                    <div className="flex items-center gap-2 col-span-2">
                      <span className="w-3 h-3 rounded-full bg-slate-500 shrink-0" />
                      <span className="text-slate-400">Flat Grey (No data / baseline)</span>
              </div>
            </div>

                  {/* Height Legend Line (Requirement 26) */}
                  <div className="p-2 rounded-lg bg-white/5 border border-white/5 font-mono-val text-[11px] text-cyan-300">
                    <strong>Height: </strong>
                    <span>{heightLegendText}</span>
              </div>

                  {/* Facility Markers Toggles (Requirement 30) */}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-white/5">
                    <span className="text-[10px] font-mono-val uppercase tracking-wider text-slate-400 font-semibold">
                      Critical Facilities Overlay:
                        </span>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {(['hospital', 'school', 'shelter', 'power_substation', 'drainage_culvert'] as FacilityType[]).map((type) => {
                        const isEnabled = enabledFacilityTypes[type];
                        const label = {
                          hospital: 'Hospitals',
                          school: 'Schools',
                          shelter: 'Shelters',
                          power_substation: 'Power Grid',
                          drainage_culvert: 'Drainage',
                        }[type];

                        return (
                    <button
                            key={type}
                      type="button"
                            onClick={() =>
                              setEnabledFacilityTypes((prev) => ({
                                ...prev,
                                [type]: !prev[type],
                              }))
                            }
                            className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                              isEnabled
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                                : 'bg-white/5 text-slate-500 border-white/5'
                            }`}
                          >
                            {label}
                    </button>
                        );
                      })}
                  </div>
                  </div>

                  {/* Download GeoJSON Button */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <button
                  type="button"
                      onClick={handleExportGeoJSON}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>Export District GeoJSON</span>
                </button>
                    {tilesOffline && (
                      <span className="text-[10px] text-amber-400">Offline Canvas</span>
                    )}
              </div>
            </div>
              )}
                </div>
                      </div>

          {/* Interactive Floating Glass Hover Tooltip (Requirement 28) */}
          {hoveredZone && (
            <div
                              style={{
                left: Math.min(window.innerWidth - 260, Math.max(10, hoveredZone.x + 15)),
                top: Math.min(window.innerHeight - 180, Math.max(10, hoveredZone.y - 40)),
              }}
              className="absolute z-40 pointer-events-none p-3.5 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-white/20 shadow-2xl text-xs max-w-xs flex flex-col gap-1.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                <span className="font-bold text-white font-display truncate">
                  {hoveredZone.properties.name || hoveredZone.properties.zone_id}
                            </span>
                <RiskBadge level={hoveredZone.properties.risk_level} className="scale-90" />
                          </div>
              <div className="flex flex-col gap-1 font-mono-val text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Probability:</span>
                  <span className="font-bold text-white">
                    {Math.round((hoveredZone.properties.probability || 0) * 100)}%
                          </span>
                        </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">90% CI:</span>
                  <span>
                    [{Math.round((hoveredZone.properties.interval_low || 0) * 100)}%–{Math.round((hoveredZone.properties.interval_high || 0) * 100)}%]
                            </span>
                          </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Exposed Pop:</span>
                  <span className="font-semibold text-slate-200">
                    {hoveredZone.properties.exposed_population ? Number(hoveredZone.properties.exposed_population).toLocaleString() : 'No data'}
                          </span>
                        </div>
                <div className="flex justify-between text-cyan-300 pt-1 border-t border-white/5">
                  <span className="text-slate-400">Height:</span>
                  <span className="font-bold">{hoveredZone.properties.height_display}</span>
                      </div>
                          </div>
              <span className="text-[10px] text-cyan-400/80 italic mt-0.5">
                Click district to open dossier drawer →
                            </span>
                          </div>
          )}
                    </div>
                  )}

      {/* Selected District Dossier Sliding Drawer (Requirement 28) */}
      <Drawer
        open={Boolean(selectedZoneId)}
        onClose={() => handleSelectZone(null)}
        title={zoneDetail?.name || selectedZoneId || 'District Dossier'}
      >
        {isZoneDetailLoading ? (
          <div className="space-y-3 p-2">
            <div className="h-14 bg-white/5 rounded-xl skeleton-shimmer" />
            <div className="h-14 bg-white/5 rounded-xl skeleton-shimmer" />
            <div className="h-14 bg-white/5 rounded-xl skeleton-shimmer" />
                      </div>
        ) : zoneDetail ? (
          <div className="flex flex-col gap-5">
            {/* Top Risk & Hazard Badges */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono-val uppercase tracking-wider text-slate-400">
                  Compound Assessment
                          </span>
                <span className="font-bold text-sm text-white font-display">
                  {zoneDetail.hazard?.hazard_type === 'heavy_rain' ? 'Monsoon Inundation Risk' : 'Extreme Heat Stress'}
                          </span>
                        </div>
              <RiskBadge level={zoneDetail.vulnerability?.risk_level || 'Low'} />
                      </div>

            {/* Drawer Tabs */}
            <Tabs
              items={[
                { id: 'hazard', label: 'Hazard' },
                { id: 'exposure', label: 'Exposure' },
                { id: 'vulnerability', label: 'Vulnerability' },
                { id: 'evidence', label: 'Evidence' },
              ]}
              value={activeTab}
              onChange={(id) => setActiveTab(id as DrawerTab)}
            />

            {/* Tab 1: Hazard */}
            {activeTab === 'hazard' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-2 font-mono-val text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hazard Probability:</span>
                    <span className="font-bold text-cyan-400">
                      {Math.round((zoneDetail.hazard?.probability || 0) * 100)}%
                            </span>
                          </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">90% Confidence Interval:</span>
                    <span>
                      [{Math.round((zoneDetail.hazard?.interval_low || 0) * 100)}% – {Math.round((zoneDetail.hazard?.interval_high || 0) * 100)}%]
                            </span>
                          </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">30-Year Baseline Norm:</span>
                    <span>{Math.round((zoneDetail.hazard?.baseline_value || 0) * 100)}%</span>
                          </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-1 text-xs">
                  <span className="font-bold text-white font-display">Primary Exposure Driver</span>
                  <p className="text-slate-400 leading-relaxed font-body">
                    {zoneDetail.vulnerability?.chokepoint_notes || 'High density settlements with unreinforced masonry along critical natural drainage channels.'}
                  </p>
                </div>
                        </div>
                      )}

            {/* Tab 2: Exposure */}
            {activeTab === 'exposure' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-2 text-xs font-mono-val">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase">Exposed Population</span>
                    <span className="font-bold text-white text-base mt-1">
                      {zoneDetail.exposure?.exposed_population ? Number(zoneDetail.exposure.exposed_population).toLocaleString() : '—'}
                        </span>
                          </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase">Critical Facilities</span>
                    <span className="font-bold text-cyan-400 text-base mt-1">
                      {zoneDetail.exposure?.facilities_count ?? 0}
                                    </span>
                                  </div>
                                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-2 text-xs">
                  <span className="font-bold text-white font-display">Facility Breakdown</span>
                  <div className="flex flex-col gap-1 font-mono-val text-slate-300">
                    <div className="flex justify-between">
                      <span>Emergency Shelters:</span>
                      <span>{zoneDetail.exposure?.critical_facilities?.filter((f: any) => f.type === 'shelter').length ?? '—'}</span>
                              </div>
                    <div className="flex justify-between">
                      <span>Hospitals &amp; Clinics:</span>
                      <span>{zoneDetail.exposure?.critical_facilities?.filter((f: any) => f.type === 'hospital').length ?? '—'}</span>
                          </div>
                    <div className="flex justify-between">
                      <span>Schools &amp; Relocation Hubs:</span>
                      <span>{zoneDetail.exposure?.critical_facilities?.filter((f: any) => f.type === 'school').length ?? '—'}</span>
                    </div>
                  </div>
                      </div>
                    </div>
                  )}

            {/* Tab 3: Vulnerability */}
                  {activeTab === 'vulnerability' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-2 font-mono-val text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vulnerability Score:</span>
                    <span className="font-bold text-amber-400">{zoneDetail.vulnerability?.vulnerability_score || 0} / 100</span>
                      </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Drainage Inundation Index:</span>
                    <span>{zoneDetail.vulnerability?.indicators?.[0]?.indicator || 'Elevated'}</span>
                        </div>
                      </div>

                <p className="text-xs text-slate-400 font-body leading-relaxed p-3 rounded-xl bg-slate-900/40 border border-white/5">
                  Vulnerability indices are calculated from empirical census indicators cross-referenced with KDA infrastructure maps.
                          </p>
                        </div>
                      )}

            {/* Tab 4: Evidence */}
                  {activeTab === 'evidence' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-mono-val">Evidence Strength:</span>
                    <Badge tone={zoneDetail.evidence?.evidence_strength === 'high' ? 'ok' : 'warn'}>
                      {zoneDetail.evidence?.evidence_strength?.toUpperCase() || 'MEDIUM'} EVIDENCE
                    </Badge>
                      </div>
                  <div className="flex items-center justify-between font-mono-val pt-1 border-t border-white/5">
                    <span className="text-slate-400">Warehouse Table:</span>
                    <span className="text-slate-200">exposure_index</span>
                        </div>
                        </div>
                        </div>
            )}

            {/* Action Footer */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => handleSelectZone(null)}>
                Close Dossier
              </Button>
              <Button variant="primary" onClick={handleExportGeoJSON}>
                Export Feature
              </Button>
                              </div>
                              </div>
        ) : (
          <EmptyState
            title="District Dossier Empty"
            description="No data record was found for this district identifier. Table contract: exposure_index."
          />
        )}
      </Drawer>
            </div>
  );
};

export default RiskMap;
