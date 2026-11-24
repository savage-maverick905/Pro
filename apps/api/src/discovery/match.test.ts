import { describe, expect, it } from 'vitest';
import { compareBusinesses, type MatchInput } from './match.js';
import { normalizeName } from '../lib/normalize.js';

const biz = (name: string, o: Partial<MatchInput> = {}): MatchInput => ({ normalizedName: normalizeName(name), ...o });
const lat = 51.5, lon = -0.12;
const off = (m: number) => ({ lat: lat + m / 111_000, lon });

describe('compareBusinesses', () => {
  it('auto-merges the same place from two providers', () =>
    expect(compareBusinesses(biz('Café Roma', { lat, lon }), biz('Cafe Roma', { ...off(20) })).level).toBe('high'));
  it('keeps branches of one brand apart', () =>
    expect(compareBusinesses(biz('Pizza Hut', { lat, lon, city: 'London', domain: 'pizzahut.co.uk' }), biz('Pizza Hut', { ...off(2000), city: 'London', domain: 'pizzahut.co.uk' })).level).toBe('low'));
  it('does not merge on shared domain when 500m apart', () =>
    expect(compareBusinesses(biz('Costa Coffee', { lat, lon, domain: 'costa.co.uk' }), biz('Costa Coffee Station', { ...off(500), domain: 'costa.co.uk' })).level).toBe('low'));
  it('flags same phone far apart for review, not merge', () =>
    expect(compareBusinesses(biz('Joe Plumbing', { lat, lon, phoneE164: '+441234567890' }), biz('Joes Plumbing Ltd', { ...off(800), phoneE164: '+441234567890' })).level).toBe('medium'));
  it('merges without coordinates only with strong name and address agreement', () => {
    expect(compareBusinesses(biz('Blue Door Bakery', { address: '12 High Street' }), biz('Blue Door Bakery', { address: '12 High St' })).level).toBe('high');
    expect(compareBusinesses(biz('Blue Door Bakery'), biz('Blue Door Bakery')).level).toBe('medium');
  });
  it('keeps different neighbouring businesses separate', () =>
    expect(compareBusinesses(biz('Blue Door Bakery', { lat, lon }), biz("Joe's Auto Repair", { ...off(10) })).level).toBe('low'));
  it('never merges across different cities', () =>
    expect(compareBusinesses(biz('Acme Dental', { city: 'Leeds', lat, lon }), biz('Acme Dental', { city: 'Bristol', ...off(5000) })).level).toBe('low'));
});
