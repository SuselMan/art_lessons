import {beforeAll,afterAll} from 'vitest'
import {installScalarPowerAssetFetch,retainScalarPowerTestPages,installScalarAtlasMockCaps} from '../../testing/scalarPowerTestAssets'
let restoreScalarFetch:()=>void
beforeAll(()=>{restoreScalarFetch=installScalarPowerAssetFetch()})
afterAll(()=>restoreScalarFetch())
import { ownedBrushFixture } from '../../testing/ownedBrushFixture';
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
    gl.MAX_TEXTURE_SIZE=9013;gl.MAX_TEXTURE_IMAGE_UNITS=9014;gl.UNPACK_COLORSPACE_CONVERSION_WEBGL=9015;
    const originalGetParameter=gl.getParameter;
    gl.getParameter=(name:number)=>name===gl.MAX_TEXTURE_SIZE?4096:name===gl.MAX_TEXTURE_IMAGE_UNITS?8:originalGetParameter(name);
    const params = new Map<object, Map<number, number>>(), originalParameter = gl.texParameteri;
    gl.getTexParameter = (_: number, name: number) => params.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(name) ?? (name === gl.TEXTURE_MIN_FILTER || name === gl.TEXTURE_MAG_FILTER ? gl.LINEAR : gl.REPEAT);
    gl.texParameteri = (_: number, name: number, value: number) => { originalParameter(_, name, value); const texture = gl.getParameter(gl.TEXTURE_BINDING_2D); let entry = params.get(texture); if (!entry) {
        entry = new Map();
        params.set(texture, entry);
    } entry.set(name, value); };
    installScalarAtlasMockCaps(gl);
    const mask=ownedBrushFixture(gl,1024);
    const view: TransformedMaskView = { key: 'mask', texture: mask.texture, rect: { x: 8, y: 18, width: 6, height: 7 }, bounds: { x: 0, y: 0, width: 6 / 16, height: 7 / 16 }, mirror: { horizontal: false, vertical: false }, channel: 'r' };
    cache.protect(['mask']);
    cache.putOwned('mask',mask);
    const target: CanonicalStraightRgba8Target = { brand: 'canonical-straight-rgba8-v1', texture: gl.createTexture(), framebuffer: gl.createFramebuffer(), width: 8, height: 8, originX: 10, originY: 20 };
    gl.getFramebufferAttachmentParameter = () => target.texture;
    const pass = new CanonicalRgba8CompositePass(gl, cache, cpu, 'local');
    const companion = [{ key: 'mask', bytes: 1024 }];
    gl.texImage2D.mockClear();gl.bufferData.mockClear();
    return { gl, snapshot, cache, cpu, view, target, pass, companion, params };
}
describe('internal straight RGBA8 local alphaDarken pass', () => {
    it('clips page writes without changing source offsets, target geometry or mirror policy', () => {
        const s = setup(), before = s.snapshot();
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        const target: CanonicalOwnedRgba8Target = { ...s.target, lifetime: { kind: 'external', owner: {}, lease: () => () => {} } };
        const view = { ...s.view, mirror: { horizontal: true, vertical: true } };
        const viewport = vi.spyOn(s.gl, 'viewport'), uniform2f = vi.spyOn(s.gl, 'uniform2f');
        const request: CanonicalCompositeRequest = { source: { kind: 'maskRgb', view, rgb: [198, 36, 90] }, target,
            operation: { kind: 'alphaDarken32', control }, writeBounds: { minX: 11, minY: 21, maxX: 13, maxY: 24 } };
        expect(s.pass.drawSource(request)).toBe('painted');
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledWith(s.gl.TEXTURE_2D, 0, 0, 0, 1, 4, 2, 3);
        expect(viewport).toHaveBeenCalledWith(1, 4, 2, 3);
        expect(s.gl.uniform4f.mock.calls.find((r: any[]) => r[0].name === 'sourceGeometry').slice(1)).toEqual([3, 3, 6, 7]);
        expect(uniform2f).toHaveBeenCalledWith(expect.objectContaining({ name: 'mirrorFlags' }), 1, 1);
        expect(target.width).toBe(8); expect(view.rect).toEqual(s.view.rect);
        expect(s.snapshot()).toEqual(before);
        const copies = s.gl.copyTexSubImage2D.mock.calls.length, draws = s.gl.drawArrays.mock.calls.length;
        for (const writeBounds of [{ minX: 0, minY: 0, maxX: 10, maxY: 20 }, { minX: 12, minY: 22, maxX: 12, maxY: 23 }])
            expect(s.pass.drawSource({ ...request, writeBounds })).toBe('empty');
        expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies);
        expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws);
        expect(s.snapshot()).toEqual(before);
    });
    it('rejects malformed page write bounds before GL or target leases', () => {
        const s = setup(), lease = vi.fn(() => () => {});
        s.pass.prepare({ width: 16, height: 16 }, s.companion);
        const target: CanonicalOwnedRgba8Target = { ...s.target, lifetime: { kind: 'external', owner: {}, lease } };
        s.gl.copyTexSubImage2D.mockClear(); const getters = vi.spyOn(s.gl, 'getParameter');
        for (const writeBounds of [{ minX: 0, minY: 0, maxX: NaN, maxY: 1 }, { minX: 0, minY: .5, maxX: 1, maxY: 1 }, { minX: 2, minY: 0, maxX: 1, maxY: 1 }])
            expect(() => s.pass.drawSource({ source: { kind: 'maskRgb', view: s.view, rgb: [1, 2, 3] }, target,
                operation: { kind: 'alphaDarken32', control }, writeBounds })).toThrow('write bounds');
        expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled(); expect(getters).not.toHaveBeenCalled(); expect(lease).not.toHaveBeenCalled();
    });

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
        const rgba=ownedBrushFixture(s.gl,256);
        const base: CanonicalOwnedRgba8Target = { ...target, texture: rgba.texture, framebuffer: s.gl.createFramebuffer() };
        const view: CanonicalRgba8SourceView = { brand: 'canonical-straight-rgba8-view-v1', texture: base.texture, textureWidth: 8, textureHeight: 8, rect: { x: 10, y: 20, width: 8, height: 8 }, bounds: { x: 0, y: 0, width: 1, height: 1 }, mirror: { horizontal: true, vertical: true }, rowOrder: 'topAtV0', residency: { kind: 'cache', key: 'rgba', bytes: 256 } };
        s.cache.protect(['mask', 'rgba']);
        s.cache.putOwned('rgba',rgba);
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

it('counts empty standalone batched submissions so outside-only batches remain bounded',()=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0);
  try {
    const s=setup();s.pass.prepare({width:16,height:16},s.companion);
    const lifetime={kind:'external' as const,owner:{},lease:()=>()=>{}};
    const request={source:{kind:'maskRgb' as const,view:{...s.view,rect:{...s.view.rect,x:-10000}},rgb:[1,2,3] as const},target:{...s.target,lifetime},operation:{kind:'alphaDarken32' as const,control}};
    runBrushGlBatch({participants:[s.pass],owners:[lifetime]},frame=>{
      for(let i=0;i<8;i++)expect(s.pass.drawSource(request,frame)).toBe('empty');
      expect(frame.shouldYield).toBe(true);expect(()=>s.pass.drawSource(request,frame)).toThrow('budget');
    });
    expect(s.gl.drawArrays).not.toHaveBeenCalled();s.pass.reset();
  }finally{clock.mockRestore()}
});

it('prepares explicit fused scalar kernels within the same two-program budget and uploads hard folding once', () => {
    const s = setup(), operations = ['alphaDarken32FusedScalar', 'over32FusedScalar'] as const;
    expect(canonicalRgba8CompositeBudget({ width: 16, height: 16, operations })).toEqual(canonicalRgba8CompositeBudget({ width: 16, height: 16, operations: ['alphaDarken32', 'over32'] }));
    s.pass.prepare({ width: 16, height: 16, operations }, s.companion);
    const before = s.snapshot(), target: CanonicalOwnedRgba8Target = { ...s.target, lifetime: { kind: 'external', owner: {}, lease: () => () => {} } };
    s.pass.drawSource({ source: { kind: 'maskRgb', view: s.view, rgb: [17, 29, 41] }, target, operation: {
        kind: 'alphaDarken32FusedScalar', control: { profile: 'installed-arm64-scalar-fused-fpcr0-v1', variant: 'hard', opacity: .1, averageOpacity: .3, flow: .4 },
    } });
    expect(s.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({ name: 'controls' }), Math.fround(Math.fround(.4) * Math.fround(.1)), Math.fround(Math.fround(.4) * Math.fround(.3)), Math.fround(.4), 0);
    s.pass.drawSource({ source: { kind: 'maskRgb', view: s.view, rgb: [17, 29, 41] }, target, operation: {
        kind: 'over32FusedScalar', control: { profile: 'installed-arm64-scalar-fused-fpcr0-v1', opacity: 2 ** -149 },
    } });
    expect(s.gl.uniform3f).toHaveBeenCalledWith(expect.objectContaining({ name: 'opacityParts' }), 0, 1, -149);
    expect(s.snapshot()).toEqual(before);
    expect(() => s.pass.drawSource({ source: { kind: 'maskRgb', view: s.view, rgb: [17, 29, 41] }, target, operation: { kind: 'alphaDarken32', control } })).toThrow('not prepared');
    s.pass.reset(); expect(s.cpu.reservedBytes).toBe(0);
});

it('validates an aliased destination once per standalone call and rechecks foreign changes',()=>{
 const s=setup();s.pass.prepare({width:16,height:16},s.companion);
 const before=s.snapshot(),status=vi.spyOn(s.gl,'checkFramebufferStatus'),attachment=vi.spyOn(s.gl,'getFramebufferAttachmentParameter');
 expect(s.pass.draw(s.view,s.target,[1,2,3],control)).toBe('painted');
 expect(status).toHaveBeenCalledTimes(1);expect(attachment).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before);
 attachment.mockReturnValueOnce(s.view.texture);
 expect(()=>s.pass.draw(s.view,s.target,[1,2,3],control)).toThrow('attachment');
 expect(status).toHaveBeenCalledTimes(2);expect(attachment).toHaveBeenCalledTimes(2);expect(s.snapshot()).toEqual(before);
 status.mockReturnValueOnce(0);
 expect(()=>s.pass.draw(s.view,s.target,[1,2,3],control)).toThrow('attachment');
 expect(status).toHaveBeenCalledTimes(3);expect(s.snapshot()).toEqual(before);s.pass.reset();
});
it('checks both distinct destination attachments and rejects a changed read destination',()=>{
 const s=setup();s.pass.prepare({width:16,height:16},s.companion);
 const lifetime={kind:'external' as const,owner:{},lease:()=>()=>{}},target={...s.target,lifetime};
 const base={...target,texture:s.gl.createTexture(),framebuffer:s.gl.createFramebuffer()};
 const attached=new Map([[target.framebuffer,target.texture],[base.framebuffer,base.texture]]);
 s.gl.getFramebufferAttachmentParameter=()=>attached.get(s.gl.getParameter(s.gl.FRAMEBUFFER_BINDING));
 const before=s.snapshot(),status=vi.spyOn(s.gl,'checkFramebufferStatus'),attachment=vi.spyOn(s.gl,'getFramebufferAttachmentParameter');
 const request:CanonicalCompositeRequest={source:{kind:'maskRgb',view:s.view,rgb:[1,2,3]},target,readDestination:base,operation:{kind:'alphaDarken32',control}};
 expect(s.pass.drawSource(request)).toBe('painted');expect(status).toHaveBeenCalledTimes(2);expect(attachment).toHaveBeenCalledTimes(2);expect(s.snapshot()).toEqual(before);
 attached.set(base.framebuffer,s.view.texture);
 expect(()=>s.pass.drawSource(request)).toThrow('attachment');expect(status).toHaveBeenCalledTimes(4);expect(attachment).toHaveBeenCalledTimes(4);expect(s.snapshot()).toEqual(before);s.pass.reset();
});
it('keeps one attachment query for repeated batched alias draws and rechecks the next batch',()=>{
 const s=setup();s.pass.prepare({width:16,height:16},s.companion);
 const lifetime={kind:'external' as const,owner:{},lease:()=>()=>{}},target={...s.target,lifetime};
 const before=s.snapshot(),status=vi.spyOn(s.gl,'checkFramebufferStatus'),attachment=vi.spyOn(s.gl,'getFramebufferAttachmentParameter');
 const request:CanonicalCompositeRequest={source:{kind:'maskRgb',view:s.view,rgb:[1,2,3]},target,operation:{kind:'alphaDarken32',control}};
 runBrushGlBatch({participants:[s.pass],owners:[lifetime]},frame=>{s.pass.drawSource(request,frame);s.pass.drawSource(request,frame)});
 expect(status).toHaveBeenCalledTimes(1);expect(attachment).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before);
 attachment.mockReturnValueOnce(s.view.texture);
 expect(()=>runBrushGlBatch({participants:[s.pass],owners:[lifetime]},frame=>s.pass.drawSource(request,frame))).toThrow('attachment');
 expect(status).toHaveBeenCalledTimes(2);expect(attachment).toHaveBeenCalledTimes(2);expect(s.snapshot()).toEqual(before);s.pass.reset();
});

import { SOURCE_RGBA8_GENERIC_SC_PROFILE } from '../presets/sourceColorRgba8';
it('runs explicit GenericSC U8 modes through the SAME composite service and shared byte controls',()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['genericSCU8']},s.companion);
 const before=s.snapshot(),target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}};
 const policy=vi.spyOn(s.gl,'uniform4f');s.gl.uniform4f.mockClear();
 for(const [i,mode] of (['multiply','lighten','colorDodge','overlay'] as const).entries()) {
  expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[91,127,255]},target,
   operation:{kind:'genericSCU8',control:{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:248/255}}})).toBe('painted');
  expect(policy).toHaveBeenCalledWith(expect.objectContaining({name:'policy'}),i+3,0,1,0);
 }
 expect(s.gl.uniform4f.mock.calls.filter((r:unknown[])=>r[0]&&typeof r[0]==='object'&&'name' in r[0]&&r[0].name==='controls').map((r:unknown[])=>r.slice(1))).toEqual(Array(4).fill([248,248,255,255]));
 expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[91,127,255]},target,
  operation:{kind:'genericSCU8',control:{mode:'multiply',profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:248/255,mask:0}}})).toBe('painted');
 expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({name:'policy'}),3,1,1,0);
 expect(s.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({name:'controls'}),248,248,255,0);
 expect(s.snapshot()).toEqual(before);s.pass.reset();
});
it('refuses a missing or mismatched GenericSC profile before destination work',()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['genericSCU8']},s.companion);
 const lease=vi.fn(()=>()=>{}),target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease}};
 const get=vi.spyOn(s.gl,'getParameter');get.mockClear();
 for(const control of [{mode:'multiply',opacity:1},{mode:'multiply',opacity:1,profile:'installed-arm64-scalar-fused-fpcr0-v1'},
  {mode:'over',opacity:1,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE}]) {
  expect(()=>s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[1,2,3]},target,operation:{kind:'genericSCU8',control:control as never}})).toThrow();
 }
 expect(get).not.toHaveBeenCalled();expect(lease).not.toHaveBeenCalled();s.pass.reset();
});

it('prepares the three-operation V2 pipeline with exact per-program charges and rejects a fourth before allocations',()=>{
 const s=setup(),operations=['alphaDarken32FusedScalar','over32FusedScalar','genericSCU8'] as const
 const pair=canonicalRgba8CompositeBudget({width:16,height:16,operations:operations.slice(0,2)}),triple=canonicalRgba8CompositeBudget({width:16,height:16,operations})
 expect(triple.gpuBytes).toBe(pair.gpuBytes);expect(triple.cpuBytes-pair.cpuBytes).toBe(4*8192)
 const baseline=s.cpu.reservedBytes,programs=s.gl.createProgram.mock.calls.length,before=s.snapshot()
 try{
  expect(()=>s.pass.prepare({width:16,height:16,operations:[...operations,'over32']},s.companion)).toThrow(/operations/)
  expect(s.gl.createProgram.mock.calls.length).toBe(programs);expect(s.cpu.reservedBytes).toBe(baseline)
  s.pass.prepare({width:16,height:16,operations},s.companion)
  expect(s.pass.supportsOperations(operations)).toBe(true);expect(s.gl.createProgram.mock.calls.length-programs).toBe(6)
  expect(s.cpu.reservedBytes-baseline).toBe(triple.cpuBytes);expect(s.snapshot()).toEqual(before)
 }finally{s.pass.reset();s.cache.clear()}
 expect(s.cpu.reservedBytes).toBe(baseline)
})

it('keeps standalone foreign sampler query/restore even when a source advertises internal owned metadata',()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['over32']},s.companion)
 const epoch={alive:true},source={texture:s.gl.createTexture(),gl:s.gl},release=vi.fn(),lifetime={kind:'external' as const,owner:epoch,ownedPointSampler:{texture:source.texture,source,epoch},lease:()=>release}
 const target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}}
 const view:CanonicalRgba8SourceView={brand:'canonical-straight-rgba8-view-v1',texture:source.texture,textureWidth:8,textureHeight:8,rect:{x:10,y:20,width:8,height:8},bounds:{x:0,y:0,width:1,height:1},mirror:{horizontal:false,vertical:false},rowOrder:'bottomAtV0',residency:lifetime}
 const before=s.snapshot(),query=vi.spyOn(s.gl,'getTexParameter')
 expect(s.pass.drawSource({source:{kind:'straightRgba8',view},target,operation:{kind:'over32',control:{profile:'portable-f32-division-rne-v1',opacity:.63}}})).toBe('painted')
 expect(query).toHaveBeenCalledTimes(4);expect(release).toHaveBeenCalledTimes(1)
 expect(s.params.get(source.texture)?.get(s.gl.TEXTURE_MIN_FILTER)).toBe(s.gl.LINEAR);expect(s.params.get(source.texture)?.get(s.gl.TEXTURE_WRAP_S)).toBe(s.gl.REPEAT)
 expect(s.snapshot()).toEqual(before);s.pass.reset()
})

describe('explicit browser arithmetic in the existing composite pass',()=>{
    const profile='browser-highp-rgba8-v1' as const;
    it('prepares only ordinary browser kernels and preserves warm resources and GL state',()=>{
        const s=setup(),before=s.snapshot();
        s.pass.prepare({width:16,height:16,operations:['alphaDarkenBrowserFloat','overBrowserFloat']},s.companion);
        const shaders=s.gl.shaderSource.mock.calls.map((call:unknown[])=>String(call[1])).join('\n');
        expect(shaders).not.toMatch(/sourceFma|srgbTop|sourceF32Decompose/);
        expect(shaders).toContain('sourceCompositeAlphaDarken32');expect(shaders).toContain('sourceCompositeOver32Scalar');
        const programs=s.gl.createProgram.mock.calls.length,uploads=s.gl.texImage2D.mock.calls.length;
        const target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}};
        for(const variant of ['creamy','hard'] as const){
            expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[198,36,90]},target,
                operation:{kind:'alphaDarkenBrowserFloat',control:{...control,profile,variant,mask:128}}})).toBe('painted');
            expect(s.gl.uniform2f.mock.calls.filter((r:any[])=>r[0].name==='policy').at(-1).slice(1)).toEqual([variant==='hard'?1:0,1]);
        }
        expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[198,36,90]},target,
            operation:{kind:'overBrowserFloat',control:{profile,opacity:.4}}})).toBe('painted');
        expect(s.gl.uniform2f.mock.calls.filter((r:any[])=>r[0].name==='policy').at(-1).slice(1)).toEqual([0,0]);
        expect(s.gl.createProgram).toHaveBeenCalledTimes(programs);expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);
        expect(s.snapshot()).toEqual(before);s.pass.reset();expect(s.cpu.reservedBytes).toBe(0);
    });
    it('does not accept native controls or unprepared native operations through the browser cache keys',()=>{
        const s=setup();s.pass.prepare({width:16,height:16,operations:['alphaDarkenBrowserFloat','overBrowserFloat']},s.companion);
        const target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}};
        const source={kind:'maskRgb' as const,view:s.view,rgb:[1,2,3] as const};
        expect(()=>s.pass.drawSource({source,target,operation:{kind:'alphaDarkenBrowserFloat',control}} as unknown as CanonicalCompositeRequest)).toThrow('controls');
        expect(()=>s.pass.drawSource({source,target,operation:{kind:'overBrowserFloat',control:{profile:'portable-f32-division-rne-v1',opacity:.4}}} as unknown as CanonicalCompositeRequest)).toThrow('profile');
        expect(()=>s.pass.drawSource({source,target,operation:{kind:'alphaDarken32',control}})).toThrow();
        expect(s.gl.drawArrays).not.toHaveBeenCalled();s.pass.reset();expect(s.cpu.reservedBytes).toBe(0);
    });
});


// Public cold prepare; no private compiler calls or substituted source metadata.
const sharedVertexLimits={width:16,height:16,operations:['alphaDarken32FusedScalar','over32FusedScalar','genericSCU8'] as const,texturedOperations:['alphaDarken32FusedScalar','over32FusedScalar'] as const};
function sharedVertexFixture(){
 const s=setup();s.gl.getShaderPrecisionFormat=()=>({precision:23,rangeMax:127,rangeMin:127});s.gl.getProgramInfoLog=()=>'';
 const types=new Map<unknown,number>(),create=s.gl.createShader.getMockImplementation();
 s.gl.createShader.mockImplementation((type:number)=>{const shader=create(type);if(shader)types.set(shader,type);return shader});
 const shaderStatus=vi.spyOn(s.gl,'getShaderParameter'),programStatus=vi.spyOn(s.gl,'getProgramParameter');
 return{...s,types,shaderStatus,programStatus};
}
it('cold GSC prepares eight exact program variants with one local shared vertex, then warm companion updates compile nothing',()=>{
 const s=sharedVertexFixture(),before=s.snapshot();
 try{
  s.pass.prepare(sharedVertexLimits,s.companion);
  const vertices=s.gl.createShader.mock.results.map((x:any)=>x.value).filter((x:object)=>s.types.get(x)===s.gl.VERTEX_SHADER);
  expect(vertices).toHaveLength(1);expect(s.gl.createShader).toHaveBeenCalledTimes(9);expect(s.gl.createProgram).toHaveBeenCalledTimes(8);
  expect(s.shaderStatus).toHaveBeenCalledTimes(9);expect(s.programStatus).toHaveBeenCalledTimes(8);
  expect(s.gl.shaderSource.mock.calls.find(([shader]:any[])=>shader===vertices[0])?.[1]).toBe('attribute highp vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}');
  const fragments=s.gl.shaderSource.mock.calls.filter(([shader]:any[])=>s.types.get(shader)===s.gl.FRAGMENT_SHADER).map(([,source]:any[])=>source);
  expect(fragments).toHaveLength(8);expect(new Set(fragments).size).toBe(8);expect(fragments.filter((source:string)=>source.includes('uniform highp sampler2D patternTexture;'))).toHaveLength(2);
  for(const {value:program}of s.gl.createProgram.mock.results)expect(s.gl.attachShader.mock.calls.filter(([p]:any[])=>p===program).map(([,shader]:any[])=>shader)).toEqual([vertices[0],expect.any(Object)]);
  expect(s.gl.deleteShader.mock.calls.filter(([shader]:any[])=>shader===vertices[0])).toHaveLength(1);expect(s.gl.deleteShader).toHaveBeenCalledTimes(9);
  expect(s.pass.supportsOperations(sharedVertexLimits.operations)).toBe(true);expect(s.pass.supportsTexturedOperations(sharedVertexLimits.texturedOperations)).toBe(true);expect(s.snapshot()).toEqual(before);
  s.pass.prepare(sharedVertexLimits,s.companion);expect(s.gl.createShader).toHaveBeenCalledTimes(9);expect(s.gl.createProgram).toHaveBeenCalledTimes(8);
 }finally{s.pass.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)}
 expect(s.gl.deleteProgram).toHaveBeenCalledTimes(8);
});
it('cold shared vertex transaction rolls back status/allocation/deletion faults, preserving undefined primary and restoring GL',()=>{
 for(const fault of ['vertex-status','table-fragment-status','fragment3-status','link3-status','program3-allocation','fragment-delete-undefined','vertex-delete-undefined'] as const){
  const s=sharedVertexFixture(),before=s.snapshot();let fragments=0,links=0,allocations=0;
  if(fault==='vertex-status'||fault==='fragment3-status'||fault==='table-fragment-status')s.shaderStatus.mockImplementation((shader:unknown)=>s.types.get(shader)===s.gl.VERTEX_SHADER?fault!=='vertex-status':++fragments!==(fault==='table-fragment-status'?5:3));
  if(fault==='link3-status')s.programStatus.mockImplementation(()=>++links!==3);
  if(fault==='program3-allocation'){const create=s.gl.createProgram.getMockImplementation();s.gl.createProgram.mockImplementation(()=>++allocations===3?null:create())}
  if(fault.endsWith('delete-undefined')){const remove=s.gl.deleteShader.getMockImplementation();let thrown=false;s.gl.deleteShader.mockImplementation((shader:object)=>{remove(shader);if(!thrown&&s.types.get(shader)===(fault==='vertex-delete-undefined'?s.gl.VERTEX_SHADER:s.gl.FRAGMENT_SHADER)){thrown=true;throw undefined}})}
  let failed=false,primary:unknown='not-rejected';try{s.pass.prepare(sharedVertexLimits,s.companion)}catch(error){failed=true;primary=error}
  expect(failed).toBe(true);if(fault.endsWith('delete-undefined'))expect(primary).toBeUndefined();else expect(primary).toBeInstanceOf(Error);
  expect(s.pass.isReady()).toBe(false);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(1024);
  const createdPrograms=s.gl.createProgram.mock.results.map((x:any)=>x.value).filter(Boolean);expect(s.gl.deleteProgram.mock.calls.map(([p]:any[])=>p)).toEqual(expect.arrayContaining(createdPrograms));expect(new Set(s.gl.deleteProgram.mock.calls.map(([p]:any[])=>p)).size).toBe(createdPrograms.length);expect(s.gl.deleteProgram).toHaveBeenCalledTimes(createdPrograms.length);
  const createdShaders=s.gl.createShader.mock.results.map((x:any)=>x.value).filter(Boolean);expect(s.gl.deleteShader.mock.calls.map(([p]:any[])=>p)).toEqual(expect.arrayContaining(createdShaders));expect(new Set(s.gl.deleteShader.mock.calls.map(([p]:any[])=>p)).size).toBe(createdShaders.length);expect(s.gl.deleteShader).toHaveBeenCalledTimes(createdShaders.length);
  s.pass.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0);
 }
});
it('cold shared vertex cancellation and lost reset retain existing program retirement semantics',()=>{
 for(const lost of [false,true]){
  const s=sharedVertexFixture(),abort=new AbortController(),before=s.snapshot();
  if(!lost){const link=s.gl.linkProgram.getMockImplementation();s.gl.linkProgram.mockImplementation((p:object)=>{link?.(p);abort.abort()});expect(s.pass.prepare(sharedVertexLimits,s.companion,0,abort.signal)).toBe('cancelled');expect(s.pass.isReady()).toBe(false);expect(s.gl.deleteProgram).toHaveBeenCalledTimes(8)}
  else{s.pass.prepare(sharedVertexLimits,s.companion);s.pass.reset(true);expect(s.gl.deleteProgram).not.toHaveBeenCalled()}
  expect(s.gl.deleteShader).toHaveBeenCalledTimes(9);expect(s.snapshot()).toEqual(before);s.pass.reset(lost);s.cache.clear();expect(s.cpu.reservedBytes).toBe(0);
 }
});

it('dispatches all extended Pixel functors through one prepared GenericSC program without draw-time compilation',async()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['genericSCU8']},s.companion)
 const releaseScalarPages=await retainScalarPowerTestPages(s.pass)
 const target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}}
 const programs=s.gl.createProgram.mock.calls.length,before=s.snapshot(),policy=vi.spyOn(s.gl,'uniform4f')
 // Literal IDs are the producer/shader ABI, not generated from the implementation enum.
 const cases=[['add',1],['darken',7],['screen',8],['colorBurn',9],['linearBurn',10],['subtract',11],['difference',12],['exclusion',13],['softLight',14],['hardLight',15],['divide',16],['linearLight',17],['vividLight',18],['pinLight',19],['hardMix',20],['darkerColor',21],['lighterColor',22],['hue',23],['saturation',24],['luminosity',25],['hardMixPhotoshop',26],['softLightSvg',27],['equivalence',28],['additiveSubtractive',29],['arcTangent',30],['negation',31],['inverseSubtract',32],['grainMerge',33],['grainExtract',34],['allanon',35],['geometricMean',36],['parallel',37],['reflect',38],['glow',39],['freeze',40],['heat',41],['glowHeat',42],['heatGlow',43],['reflectFreeze',44],['freezeReflect',45],['heatGlowFreezeReflectHybrid',46],['hardMixSofterPhotoshop',47],['penumbraA',48],['penumbraB',49],['penumbraC',50],['penumbraD',51],['flatLight',52],['binaryXor',53],['binaryOr',54],['binaryAnd',55],['binaryNand',56],['binaryNor',57],['binaryXnor',58],['binaryImplication',59],['binaryNotImplication',60],['binaryConverse',61],['binaryNotConverse',62],['tint',63],['increaseSaturation',64],['decreaseSaturation',65],['increaseLuminosity',66],['decreaseLuminosity',67],['colorHsl',68],['hueHsl',69],['saturationHsl',70],['increaseSaturationHsl',71],['decreaseSaturationHsl',72],['lightnessHsl',73],['increaseLightnessHsl',74],['decreaseLightnessHsl',75],['colorHsv',76],['hueHsv',77],['saturationHsv',78],['increaseSaturationHsv',79],['decreaseSaturationHsv',80],['valueHsv',81],['increaseValueHsv',82],['decreaseValueHsv',83],['colorHsi',84],['hueHsi',85],['saturationHsi',86],['increaseSaturationHsi',87],['decreaseSaturationHsi',88],['intensityHsi',89],['increaseIntensityHsi',90],['decreaseIntensityHsi',91],['gammaDark',92],['gammaLight',93],['gammaIllumination',94],['easyDodge',95],['easyBurn',96],['pNormA',97],['pNormB',98],['superLight',99],['softLightIfs',100],['softLightPegtop',101],['tintIfs',102],['shadeIfs',103],['fogLightenIfs',104],['fogDarkenIfs',105],['modulo',106],['moduloContinuous',107],['divisiveModulo',108],['divisiveModuloContinuous',109],['moduloShift',110],['moduloShiftContinuous',111],['hardOverlay',112],['interpolation',113],['interpolation2x',114],['lambertLighting',115],['lambertLightingGamma22',116],['combineNormal',117],['tangentNormalmap',118],['copyRed',119],['copyGreen',120],['copyBlue',121],['behind',122],['luminositySai',123],['greater',124]] as const
 try{
  for(const [mode,id]of cases){
   expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[200,100,50]},target,operation:{kind:'genericSCU8',control:{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1}}})).toBe('painted')
   expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({name:'policy'}),id,0,1,0)
  }
  expect(s.gl.createProgram.mock.calls.length).toBe(programs)
  expect(s.snapshot()).toEqual(before)
  // recordingGL validates selection/state, not shader pixels. GPU readback is a later device gate.
  const fragmentSources=s.gl.shaderSource.mock.calls.map((call:unknown[])=>String(call[1])).join('\n')
  expect(fragmentSources).toContain('sourceRgba8VectorBlend')
  // The REAL compiled WebGL1 body, not only host controls or the ES3 source.
  for(let id=28;id<=114;id++)expect(fragmentSources).toMatch(new RegExp('mode\\s*==\\s*'+id+'\\.0'))
 }finally{releaseScalarPages();s.pass.reset();s.cache.clear()}
})

it('adds only missing image-material programs with the same checked publication and exact CPU accounting',()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['overBrowserFloat','genericSCU8','colorHsyBrowser'],imageMaterialOperations:['overBrowserFloat']},s.companion)
 const before=s.snapshot(),cpu=s.cpu.reservedBytes,programs=s.gl.createProgram.mock.calls.length
 const update=s.pass.prepareImageMaterialProgramUpdate(['genericSCU8','colorHsyBrowser'])
 try{
  expect(s.pass.preparedImageMaterialOperations()).toEqual(['overBrowserFloat'])
  expect(s.pass.supportsImageMaterialOperations(['genericSCU8'])).toBe(false)
  expect(s.cpu.reservedBytes-cpu).toBe(4096+5*8192)
  expect(s.gl.createProgram.mock.calls.length-programs).toBe(5)
  expect(()=>s.pass.prepareImageMaterialProgramUpdate(['genericSCU8'])).toThrow()
  update.assertCurrent();update.publish();update.finalizeCleanup()
  expect(s.pass.preparedImageMaterialOperations()).toEqual(['genericSCU8','colorHsyBrowser','overBrowserFloat'])
  expect(s.pass.supportsImageMaterialOperations(['genericSCU8','colorHsyBrowser'])).toBe(true)
  expect(s.cpu.reservedBytes-cpu).toBe(5*8192)
  const duplicate=s.pass.prepareImageMaterialProgramUpdate(['genericSCU8']);duplicate.assertCurrent();duplicate.publish();duplicate.finalizeCleanup()
  expect(s.gl.createProgram.mock.calls.length-programs).toBe(5)
  expect(s.cpu.reservedBytes-cpu).toBe(5*8192)
  expect(s.snapshot()).toEqual(before)
 }finally{if(update.status==='pending')update.cancel();else update.finalizeCleanup();s.pass.reset();s.cache.clear()}
})

it('cancels unpublished image programs and rejects variants lacking their base operation',()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['overBrowserFloat','genericSCU8'],imageMaterialOperations:['overBrowserFloat']},s.companion)
 const cpu=s.cpu.reservedBytes,programs=s.gl.createProgram.mock.calls.length,before=s.snapshot()
 try{
  expect(()=>s.pass.prepareImageMaterialProgramUpdate(['colorHsyBrowser'])).toThrow()
  expect(s.gl.createProgram.mock.calls.length).toBe(programs);expect(s.cpu.reservedBytes).toBe(cpu)
  const update=s.pass.prepareImageMaterialProgramUpdate(['genericSCU8'])
  update.cancel();update.finalizeCleanup()
  expect(s.pass.preparedImageMaterialOperations()).toEqual(['overBrowserFloat'])
  expect(s.pass.supportsImageMaterialOperations(['genericSCU8'])).toBe(false)
  expect(s.cpu.reservedBytes).toBe(cpu);expect(s.snapshot()).toEqual(before)
 }finally{s.pass.reset();s.cache.clear()}
})

it('uses the prepared image material program for all channel extension modes without new allocations',async()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['genericSCU8'],imageMaterialOperations:['genericSCU8']},s.companion)
 const releaseScalarPages=await retainScalarPowerTestPages(s.pass,['image'])
 const target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}}
 const modes=['equivalence','additiveSubtractive','arcTangent','negation','inverseSubtract','grainMerge','grainExtract','allanon','geometricMean','parallel','reflect','glow','freeze','heat','glowHeat','heatGlow','reflectFreeze','freezeReflect','heatGlowFreezeReflectHybrid','hardMixSofterPhotoshop','penumbraA','penumbraB','penumbraC','penumbraD','flatLight','binaryXor','binaryOr','binaryAnd','binaryNand','binaryNor','binaryXnor','binaryImplication','binaryNotImplication','binaryConverse','binaryNotConverse','tint','increaseSaturation','decreaseSaturation','increaseLuminosity','decreaseLuminosity','colorHsl','hueHsl','saturationHsl','increaseSaturationHsl','decreaseSaturationHsl','lightnessHsl','increaseLightnessHsl','decreaseLightnessHsl','colorHsv','hueHsv','saturationHsv','increaseSaturationHsv','decreaseSaturationHsv','valueHsv','increaseValueHsv','decreaseValueHsv','colorHsi','hueHsi','saturationHsi','increaseSaturationHsi','decreaseSaturationHsi','intensityHsi','increaseIntensityHsi','decreaseIntensityHsi','gammaDark','gammaLight','gammaIllumination','easyDodge','easyBurn','pNormA','pNormB','superLight','softLightIfs','softLightPegtop','tintIfs','shadeIfs','fogLightenIfs','fogDarkenIfs','modulo','moduloContinuous','divisiveModulo','divisiveModuloContinuous','moduloShift','moduloShiftContinuous','hardOverlay','interpolation','interpolation2x','lambertLighting','lambertLightingGamma22','combineNormal','tangentNormalmap','copyRed','copyGreen','copyBlue','behind','luminositySai','greater'] as const,policy=vi.spyOn(s.gl,'uniform4f'),programs=s.gl.createProgram.mock.calls.length,before=s.snapshot()
 try{for(const [i,mode]of modes.entries()){
  expect(s.pass.drawSource({source:{kind:'imageMaterialRgba',material:'lightness-map-v1',view:{...s.view,imageMaterial:'lightness-map-v1'},rgb:[91,127,255],strength:.7,foregroundAlpha:.8},target,operation:{kind:'genericSCU8',control:{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:.8}}})).toBe('painted')
  expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({name:'policy'}),28+i,0,1,0)
 }expect(s.gl.createProgram.mock.calls.length).toBe(programs);expect(s.snapshot()).toEqual(before)}finally{releaseScalarPages();s.pass.reset();s.cache.clear()}
})

// RecordingGL proves dispatch and clipping, not final pixel arithmetic (covered by CPU and future GPU oracle).
it.each(['copy','destinationIn','destinationAtop']as const)('submits full geometric %s domain at zero opacity and zero group mask',mode=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['genericSCU8']},s.companion)
 const target:CanonicalOwnedRgba8Target={...s.target,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}}
 try{
  for(const controls of [{opacity:0},{opacity:1,mask:0}]){
   s.gl.drawArrays.mockClear()
   expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[91,127,255]},target,operation:{kind:'genericSCU8',control:{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,...controls}}})).toBe('painted')
   expect(s.gl.drawArrays).toHaveBeenCalledTimes(1)
  }
  // Geometric disjointness remains the sole empty-domain shortcut.
  s.gl.drawArrays.mockClear()
  expect(s.pass.drawSource({source:{kind:'maskRgb',view:s.view,rgb:[91,127,255]},target,operation:{kind:'genericSCU8',control:{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:0}},writeBounds:{minX:100,minY:100,maxX:101,maxY:101}})).toBe('empty')
  expect(s.gl.drawArrays).not.toHaveBeenCalled()
 }finally{s.pass.reset()}
})

it.each([0x80000000,-0x80000001,Number.MAX_SAFE_INTEGER-16,Number.MIN_SAFE_INTEGER+16])('uploads explicit low32 Dissolve origins for existing safe canvas coordinate %s',origin=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['genericSCU8']},s.companion)
 const target:CanonicalOwnedRgba8Target={...s.target,originX:origin,originY:origin,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}}
 try{
  const view={...s.view,rect:{...s.view.rect,x:origin,y:origin}}
  expect(s.pass.drawSource({source:{kind:'maskRgb',view,rgb:[1,2,3]},target,operation:{kind:'genericSCU8',control:{mode:'dissolve',profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1,seed:7}}})).toBe('painted')
  const n=origin>>>0,bytes=[n&255,(n>>>8)&255,(n>>>16)&255,n>>>24]
  expect(s.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({name:'sourceDissolveOriginX'}),...bytes)
  expect(s.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({name:'sourceDissolveOriginY'}),...bytes)
 }finally{s.pass.reset()}
})
