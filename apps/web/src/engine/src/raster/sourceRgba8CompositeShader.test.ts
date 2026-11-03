import { describe, expect, it } from 'vitest';
import fixture from '../presets/fixtures/sourceColorRgba8/scalar.native.json';
import { compositeRgba8, type Rgba8CompositeControl } from '../presets/sourceColorRgba8';
import type { Rgba8 } from '../presets/mixWeightedRgba8';
import { canonicalizeSourceRgba8Control, SOURCE_RGBA8_COMPOSITE_GLSL } from './sourceRgba8CompositeShader';
const modes = ['over', 'add', 'alphaDarken'] as const;
const pixel = (p: readonly number[]): Rgba8 => [p[0], p[1], p[2], p[3]];

describe('integer shader host input contract (not GPU execution)', () => {
  for (const [i, row] of fixture.composite.entries()) it(`canonical bytes retain native scalar result ${i}`, () => {
    const bytes = canonicalizeSourceRgba8Control({ mode: modes[row.mode], opacity: row.opacity,
      mask: row.mask < 0 ? undefined : row.mask, flow: row.flow, averageOpacity: row.average });
    expect(bytes.mode).toBe(row.mode);
    if (bytes.mode === 3 || bytes.mode === 4 || bytes.mode === 5 || bytes.mode === 6) throw new Error('Old fixture acquired a separable mode');
    expect(bytes.hasMask).toBe(row.mask >= 0);
    expect(compositeRgba8(pixel(row.src), pixel(row.dst), { mode: modes[bytes.mode], opacity: bytes.opacity / 255,
      mask: bytes.hasMask ? bytes.mask : undefined, flow: bytes.flowIsOne ? 1 : bytes.flow / 255,
      averageOpacity: bytes.average / 255 })).toEqual(row.expected);
  });
  it('preserves mask absence and original float32 flow branch', () => {
    const a = canonicalizeSourceRgba8Control({ mode: 'over', opacity: .5, flow: 1 - 1e-8 });
    const b = canonicalizeSourceRgba8Control({ mode: 'over', opacity: .5, mask: 255, flow: 1 - 1e-7 });
    expect(a).toMatchObject({ opacity: 128, mask: 255, hasMask: false, flow: 255, flowIsOne: true });
    expect(b).toMatchObject({ mask: 255, hasMask: true, flow: 255, flowIsOne: false });
  });
  it('rejects malformed author controls before GPU dispatch', () => {
    for (const opacity of [NaN, Infinity, -.1, 1.1]) expect(() => canonicalizeSourceRgba8Control({ mode: 'over', opacity })).toThrow();
    for (const mask of [-1, .5, 256]) expect(() => canonicalizeSourceRgba8Control({ mode: 'over', opacity: 1, mask })).toThrow();
    expect(() => canonicalizeSourceRgba8Control({ mode: 'bad', opacity: 1 } as unknown as Rgba8CompositeControl)).toThrow();
  });
  it('exports a composable GLSL ES3 library with historical integer and explicit extended browser functors', () => {
    expect(SOURCE_RGBA8_COMPOSITE_GLSL).toContain('uvec4 sourceCompositeRgba8(');
    expect(SOURCE_RGBA8_COMPOSITE_GLSL).not.toMatch(/\b(texture|main)\b|#version/);
    expect(SOURCE_RGBA8_COMPOSITE_GLSL).toContain('uint sourceRgba8Multiply3(');
    expect(SOURCE_RGBA8_COMPOSITE_GLSL).toContain('vec3 sourceRgba8VectorBlend(');
  });
});
