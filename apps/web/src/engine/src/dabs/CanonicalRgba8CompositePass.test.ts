import { runBrushGlBatch } from './BrushGlBatch';
import { describe, expect, it, vi } from 'vitest';
import { BrushMipCache } from './BrushMipCache';
import { BrushTextureCache } from './BrushTextureCache';
import { recordingGL } from '../../testing/brushPassTestUtils';
import { CanonicalRgba8CompositePass, canonicalRgba8CompositeBudget, type CanonicalStraightRgba8Target, type CanonicalOwnedRgba8Target, type CanonicalRgba8SourceView, type CanonicalCompositeRequest } from './CanonicalRgba8CompositePass';
import type { TransformedMaskView } from './TransformedMaskPrepass';
import { compositeSourceOver32Scalar } from '../presets/sourceOver32Scalar';
import type { SourceAlphaDarken32Control } from '../presets/sourceAlphaDarken32';
const control: SourceAlphaDarken32Control = { profile: 'optimized32-scalar-f32-rne-v1', variant: 'creamy', opacity: .8126637169189433, averageOpacity: .42521823021239097, flow: .4 };
function setup(gpu = 16 * 1024 * 1024, cpuBytes = 4 * 1024 * 1024) {
    const { gl, snapshot } = recordingGL(), cache = new BrushTextureCache(gl, gpu), cpu = new BrushMipCache(cpuBytes);
    gl.TEXTURE1 = gl.TEXTURE0 + 1;
    gl.STATIC_DRAW = 9001;
    gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 9002;
    gl.copyTexSubImage2D = vi.fn();
    gl.uniform3f = vi.fn();
    gl.uniform4f = vi.fn();
    gl.getAttribLocation = () => 0;
    gl.LINEAR = 9010;
    gl.REPEAT = 9011;
    gl.isContextLost = () => false;
    const params = new Map<object, Map<number, number>>(), originalParameter = gl.texParameteri;
    gl.getTexParameter = (_: number, name: number) => params.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(name) ?? (name === gl.TEXTURE_MIN_FILTER || name === gl.TEXTURE_MAG_FILTER ? gl.LINEAR : gl.REPEAT);
    gl.texParameteri = (_: number, name: number, value: number) => { originalParameter(_, name, value); const texture = gl.getParameter(gl.TEXTURE_BINDING_2D); let entry = params.get(texture); if (!entry) {
        entry = new Map();
        params.set(texture, entry);
    } entry.set(name, value); };
    const view: TransformedMaskView = { key: 'mask', texture: gl.createTexture(), rect: { x: 8, y: 18, width: 6, height: 7 }, bounds: { x: 0, y: 0, width: 6 / 16, height: 7 / 16 }, mirror: { horizontal: false, vertical: false }, channel: 'r' };
    cache.protect(['mask']);
    cache.put('mask', view.texture, 16 * 16 * 4);
    const target: CanonicalStraightRgba8Target = { brand: 'canonical-straight-rgba8-v1', texture: gl.createTexture(), framebuffer: gl.createFramebuffer(), width: 8, height: 8, originX: 10, originY: 20 };
    gl.getFramebufferAttachmentParameter = () => target.texture;
    const pass = new CanonicalRgba8CompositePass(gl, cache, cpu, 'local');
    const companion = [{ key: 'mask', bytes: 1024 }];
    return { gl, snapshot, cache, cpu, view, target, pass, companion, params };
}
describe('internal straight RGBA8 local alphaDarken pass', () => {
    it('copies only the intersecting native rectangle, retains mask offsets and restores GL state', () => {
        const s = setup(), before = s.snapshot();
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        expect(s.snapshot()).toEqual(before);
        const uploads = s.gl.texImage2D.mock.calls.length, buffers = s.gl.bufferData.mock.calls.length;
        expect(s.pass.draw(s.view, s.target, [198, 36, 90], control)).toBe('painted');
        // World intersection x10..14,y20..25 maps to target GL[0,3,4,5].
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledWith(s.gl.TEXTURE_2D, 0, 0, 0, 0, 3, 4, 5);
        expect(s.gl.uniform4f.mock.calls.find((r: any[]) => r[0].name === 'sourceGeometry').slice(1)).toEqual([2, 2, 6, 7]);
        expect(s.gl.uniform4f.mock.calls.find((r: any[]) => r[0].name === 'controls').slice(1)).toEqual([control.opacity, control.averageOpacity, control.flow, 0]);
        expect(s.gl.uniform3f).toHaveBeenCalledWith(expect.anything(), 198, 36, 90);
        expect(s.snapshot()).toEqual(before);
        s.pass.draw({ ...s.view, mirror: { horizontal: true, vertical: true } }, s.target, [9, 240, 1], { ...control, variant: 'hard', mask: 128 });
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(2);
        expect(s.gl.drawArrays).toHaveBeenCalledTimes(2);
        expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);
        expect(s.gl.bufferData).toHaveBeenCalledTimes(buffers);
        expect(s.gl.uniform2f.mock.calls.filter((r: any[]) => r[0].name === 'mirrorFlags').at(-1).slice(1)).toEqual([1, 1]);
        expect(s.gl.uniform2f.mock.calls.filter((r: any[]) => r[0].name === 'policy').at(-1).slice(1)).toEqual([1, 1]);
        s.pass.reset();
    });
    it('validates the complete draw before touching pixels and performs no work on an empty clip', () => {
        const s = setup();
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        const before = s.snapshot();
        expect(() => s.pass.draw(s.view, { ...s.target, brand: 'pm-layer' as any }, [0, 0, 0], control)).toThrow('straight');
        expect(() => s.pass.draw(s.view, s.target, [0, 256, 0], control)).toThrow('pigment');
        expect(() => s.pass.draw(s.view, s.target, [0, 0, 0], { ...control, flow: NaN })).toThrow('controls');
        expect(() => s.pass.draw(s.view, { ...s.target, texture: s.view.texture }, [0, 0, 0], control)).toThrow('alias');
        expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled();
        expect(s.snapshot()).toEqual(before);
        expect(s.pass.draw({ ...s.view, rect: { ...s.view.rect, x: -1000 } }, s.target, [1, 2, 3], control)).toBe('empty');
        expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled();
        expect(s.gl.drawArrays).not.toHaveBeenCalled();
        s.pass.reset();
    });
    it('checks aggregate companions/current CPU reservations before any allocation without double charging reserved companions', () => {
        const s = setup(), budget = canonicalRgba8CompositeBudget({ width: 16, height: 16 });
        const release = s.cpu.reserve(s.cpu.budgetBytes - budget.cpuBytes);
        expect(s.pass.prepare({ width: 16, height: 16 }, s.companion, s.cpu.budgetBytes - budget.cpuBytes)).toBe('ready');
        expect(s.cpu.reservedBytes).toBe(s.cpu.budgetBytes);
        s.pass.reset();
        release();
        const small = setup(1024);
        expect(() => small.pass.prepare({ width: 16, height: 16 }, small.companion)).toThrow('budgets');
        expect(small.gl.texImage2D).not.toHaveBeenCalled();
        const low = setup(undefined, 8192);
        expect(() => low.pass.prepare({ width: 16, height: 16 }, low.companion)).toThrow('budgets');
        expect(low.gl.texImage2D).not.toHaveBeenCalled();
    });
    it('restores state on copy/draw failure, rejects forged attachments and does not cache a completed draw', () => {
        const s = setup();
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        const before = s.snapshot();
        s.gl.copyTexSubImage2D.mockImplementationOnce(() => { throw new Error('authored copy failure'); });
        expect(() => s.pass.draw(s.view, s.target, [1, 2, 3], control)).toThrow('copy failure');
        expect(s.snapshot()).toEqual(before);
        expect(s.pass.draw(s.view, s.target, [1, 2, 3], control)).toBe('painted');
        s.gl.getFramebufferAttachmentParameter = () => s.view.texture;
        expect(() => s.pass.draw(s.view, s.target, [1, 2, 3], control)).toThrow('attachment');
        expect(s.snapshot()).toEqual(before);
        s.pass.reset();
    });
    it('prepares one bounded program, cancels and disposes every owned handle exactly once; context loss only forgets', () => {
        for (const lost of [false, true]) {
            const s = setup(), abort = new AbortController();
            abort.abort();
            expect(s.pass.prepare({ width: 16, height: 16 }, s.companion, 0, abort.signal)).toBe('cancelled');
            expect(s.gl.texImage2D).not.toHaveBeenCalled();
            s.pass.prepare({ width: 16, height: 16 }, s.companion);
            s.pass.prepare({ width: 16, height: 16 }, s.companion);
            expect(s.gl.createProgram).toHaveBeenCalledTimes(1);
            s.pass.reset(lost);
            s.pass.reset(lost);
            expect(s.gl.deleteProgram).toHaveBeenCalledTimes(lost ? 0 : 1);
            expect(s.gl.deleteBuffer).toHaveBeenCalledTimes(lost ? 0 : 1);
            expect(s.gl.deleteTexture).toHaveBeenCalledTimes(lost ? 0 : 1);
            expect(s.cache.get('mask')).toBe(s.view.texture);
            expect(s.cpu.reservedBytes).toBe(0);
        }
    });
    it('uses small relative coordinates for very distant world origins and rejects scope/capacity aliasing before copies', () => {
        const s = setup();
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        const target = { ...s.target, originX: 1000000000000, originY: -1000000000000 };
        const view = { ...s.view, rect: { ...s.view.rect, x: target.originX - 2, y: target.originY - 2 } };
        s.pass.draw(view, target, [1, 2, 3], control);
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledWith(s.gl.TEXTURE_2D, 0, 0, 0, 0, 3, 4, 5);
        expect(s.gl.uniform4f.mock.calls.every((row: any[]) => row.slice(1).every(v => Math.abs(v) < 100))).toBe(true);
        const colliding = new CanonicalRgba8CompositePass(s.gl, s.cache, s.cpu, 'local');
        const allocations = s.gl.createTexture.mock.calls.length;
        expect(() => colliding.prepare({ width: 16, height: 16 }, s.companion)).toThrow('already owned');
        expect(s.gl.createTexture).toHaveBeenCalledTimes(allocations);
        expect(s.pass.isReady()).toBe(true);
        s.pass.reset();
        s.pass.prepare({ width: 2, height: 2 }, s.companion);
        const copies = s.gl.copyTexSubImage2D.mock.calls.length;
        expect(() => s.pass.draw(s.view, s.target, [1, 2, 3], control)).toThrow('capacity');
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies);
        s.pass.reset();
    });
    it('restores optional caller VAO and releases the owned one once', () => {
        const s = setup(), external = {}, owned = {};
        let bound: object | null = external;
        const extension = { VERTEX_ARRAY_BINDING_OES: 9003, createVertexArrayOES: vi.fn(() => owned), bindVertexArrayOES: vi.fn((value: object | null) => { bound = value; }), deleteVertexArrayOES: vi.fn() };
        const oldExtension = s.gl.getExtension, oldParameter = s.gl.getParameter;
        s.gl.getExtension = (name: string) => name === 'OES_vertex_array_object' ? extension : oldExtension(name);
        s.gl.getParameter = (name: number) => name === 9003 ? bound : oldParameter(name);
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        expect(bound).toBe(external);
        s.pass.draw(s.view, s.target, [1, 2, 3], control);
        expect(bound).toBe(external);
        expect(extension.bindVertexArrayOES).toHaveBeenCalledWith(owned);
        s.pass.reset();
        s.pass.reset();
        expect(extension.deleteVertexArrayOES).toHaveBeenCalledTimes(1);
    });
    it('prepares two finite families once and chooses both explicit Over profiles without hot allocation', () => {
        const s = setup(), release = vi.fn(), lease = vi.fn(() => release);
        const target: CanonicalOwnedRgba8Target = { ...s.target, lifetime: { kind: 'external', owner: s.target, lease } };
        s.pass.prepare({ width: 16, height: 16, operations: ['alphaDarken32', 'over32'] }, s.companion);
        expect(s.gl.createProgram).toHaveBeenCalledTimes(2);
        const images = s.gl.texImage2D.mock.calls.length, buffers = s.gl.bufferData.mock.calls.length;
        for (const profile of ['portable-f32-division-rne-v1', 'optimized32-neon64-scalar-frecpe-rne-v1'] as const)
            s.pass.drawSource({ source: { kind: 'maskRgb', view: s.view, rgb: [4, 89, 230] }, target, operation: { kind: 'over32', control: { profile, opacity: .3, mask: 128 } } });
        expect(s.gl.uniform2f.mock.calls.filter((row: any[]) => row[0].name === 'policy').map((row: any[]) => row.slice(1))).toEqual([[0, 1], [1, 1]]);
        expect(s.gl.texImage2D).toHaveBeenCalledTimes(images);
        expect(s.gl.bufferData).toHaveBeenCalledTimes(buffers);
        expect(lease).toHaveBeenCalledTimes(2);
        expect(release).toHaveBeenCalledTimes(2);
        expect(s.cpu.reservedBytes).toBe(canonicalRgba8CompositeBudget({ width: 16, height: 16, operations: ['alphaDarken32', 'over32'] }).cpuBytes);
        s.pass.reset();
        expect(s.gl.deleteProgram).toHaveBeenCalledTimes(2);
    });
    it('reads every falling-opacity preview from the same immutable base and preserves actual RGBA source alpha', () => {
        const s = setup(), release = vi.fn(), lease = vi.fn(() => release), lifetime = { kind: 'external' as const, owner: {}, lease };
        const target: CanonicalOwnedRgba8Target = { ...s.target, lifetime };
        const base: CanonicalOwnedRgba8Target = { ...target, texture: s.gl.createTexture(), framebuffer: s.gl.createFramebuffer(), lifetime: { ...lifetime, owner: {} } };
        const view: CanonicalRgba8SourceView = { brand: 'canonical-straight-rgba8-view-v1', texture: s.gl.createTexture(), textureWidth: 8, textureHeight: 8, rect: { x: 10, y: 20, width: 8, height: 8 }, bounds: { x: 0, y: 0, width: 1, height: 1 }, mirror: { horizontal: false, vertical: false }, rowOrder: 'bottomAtV0', residency: { ...lifetime, owner: {} } };
        const attachment = new Map([[target.framebuffer, target.texture], [base.framebuffer, base.texture]]);
        s.gl.getFramebufferAttachmentParameter = () => attachment.get(s.gl.getParameter(s.gl.FRAMEBUFFER_BINDING));
        const copiedFrom: any[] = [], drawnInto: any[] = [];
        s.gl.copyTexSubImage2D.mockImplementation(() => copiedFrom.push(s.gl.getParameter(s.gl.FRAMEBUFFER_BINDING)));
        s.gl.drawArrays.mockImplementation(() => drawnInto.push(s.gl.getParameter(s.gl.FRAMEBUFFER_BINDING)));
        s.pass.prepare({ width: 16, height: 16, operations: ['over32'] }, s.companion);
        for (const opacity of [.8, .2])
            s.pass.drawSource({ source: { kind: 'straightRgba8', view }, target, readDestination: base, operation: { kind: 'over32', control: { profile: 'portable-f32-division-rne-v1', opacity } } });
        expect(copiedFrom).toEqual([base.framebuffer, base.framebuffer]);
        expect(drawnInto).toEqual([target.framebuffer, target.framebuffer]);
        expect(s.gl.uniform2f.mock.calls.filter((row: any[]) => row[0].name === 'sourcePolicy').map((row: any[]) => row.slice(1))).toEqual([[1, 1], [1, 1]]);
        expect(s.gl.uniform3f.mock.calls.every((row: any[]) => row.slice(1).every(v => v === 0))).toBe(true);
        expect(lease).toHaveBeenCalledTimes(6);
        expect(release).toHaveBeenCalledTimes(6);
        // An independent established evaluator proves the witness distinguishes
        // immutable-base recompute from accidentally accumulating another Over.
        const color = [200, 10, 90, 180] as const, background = [40, 80, 120, 128] as const;
        const one = compositeSourceOver32Scalar(color, background, { profile: 'portable-f32-division-rne-v1', opacity: .8 });
        expect(compositeSourceOver32Scalar(color, background, { profile: 'portable-f32-division-rne-v1', opacity: .2 }))
            .not.toEqual(compositeSourceOver32Scalar(color, one, { profile: 'portable-f32-division-rne-v1', opacity: .2 }));
        s.pass.reset();
    });
    it('validates lifetime, operation, unscaled RGBA view and immutable-base geometry before owner acquisition or pixel copies', () => {
        const s = setup(), lease = vi.fn(() => () => { }), lifetime = { kind: 'external' as const, owner: {}, lease };
        const target: CanonicalOwnedRgba8Target = { ...s.target, lifetime };
        const source: CanonicalRgba8SourceView = { brand: 'canonical-straight-rgba8-view-v1', texture: s.gl.createTexture(), textureWidth: 16, textureHeight: 16, rect: { x: 10, y: 20, width: 8, height: 8 }, bounds: { x: 0, y: 0, width: .5, height: .5 }, mirror: { horizontal: false, vertical: false }, rowOrder: 'topAtV0', residency: lifetime };
        s.pass.prepare({ width: 16, height: 16, operations: ['over32'] }, s.companion);
        const request: CanonicalCompositeRequest = { source: { kind: 'straightRgba8', view: source }, target, operation: { kind: 'over32', control: { profile: 'portable-f32-division-rne-v1', opacity: .4 } } };
        expect(() => s.pass.drawSource({ ...request, operation: { kind: 'over32', control: undefined as any } })).toThrow('controls');
        expect(() => s.pass.drawSource({ ...request, readDestination: { ...target, originX: 11 } })).toThrow('geometry');
        expect(() => s.pass.drawSource({ ...request, target: { ...target, lifetime: undefined as any } })).toThrow('lifetime');
        expect(() => s.pass.drawSource({ ...request, source: { kind: 'straightRgba8', view: { ...source, bounds: { ...source.bounds, width: .4 } } } })).toThrow('unscaled');
        expect(() => s.pass.drawSource({ ...request, source: { kind: 'straightRgba8', view: { ...source, texture: target.texture } } })).toThrow('alias');
        expect(lease).not.toHaveBeenCalled();
        expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled();
        s.pass.reset();
    });
    it('allows source==base with a separate output, checks cached sources and changes storage orientation once', () => {
        const s = setup(), lifetime = { kind: 'external' as const, owner: {}, lease: () => () => { } };
        const target: CanonicalOwnedRgba8Target = { ...s.target, lifetime };
        const base: CanonicalOwnedRgba8Target = { ...target, texture: s.gl.createTexture(), framebuffer: s.gl.createFramebuffer() };
        const view: CanonicalRgba8SourceView = { brand: 'canonical-straight-rgba8-view-v1', texture: base.texture, textureWidth: 8, textureHeight: 8, rect: { x: 10, y: 20, width: 8, height: 8 }, bounds: { x: 0, y: 0, width: 1, height: 1 }, mirror: { horizontal: true, vertical: true }, rowOrder: 'topAtV0', residency: { kind: 'cache', key: 'rgba', bytes: 256 } };
        s.cache.protect(['mask', 'rgba']);
        s.cache.put('rgba', base.texture, 256);
        const companions = [...s.companion, { key: 'rgba', bytes: 256 }];
        s.pass.prepare({ width: 16, height: 16, operations: ['over32'] }, companions);
        s.gl.getFramebufferAttachmentParameter = () => s.gl.getParameter(s.gl.FRAMEBUFFER_BINDING) === base.framebuffer ? base.texture : target.texture;
        const request: CanonicalCompositeRequest = { source: { kind: 'straightRgba8', view }, target, readDestination: base, operation: { kind: 'over32', control: { profile: 'portable-f32-division-rne-v1', opacity: 1 } } };
        expect(s.pass.drawSource(request)).toBe('painted');
        expect(s.gl.uniform2f.mock.calls.find((row: any[]) => row[0].name === 'sourcePolicy').slice(1)).toEqual([1, 0]);
        expect(s.gl.uniform2f.mock.calls.find((row: any[]) => row[0].name === 'mirrorFlags').slice(1)).toEqual([1, 1]);
        const copies = s.gl.copyTexSubImage2D.mock.calls.length;
        expect(() => s.pass.drawSource({ ...request, source: { kind: 'straightRgba8', view: { ...view, residency: { kind: 'cache', key: 'rgba', bytes: 128 } } } })).toThrow();
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies);
        s.pass.reset();
    });
    it('scopes exact point sampling and restores all four source parameters on success and draw failure', () => {
        const s = setup();
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        const names = [s.gl.TEXTURE_MIN_FILTER, s.gl.TEXTURE_MAG_FILTER, s.gl.TEXTURE_WRAP_S, s.gl.TEXTURE_WRAP_T];
        const original = [s.gl.LINEAR, s.gl.LINEAR, s.gl.REPEAT, s.gl.REPEAT];
        s.gl.bindTexture(s.gl.TEXTURE_2D, s.view.texture);
        names.forEach((name, i) => s.gl.texParameteri(s.gl.TEXTURE_2D, name, original[i]));
        const draw = s.gl.drawArrays.getMockImplementation();
        s.gl.drawArrays.mockImplementation((...args: any[]) => {
            expect(names.map(name => s.gl.getTexParameter(s.gl.TEXTURE_2D, name))).toEqual([s.gl.NEAREST, s.gl.NEAREST, s.gl.CLAMP_TO_EDGE, s.gl.CLAMP_TO_EDGE]);
            draw?.(...args);
        });
        s.pass.draw(s.view, s.target, [1, 2, 3], control);
        expect(names.map(name => s.params.get(s.view.texture)?.get(name))).toEqual(original);
        s.gl.drawArrays.mockImplementationOnce(() => { throw new Error('authored draw failure'); });
        expect(() => s.pass.draw(s.view, s.target, [1, 2, 3], control)).toThrow('draw failure');
        expect(names.map(name => s.params.get(s.view.texture)?.get(name))).toEqual(original);
        s.pass.reset();
    });
});

describe('composite inside explicit GL batch', () => {
    it('holds declared owners and validates FBO/samplers once across ordered draws', () => {
        const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
        try {
            const s = setup(); s.pass.prepare({width:16,height:16}, s.companion);
            const release = vi.fn(), acquire = vi.fn(() => release);
            const lifetime = {kind:'external' as const,owner:{},lease:acquire};
            const target = {...s.target,lifetime};
            const sampler = vi.spyOn(s.gl, 'getTexParameter'), fbo = vi.spyOn(s.gl, 'checkFramebufferStatus');
            const before=s.snapshot();
            runBrushGlBatch({participants:[s.pass],owners:[lifetime]}, frame => {
                for(let i=0;i<3;i++)s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[198,36,90]},target,operation:{kind:'alphaDarken32',control}},frame);
                expect(() => s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[1,2,3]},target,operation:{kind:'alphaDarken32',control}})).toThrow('identity');
                expect(() => s.pass.reset()).toThrow('batch');
            });
            expect(sampler).toHaveBeenCalledTimes(4);expect(fbo).toHaveBeenCalledTimes(1);
            expect(acquire).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();
            expect(s.gl.drawArrays).toHaveBeenCalledTimes(3);expect(s.snapshot()).toEqual(before);
            s.pass.reset();
        }finally{clock.mockRestore();}
    });
    it('restores original sampler/caller state on command failure and rejects undeclared owners before copy',()=>{
        const s=setup();s.pass.prepare({width:16,height:16},s.companion);
        const lifetime={kind:'external' as const,owner:{},lease:()=>()=>{}};
        const target={...s.target,lifetime}, request={source:{kind:'maskRgb' as const,view:s.view,rgb:[1,2,3] as const},target,operation:{kind:'alphaDarken32' as const,control}};
        expect(()=>runBrushGlBatch({participants:[s.pass]},frame=>s.pass.drawSource(request,frame))).toThrow('owner');
        expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled();
        const before=s.snapshot();s.gl.drawArrays.mockImplementationOnce(()=>{throw Error('GPU failure')});
        expect(()=>runBrushGlBatch({participants:[s.pass],owners:[lifetime]},frame=>s.pass.drawSource(request,frame))).toThrow('GPU failure');
        expect(s.snapshot()).toEqual(before);
        const values=s.params.get(s.view.texture)!;
        expect(values.get(s.gl.TEXTURE_MIN_FILTER)).toBe(s.gl.LINEAR);expect(values.get(s.gl.TEXTURE_WRAP_S)).toBe(s.gl.REPEAT);
        s.pass.reset();
    });
});
