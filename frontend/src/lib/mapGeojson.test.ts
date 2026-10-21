import { describe, expect, it } from 'vitest';
import { cloneGeoJson, sanitizeZones } from './mapGeojson';
import type { ZoneGeoJSONFeatureCollection } from '../types';

const sample: ZoneGeoJSONFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'KHI-MALIR',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [67.1, 24.9],
            [67.2, 24.9],
            [67.2, 25.0],
            [67.1, 25.0],
            [67.1, 24.9],
          ],
        ],
      },
      properties: {
        zone_id: 'KHI-MALIR',
        name: 'Malir Basin / Gadap',
        hazard_type: 'combined',
        risk_level: 'Severe',
        probability: 0.8,
        interval_low: 0.3,
        interval_high: 0.7,
        interval: [0.3, 0.7],
        exposed_population: 988888,
        facilities_count: 12,
        vulnerability_score: 0.7,
        evidence_strength: 'high',
        baseline_value: 0.2,
      },
    },
  ],
};

describe('sanitizeZones / MapLibre mutation isolation', () => {
  it('keeps React features after a MapLibre-style in-place wipe of setData payload', () => {
    const sanitized = sanitizeZones(sample, 'exposed_population');
    expect(sanitized.collection.features).toHaveLength(1);

    const forMap = cloneGeoJson(sanitized.collection);
    // Simulate MapLibre mutating the object passed to setData.
    forMap.features.length = 0;
    (forMap as { features: unknown }).features = [];

    expect(sanitized.collection.features).toHaveLength(1);
    expect(sanitized.collection.features[0].properties.zone_id).toBe('KHI-MALIR');
    expect(sample.features).toHaveLength(1);
  });

  it('keeps features when rebuilding from JSON snapshot after wipe', () => {
    const sanitized = sanitizeZones(sample, 'exposed_population');
    const snapshot = JSON.stringify(sanitized.collection);
    const payload = JSON.parse(snapshot);
    payload.features.length = 0;
    expect(JSON.parse(snapshot).features).toHaveLength(1);
  });
});
