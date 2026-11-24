import { describe, expect, it } from 'vitest';
import { buildOverpassQuery, normalizeElement } from './providers/overpass.js';

const area = { label: 'x', lat: 51.5, lon: -0.1, radiusM: 5000 };
describe('overpass', () => {
  it('builds category and keyword selectors with escaping', () => {
    const q = buildOverpassQuery(area, ['amenity=restaurant'], ['a"b.c'], 50);
    expect(q).toContain('nwr["amenity"="restaurant"]["name"](around:5000,51.5,-0.1);');
    expect(q).toContain('a\\\\\\"b\\\\.c');
    expect(q).toContain('out center tags 50;');
  });
  it('reports "none_found" (not verified) when OSM has no website tag', () => {
    const p = normalizeElement({ type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'X', amenity: 'cafe' } });
    expect(p?.websiteStatus).toBe('none_found');
  });
  it('skips unnamed elements', () => expect(normalizeElement({ type: 'node', id: 2, tags: { amenity: 'cafe' } })).toBeNull());
});
