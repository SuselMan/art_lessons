import { describe, expect, it, vi } from 'vitest';
import { BrushTextureCache } from './BrushTextureCache';
import { BrushMipCache } from './BrushMipCache';
import { TransformedMaskPrepass, transformedMaskPrepassBudget, type TransformedMaskRequest } from './TransformedMaskPrepass';
import { resolvedTransformedMaskPlan } from './TransformedMaskPlan';
import { sourcePngMaskExtent } from '../presets/sourcePngGeometry';
import { recordingGL } from '../../testing/brushPassTestUtils';

function material(scale = .6) {
  const brush = Object.freeze({ width: 2, height: 1, scale: 1, angle: 0 }), shape = Object.freeze({ scale, ratio: 1, rotation: .37 });
  const [width, height] = sourcePngMaskExtent(brush, shape, .25, .5);
  return Object.freeze({ sequence: 0, brushIdentity: 'immutable-test', brush, shape, width, height, position: { x: 0, y: 0 }, key: Object.freeze({ color: 'fixed', angle: .37, width, height, subPixelX: .25, subPixelY: .5, softness: 1, lightness: 1, ratio: 1, index: 0, mirrorH: false, mirrorV: false }), mirror: Object.freeze({ horizontal: false, vertical: false, coordinateSystemFlipped: false }) });
}
function setup(gpu = 2 * 1024 * 1024, cpuBudget = 2 * 1024 * 1024) {
  const { gl, snapshot } = recordingGL(), cache = new BrushTextureCache(gl, gpu), cpu = new BrushMipCache(cpuBudget), service = new TransformedMaskPrepass(gl, cache, cpu, 'test');
  const m = material(), p = resolvedTransformedMaskPlan(m), source = { key: 'source', texture: gl.createTexture(), width: p.levelWidth + 2, height: p.levelHeight + 2 };
  const resources = [{ key: source.key, bytes: source.width * source.height * 4 }];
  cache.protect(['source']);
  cache.put('source', source.texture, resources[0].bytes);
  const owner = {}, request: TransformedMaskRequest = { owner, role: 'primary', material: m, source, rect: { x: -90, y: 45, width: m.width, height: m.height }, profile: 'neon4-summed-wordsize64' };
  return { gl, snapshot, cache, cpu, service, resources, request };
}
describe('internal persistent transformed-mask service', () => {
  it('prepares once, reuses targets on material misses and performs no GPU uploads/draws on a copy hit', () => {
    const s = setup(), before = s.snapshot();
    expect(s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources)).toBe('ready');
    expect(s.snapshot()).toEqual(before);
    const first = s.service.resolveGroup([s.request]);
    first.release();
    const uploads = s.gl.texImage2D.mock.calls.length, buffers = s.gl.bufferData.mock.calls.length, draws = s.gl.drawArrays.mock.calls.length;
    const copy = s.service.resolveGroup([{ ...s.request, rect: { ...s.request.rect, x: 200 } }]);
    copy.release();
    expect(copy.views[0].texture).toBe(first.views[0].texture);
    expect(copy.views[0].rect.x).toBe(200);
    expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);
    expect(s.gl.bufferData).toHaveBeenCalledTimes(buffers);
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws);
    const m = material(.7), change = s.service.resolveGroup([{ ...s.request, material: m, rect: { ...s.request.rect, width: m.width, height: m.height } }]);
    change.release();
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws + 1);
    expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);
    expect(s.snapshot()).toEqual(before);
  });
  it('keeps simultaneous primary/child masks distinct, reserves later hits and regenerates a replaced owner without RNG', () => {
    const s = setup();
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    const child = { ...s.request, role: 'child' }, first = s.service.resolveGroup([s.request, child]);
    first.release();
    expect(first.views[0].texture).not.toBe(first.views[1].texture);
    const draws = s.gl.drawArrays.mock.calls.length;
    const other = { ...s.request, owner: {} }, next = s.service.resolveGroup([other, child]);
    next.release();
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws + 1);
    const regenerated = s.service.resolveGroup([s.request, child]);
    regenerated.release();
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws + 2);
  });
  it('rejects GPU/CPU budgets and late invalid requests before resource/state effects', () => {
    for (const [gpu, cpu] of [[1000, 2000000], [2000000, 1000]]) {
      const s = setup(gpu, cpu), before = s.gl.createTexture.mock.calls.length;
      expect(() => s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources)).toThrow('budgets');
      expect(s.gl.createTexture).toHaveBeenCalledTimes(before);
      expect(s.cpu.reservedBytes).toBe(0);
    }
    const s = setup();
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    const before = s.snapshot(), draws = s.gl.drawArrays.mock.calls.length;
    expect(() => s.service.resolveGroup([s.request, { ...s.request, role: 'bad', rect: { ...s.request.rect, width: 100 } }])).toThrow();
    expect(s.snapshot()).toEqual(before);
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws);
  });
  it('restores all live GL state on draw failure and clears failed revisions for a correct retry', () => {
    const s = setup();
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    const before = s.snapshot();
    s.gl.drawArrays.mockImplementationOnce(() => { throw new Error('injected draw failure'); });
    expect(() => s.service.resolveGroup([s.request])).toThrow('injected');
    expect(s.snapshot()).toEqual(before);
    const retry = s.service.resolveGroup([s.request]);
    retry.release();
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(2);
  });
  it('invalidates old cached pixels BEFORE a failing replacement draw and regenerates the old definition', () => {
    const s = setup();
    s.service.prepare({ width: 16, height: 16, slots: 1 }, s.resources);
    const first = s.service.resolveGroup([s.request]);
    first.release();
    const replacement = { ...s.request, owner: {} };
    s.gl.drawArrays.mockImplementationOnce(() => { throw new Error('replacement failed after clear'); });
    expect(() => s.service.resolveGroup([replacement])).toThrow('replacement failed');
    const restored = s.service.resolveGroup([s.request]);
    restored.release();
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(3);
  });
  it('cancels without resources and rolls back a failed preparation', () => {
    const s = setup(), controller = new AbortController();
    controller.abort();
    expect(s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources, controller.signal)).toBe('cancelled');
    const allocations = s.gl.createTexture.mock.calls.length;
    expect(() => s.service.prepare({ width: 16, height: 16, slots: 2 }, [{ key: 'missing', bytes: 4 }])).toThrow('prepared');
    expect(s.gl.createTexture).toHaveBeenCalledTimes(allocations);
    s.gl.createFramebuffer.mockReturnValueOnce(null);
    expect(() => s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources)).toThrow('FBO');
    expect(s.service.isReady()).toBe(false);
    expect(s.cpu.reservedBytes).toBe(0);
    expect(s.cache.bytes).toBe(s.resources[0].bytes);
    expect(s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources)).toBe('ready');
  });
  it('forgets all resources on context loss, disposes normal ownership once, and blocks unresolved residency', () => {
    const s = setup();
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    s.cache.clear(true);
    s.service.reset(true);
    expect(s.gl.deleteTexture).not.toHaveBeenCalled();
    expect(s.gl.deleteFramebuffer).not.toHaveBeenCalled();
    expect(s.gl.deleteBuffer).not.toHaveBeenCalled();
    expect(s.gl.deleteProgram).not.toHaveBeenCalled();
    expect(s.cpu.reservedBytes).toBe(0);
    expect(() => s.service.resolveGroup([s.request])).toThrow('prepared');
    s.cache.protect(['source']);
    s.cache.put('source', s.request.source.texture, s.resources[0].bytes);
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    s.service.reset();
    s.service.reset();
    expect(s.gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(s.gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(s.gl.deleteTexture).toHaveBeenCalledTimes(4);
    expect(s.gl.deleteProgram).toHaveBeenCalledTimes(1);
  });
  it('isolates optional VAO ownership, restores caller binding and forgets it on loss', () => {
    for (const lost of [false, true]) {
      const s = setup(), external = {}, owned = {};
      let bound: object | null = external;
      const extension = {
        VERTEX_ARRAY_BINDING_OES: 9001,
        createVertexArrayOES: vi.fn(() => owned),
        bindVertexArrayOES: vi.fn((value: object | null) => { bound = value; }),
        deleteVertexArrayOES: vi.fn(),
      };
      const getExtension = s.gl.getExtension, getParameter = s.gl.getParameter;
      s.gl.getExtension = (name: string) => name === 'OES_vertex_array_object' ? extension : getExtension(name);
      s.gl.getParameter = (name: number) => name === extension.VERTEX_ARRAY_BINDING_OES ? bound : getParameter(name);
      s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
      expect(bound).toBe(external);
      const group = s.service.resolveGroup([s.request]);
      try { expect(bound).toBe(external); expect(extension.bindVertexArrayOES).toHaveBeenCalledWith(owned); }
      finally { group.release(); }
      s.service.reset(lost);
      s.service.reset(lost);
      expect(extension.createVertexArrayOES).toHaveBeenCalledTimes(1);
      expect(extension.deleteVertexArrayOES).toHaveBeenCalledTimes(lost ? 0 : 1);
    }
  });

  it('rejects overlapping groups before effects and makes stale releases harmless after reset', () => {
    const s = setup();
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    const old = s.service.resolveGroup([s.request]), draws = s.gl.drawArrays.mock.calls.length;
    expect(() => s.service.resolveGroup([{ ...s.request, owner: {} }])).toThrow('Release');
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws);
    s.service.reset();
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    const current = s.service.resolveGroup([s.request]);
    old.release(); old.release();
    expect(() => s.service.resolveGroup([s.request])).toThrow('Release');
    current.release(); current.release();
    const next = s.service.resolveGroup([s.request]);
    next.release();
    s.service.reset();
  });

  it('reports exact prepared workspace/slot charges separately from source-bank entries', () => {
    const s = setup();
    expect(() => s.service.preparedResources()).toThrow('prepared');
    s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    const resources = s.service.preparedResources(), budget = transformedMaskPrepassBudget({ width: 16, height: 16, slots: 2 });
    expect(resources).toHaveLength(3);
    expect(resources.some(resource => resource.key === 'source')).toBe(false);
    expect(resources.reduce((sum, resource) => sum + resource.bytes, 0)).toBe(s.cache.bytes - s.resources[0].bytes);
    expect(budget.gpuBytes).toBe(resources.reduce((sum, resource) => sum + resource.bytes, 0));
    expect(budget.cpuBytes).toBe(s.cpu.reservedBytes);
    s.service.reset(true);
    expect(() => s.service.preparedResources()).toThrow('prepared');
  });

});

describe('canonical prepared bank binding', () => {
  function canonicalSetup() {
    const s = setup(), m = material(), p = resolvedTransformedMaskPlan(m);
    const asset = { id: 'asset:' + 'a'.repeat(64), size: 4, x: 1, y: 2, width: 2, height: 1 };
    const recipe = { asset: asset.id, brushScale: m.brush.scale, brushAngle: m.brush.angle, scale: m.shape.scale, ratio: m.shape.ratio,
      rotation: m.shape.rotation, subX: m.key.subPixelX, subY: m.key.subPixelY, width: m.width, height: m.height, mirrorH: false, mirrorV: false };
    const binding = { asset: { ...asset }, index: p.index, baseScale: p.baseScale, nativeWidth: p.levelWidth, nativeHeight: p.levelHeight };
    const request = { ...s.request, material: { kind: 'canonical' as const, recipe, asset } };
    const resources = [{ ...s.resources[0]!, canonical: binding }];
    s.service.prepare({ width: 16, height: 16, slots: 2 }, resources);
    return { ...s, request, asset, recipe, binding };
  }
  it('hits across newly decoded objects and placement, mirrors view exactly once after raster', () => {
    const s = canonicalSetup(), first = s.service.resolveGroup([s.request]), texture = first.views[0]!.texture;
    first.release(); const draws = s.gl.drawArrays.mock.calls.length, uploads = s.gl.texImage2D.mock.calls.length;
    const copy = structuredClone(s.request.material);
    copy.recipe.mirrorH = true; copy.recipe.mirrorV = true;
    const hit = s.service.resolveGroup([{ ...s.request, material: copy, rect: { ...s.request.rect, x: 1234567, y: -7654321 } }]);
    expect(hit.views[0]!.texture).toBe(texture); expect(hit.views[0]!.mirror).toEqual({ horizontal: true, vertical: true });
    expect(hit.views[0]!.rect.x).toBe(1234567); expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws); expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);
    hit.release(); s.service.reset(); s.cache.clear();
  });
  it('rerasterizes changed exact recipe, but rejects wrong crop, level/source, handle and allocation before GL', () => {
    const s = canonicalSetup(); s.service.resolveGroup([s.request]).release();
    const changed = { ...s.request.material, recipe: { ...s.recipe, subX: s.recipe.subX + Number.EPSILON } };
    const n = s.gl.drawArrays.mock.calls.length;
    s.service.resolveGroup([{ ...s.request, material: changed }]).release(); expect(s.gl.drawArrays.mock.calls.length).toBeGreaterThan(n);
    const before = s.snapshot(), draws = s.gl.drawArrays.mock.calls.length;
    const otherLevel = material(.075);
    for (const request of [
      { ...s.request, material: { ...s.request.material, asset: { ...s.asset, x: 0 } } },
      { ...s.request, material: { ...s.request.material, asset: { ...s.asset, id: 'asset:' + 'b'.repeat(64) } } },
      { ...s.request, material: { ...s.request.material, recipe: { ...s.recipe, scale: s.recipe.scale / 8 } } },
      { ...s.request, material: { ...s.request.material, recipe: { ...s.recipe, width: s.recipe.width + 1 } } },
      { ...s.request, material: { ...s.request.material, recipe: { ...s.recipe, scale: .075, width: otherLevel.width, height: otherLevel.height } }, rect: { ...s.request.rect, width: otherLevel.width, height: otherLevel.height } },
      { ...s.request, source: { ...s.request.source, key: 'unbound' } },
      { ...s.request, source: { ...s.request.source, texture: {} as WebGLTexture } },
    ]) expect(() => s.service.resolveGroup([request])).toThrow();
    expect(s.snapshot()).toEqual(before); expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws);
    s.service.reset(); s.cache.clear();
  });
  it('snapshots cold metadata and refuses canonical replay with legacy unbound prepared resources', () => {
    const s = canonicalSetup(); s.binding.asset.x = 0; s.binding.baseScale = 123;
    expect(() => s.service.resolveGroup([s.request]).release()).not.toThrow();
    s.service.reset(); s.service.prepare({ width: 16, height: 16, slots: 2 }, s.resources);
    expect(() => s.service.resolveGroup([s.request])).toThrow('binding');
    // Legacy source caller still works with the old texture resource API.
    expect(() => s.service.resolveGroup([{ ...s.request, material: material() }]).release()).not.toThrow();
    expect(() => s.service.resolveGroup([{ ...s.request, material: { kind: 'savedSource', source: material() } }]).release()).not.toThrow();
    s.service.reset(); s.cache.clear();
  });
});
