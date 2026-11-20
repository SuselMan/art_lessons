import { expect, it } from 'vitest';
import { isBrushLibrary, type BrushLibrary } from './brushes.js';
function fixture(): BrushLibrary {
    return { schemaVersion: 1, assets: [], skipped: [], brushes: [{ name: 'Authored standard', source: 'qa', warnings: [], descriptor: { id: 'imported-1234567890abcdef', version: 26, model: 'stamp', category: 'paint', tip: { kind: 'procedural', hardness: 1, aspect: 5, angle: 0, rotation: 'fixed', profile: { kind: 'standard', shape: 'ellipse', horizontalFade: 1, verticalFade: .3, antialias: true } }, behavior: { version: 2 }, paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'stamp', opacity: 1, pressureSmoothingPx: 0, sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]] } }] };
}
it('admits anisotropic standard masks on stamp and mixer with explicit geometry', () => {
    const l = fixture();
    expect(isBrushLibrary(l)).toBe(true);
    const d = l.brushes[0].descriptor;
    d.model = 'mixer';
    d.mixer = { load: 0, pickup: 1, strength: 1 };
    expect(isBrushLibrary(l)).toBe(true);
    Object.assign(d.tip.profile!, { shape: 'rectangle', horizontalFade: 0, verticalFade: 1, antialias: false });
    expect(isBrushLibrary(l)).toBe(true);
});
it('rejects incomplete or ambiguous procedural profiles atomically', () => {
    const mutations = [(d: any) => delete d.tip.profile, (d: any) => delete d.tip.profile.horizontalFade, (d: any) => d.tip.profile.shape = 'triangle', (d: any) => d.tip.profile.verticalFade = NaN, (d: any) => d.tip.profile.horizontalFade = -.1, (d: any) => d.tip.profile.verticalFade = 1.1, (d: any) => d.tip.profile.antialias = 1, (d: any) => d.tip.profile.vendor = true, (d: any) => d.tip.kind = 'round', (d: any) => d.tip.kind = 'bitmap', (d: any) => d.tip.mask = 'asset:' + 'a'.repeat(64), (d: any) => d.tip.maskBounds = { x: 0, y: 0, width: 1, height: 1 }];
    for (const mutate of mutations) {
        const l = fixture();
        mutate(l.brushes[0].descriptor);
        expect(isBrushLibrary(l)).toBe(false);
    }
});
it('validates independent standard children recursively without admitting Gaussian wet', () => {
    const l = fixture(), d = l.brushes[0].descriptor, child = structuredClone(d);
    d.behavior = { version: 2, dual: { brush: child, blendMode: 'colorBurn', sampling: 'independent' } };
    expect(isBrushLibrary(l)).toBe(true);
    Object.assign(child.tip.profile!, { horizontalFade: Infinity });
    expect(isBrushLibrary(l)).toBe(false);
});
