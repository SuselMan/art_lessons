import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { proceduralMaskAlpha, proceduralProfileUniforms, proceduralSampleCount } from './brushProcedural';
import { BRUSH_GAUSSIAN_GLSL, gaussianMaskAlpha } from './gaussianTip';
import witnesses from './brushProcedural.witnesses.json';
it('matches independently authored pinned scalar samples including rotated unequal axes', () => {
    for (const w of witnesses.cases) {
        if (w.expectedU8 === null)
            continue; // Native0/0 conversion is explicitly undefined.
        expect(proceduralSampleCount(Math.min(w.width, w.height), w.antialias)).toBe(w.sampleCount);
        expect(proceduralMaskAlpha(w.x, w.y, w.width, w.height, { kind: 'standard', shape: w.profile as 'ellipse' | 'rectangle', horizontalFade: w.horizontalFade, verticalFade: w.verticalFade, antialias: w.antialias }, w.angle), JSON.stringify(w)).toBe(w.expectedU8);
    }
});
it('retains Gaussian scalar bytes through the common coordinate/stencil evaluator', () => {
    for (const diameter of [.75, 1, 4, 9.99, 10, 48])
        for (const fade of [1e-6, .5, .999999])
            for (const antialias of [true, false])
                for (const x of [0, diameter * .35, diameter * .49]) {
                    expect(proceduralMaskAlpha(x, 0, diameter, diameter, { kind: 'gaussian', fade, antialias })).toBe(gaussianMaskAlpha(x, 0, diameter, fade, antialias));
                }
});
it('keeps the assembled legacy Gaussian helper source unchanged', () => {
    expect(createHash('sha256').update(BRUSH_GAUSSIAN_GLSL).digest('hex')).toBe('f64910a2a6740c83e2027bd8296d4460d6c1e628dcc4e16760ab7086d2e0aa65');
});
it('bounds malformed geometry and makes the native undefined hard-circle boundary explicit', () => {
    const profile = { kind: 'standard', shape: 'ellipse', horizontalFade: 1, verticalFade: 1, antialias: false } as const;
    expect(proceduralMaskAlpha(24, 0, 48, 48, profile)).toBe(0);
    expect(proceduralMaskAlpha(0, 0, 0, 48, profile)).toBe(0);
    expect(proceduralMaskAlpha(NaN, 0, 48, 48, profile)).toBe(0);
    expect(proceduralProfileUniforms()).toEqual([-1, 0, 0, 0]);
    expect(proceduralProfileUniforms({ ...profile, shape: 'rectangle' })).toEqual([2, 1, 1, 0]);
});
