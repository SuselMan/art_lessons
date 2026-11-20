import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { standardSoftnessProfile, proceduralMaskAlpha, proceduralProfileUniforms, proceduralSampleCount } from './brushProcedural';
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
it('applies native standard softness to fade coefficients without changing geometry or opacity', () => {
    const ellipse={kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false} as const;
    const rectangle={...ellipse,shape:'rectangle'} as const;
    // Native scalar formula at x8/r10: ellipse transparency trunc132,
    // rectangle trunc153. Softness1 keeps the opaque interior.
    expect(proceduralMaskAlpha(8,0,20,20,ellipse)).toBe(255);
    expect(proceduralMaskAlpha(8,0,20,20,ellipse,0,undefined,.5)).toBe(123);
    expect(proceduralMaskAlpha(8,0,20,20,rectangle,0,undefined,.5)).toBe(102);
    expect(proceduralMaskAlpha(0,0,20,20,ellipse,0,undefined,.5)).toBe(255);
    expect(proceduralMaskAlpha(11,0,20,20,ellipse,0,undefined,.5)).toBe(0);
});
it('preserves native zero-fade coefficients at subpixel radii and softness floor', () => {
    const p={kind:'standard',shape:'ellipse',horizontalFade:0,verticalFade:0,antialias:false} as const;
    const adjusted=standardSoftnessProfile(p,.25,.125,.5);
    expect(adjusted.horizontalFade).toBe(2); // Runtime coefficient encoding, not serialized fade.
    expect(adjusted.verticalFade).toBe(4);
    expect(standardSoftnessProfile(p,.25,.125,1)).toBe(p);
    for(const softness of [0,.001,.01]) expect(standardSoftnessProfile(p,10,5,softness)).toEqual({...p,horizontalFade:.001,verticalFade:.002});
    expect(()=>standardSoftnessProfile(p,10,5,NaN)).toThrow(RangeError);
});
it('retains old standard samples exactly when softness is absent or one',()=>{
    for(const w of witnesses.cases){
        const p={kind:'standard',shape:w.profile as 'ellipse'|'rectangle',horizontalFade:w.horizontalFade,verticalFade:w.verticalFade,antialias:w.antialias} as const;
        expect(proceduralMaskAlpha(w.x,w.y,w.width,w.height,p,w.angle,undefined,1)).toBe(proceduralMaskAlpha(w.x,w.y,w.width,w.height,p,w.angle));
    }
});
