import { describe, expect, it } from 'vitest';
import native from './__fixtures__/qtEllipseCoverage.native.json';
import { sourceCubicCoverage, type CubicPathElement, type CoverageBounds } from './sourceCubicCoverage';

describe('isolated cubic source coverage', () => {
  for (const [ordinal, fixture] of native.cases.entries()) {
    it(`native host Qt fixture ${ordinal}, AA=${fixture.antialias}`, () => {
      const run = () => sourceCubicCoverage(fixture.pathElements as unknown as CubicPathElement[], fixture.bounds as unknown as CoverageBounds, fixture.antialias);
      if (!fixture.antialias) { expect(run).toThrow('AA-off'); return; }
      const expected = Uint8Array.from(fixture.coverageHex.match(/../g) ?? [], hex => parseInt(hex, 16));
      expect(run()).toEqual(expected);
    });
  }
  it('rejects unsupported paths and unbounded coordinates explicitly', () => {
    expect(() => sourceCubicCoverage([[0, 0, 0], [1, 1, 1]], [0, 0, 2, 2])).toThrow('cubic');
    expect(() => sourceCubicCoverage([[0, 0, 0], [1, 0, 2], [1, 1, 3], [0, 1, 3]], [0, 0, 2, 2])).toThrow('Open');
    expect(() => sourceCubicCoverage([[Infinity, 0, 0]], [0, 0, 2, 2])).toThrow('coordinates');
    expect(() => sourceCubicCoverage([], [0, 0, 10000, 10000])).toThrow('bounds');
  });
  it('returns empty bounded raster for native empty path', () => {
    expect(sourceCubicCoverage([], [-2, -1, 3, 2])).toEqual(new Uint8Array(6));
  });
});
