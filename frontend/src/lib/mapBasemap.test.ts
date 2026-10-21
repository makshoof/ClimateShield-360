import { describe, expect, it } from 'vitest';
import { buildBasemapStyle, isHardStyleFailure, tilesForSet } from './mapBasemap';

describe('mapBasemap', () => {
  it('default style includes a raster basemap source', () => {
    const style = buildBasemapStyle();
    expect(style.sources.basemap).toBeTruthy();
    expect((style.sources.basemap as { type: string }).type).toBe('raster');
    expect(style.layers.some((l) => l.id === 'basemap-raster')).toBe(true);
  });

  it('does not treat ordinary tile errors as hard style failures', () => {
    expect(isHardStyleFailure('Failed to load tile 10/715/421')).toBe(false);
    expect(isHardStyleFailure('AJAXError: 403')).toBe(false);
    expect(isHardStyleFailure('Failed to fetch style.json')).toBe(true);
  });

  it('exposes carto and osm tile sets', () => {
    expect(tilesForSet('carto').length).toBeGreaterThan(0);
    expect(tilesForSet('osm').some((u) => u.includes('openstreetmap'))).toBe(true);
  });
});
