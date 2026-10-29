import { describe, expect, it } from 'vitest';
import native from './__fixtures__/qtEllipseCoverage.native.json';
import { sourceCubicCoverage } from './sourceCubicCoverage';
import { sourceEllipseContour, sourceSprayEllipseSize } from './sourceEllipseContour';

describe('source ellipse from raw native parameters', () => {
  for (const [ordinal, fixture] of native.cases.entries()) {
    it(`constructs geometry, raster bounds and full native mask ${ordinal}`, () => {
      const [baseWidth, baseHeight] = fixture.effectiveSize;
      const [width, height] = fixture.sourceMinimumClamp
        ? sourceSprayEllipseSize(baseWidth, baseHeight, fixture.scale, fixture.lod)
        : [baseWidth * fixture.scale * fixture.lod, baseHeight * fixture.scale * fixture.lod];
      expect([width, height]).toEqual(fixture.particleSize);
      const result = sourceEllipseContour({ x: fixture.center[0], y: fixture.center[1], width, height, angle: fixture.angle });
      expect(result.bounds).toEqual(fixture.bounds);
      expect(result.elements.length).toBe(fixture.pathElements.length);
      result.elements.forEach((element, i) => {
        expect(element[2]).toBe(fixture.pathElements[i][2]);
        expect(element[0]).toBeCloseTo(fixture.pathElements[i][0], 12);
        expect(element[1]).toBeCloseTo(fixture.pathElements[i][1], 12);
      });
      if (fixture.antialias) {
        const expected = Uint8Array.from(fixture.coverageHex.match(/../g) ?? [], hex => parseInt(hex, 16));
        expect(sourceCubicCoverage(result.elements, result.bounds)).toEqual(expected);
      }
    });
  }
  it('guards geometry and keeps minimum-size policy separate', () => {
    expect(sourceSprayEllipseSize(25, 22, 0, .25)).toEqual([.25, .25]);
    expect(() => sourceSprayEllipseSize(25, 22, 1, 0)).toThrow();
    expect(() => sourceEllipseContour({ x: 0, y: 0, width: 0, height: 1, angle: 0 })).toThrow('Degenerate');
    expect(() => sourceEllipseContour({ x: 0, y: 0, width: 25, height: 22, angle: Math.PI })).toThrow('Fuzzy');
    expect(() => sourceEllipseContour({ x: NaN, y: 0, width: 1, height: 1, angle: 0 })).toThrow();
  });
});
