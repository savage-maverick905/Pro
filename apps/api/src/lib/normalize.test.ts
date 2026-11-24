import { describe, expect, it } from 'vitest';
import { normalizeDomain, normalizeName } from './normalize.js';

describe('normalizeName', () => {
  it('strips accents, case and punctuation', () => expect(normalizeName("Café  Münch's!")).toBe('cafe munch s'));
  it('keeps non-latin letters', () => expect(normalizeName('東京 ラーメン')).toBe('東京 ラーメン'));
});
describe('normalizeDomain', () => {
  it('handles www and paths', () => expect(normalizeDomain('https://www.Example.com/a?b=1')).toBe('example.com'));
  it('accepts bare domains', () => expect(normalizeDomain('example.co.uk')).toBe('example.co.uk'));
  it('rejects junk', () => { expect(normalizeDomain('not a url')).toBeNull(); expect(normalizeDomain(null)).toBeNull(); });
});
