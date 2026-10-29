import { describe, expect, it } from 'vitest';
import type { SourceDabMaterialSpec } from '../presets/sourceDabCache';
import { sourcePngMaskExtent } from '../presets/sourcePngGeometry';
import { sourceImageTransformPlan } from '../presets/sourceImageTransformPlan';
import { resolvedTransformedMaskPlan, transformedMaskVertexCount, writeTransformedMaskVertices } from './TransformedMaskPlan';
const spec = (): SourceDabMaterialSpec => {
  const brush = { width: 5, height: 3, scale: .9, angle: .17 }, shape = { scale: .63, ratio: .7, rotation: .8 };
  const [width, height] = sourcePngMaskExtent(brush, shape, .25, .75);
  return { sequence: 4, brushIdentity: 'authored-immutable-source', brush, shape, width, height, position: { x: 1, y: 2 },
    key: { color: 'fixed', angle: shape.rotation, width, height, subPixelX: .25, subPixelY: .75, softness: 1, lightness: 1, ratio: .7, index: 0, mirrorH: false, mirrorV: false },
    mirror: { horizontal: false, vertical: false, coordinateSystemFlipped: false } };
};
describe('saved material to one-pass transform boundary', () => {
  it('uses saved logical/static shape and raw negative normalization exactly once', () => {
    const s = spec(), p = resolvedTransformedMaskPlan(s);
    expect(p).toEqual(sourceImageTransformPlan(5, 3, { scale: .9 * .63, ratio: .7, rotation: -(.17 + .8) }, .25, .75));
    expect(p.transform[1]).toBeLessThan(0);
    expect(resolvedTransformedMaskPlan({ ...s, position: { x: 900, y: -90 } })).toEqual(p);
  });
  it('writes one batch of exact complete native rows into reusable caller storage', () => {
    const p = resolvedTransformedMaskPlan(spec()), count = transformedMaskVertexCount(p), a = new Float32Array(count * 12);
    expect(writeTransformedMaskVertices(p, a)).toBe(count);
    expect(count).toBe(p.spans.length * 6);
    p.spans.forEach((span, i) => {
      expect([...a.subarray(i * 72, i * 72 + 2)]).toEqual([span.x, span.y]);
      expect([...a.subarray(i * 72 + 10, i * 72 + 12)]).toEqual([span.x, span.length]);
    });
    const before = a.slice();
    writeTransformedMaskVertices(p, a);
    expect(a).toEqual(before);
    expect(() => writeTransformedMaskVertices(p, new Float32Array(0))).toThrow('capacity');
  });
  it('rejects an inconsistent saved allocation instead of silently fitting scale from dimensions', () => {
    const s = spec();
    expect(() => resolvedTransformedMaskPlan({ ...s, width: s.width + 1 })).toThrow();
    expect(() => resolvedTransformedMaskPlan({ ...s, width: s.width + 1, key: { ...s.key, width: s.width + 1 } })).toThrow('allocation');
  });
});

it('preserves the previous array writer byte for byte across whole native material plans', async () => {
  const { default: native } = await import('../presets/fixtures/sourceImageTransform.native.json')
  const { affineImageSpan16Coordinates } = await import('../raster/affineImageSpan16')
  for (const e of native.cases) {
    const p = sourceImageTransformPlan(e.width, e.height, e.shape, e.subX, e.subY)
    const expected: number[] = []
    const append = (x: number, y: number, length: number, height: number) => {
      const q = affineImageSpan16Coordinates(p.samplingInverse, x, y, length, 'sampling')
      const split = (v: number) => [Math.floor(v / 65536), v - Math.floor(v / 65536) * 65536]
      for (const [vx, vy] of [[x, y], [x + length, y], [x, y + height], [x, y + height], [x + length, y], [x + length, y + height]]) expected.push(vx!, vy!, ...split(q.fx), ...split(q.fy), ...split(q.dx), ...split(q.dy), x, length)
    }
    if (p.directCopy) append(0, 0, p.width, p.height)
    else for (const span of p.spans) append(span.x, span.y, span.length, 1)
    const actual = new Float32Array(expected.length); writeTransformedMaskVertices(p, actual)
    expect(new Uint8Array(actual.buffer)).toEqual(new Uint8Array(Float32Array.from(expected).buffer))
  }
})
