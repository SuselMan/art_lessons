import { allocateOwnedBrushTexture } from './BrushTextureCache';
import { GAUSSIAN_DATA_STOCK, sourceGaussianCanonicalFixture } from '../../testing/sourceGaussianCanonicalFixture';
import gaussianNative from '../presets/fixtures/sourceGaussianWholePath/whole.native.json';
import { sourceGaussianDab } from '../presets/sourceGaussianDab';
import { canonicalAutoMaskRevision } from './TransformedMaskPlan';
import type { CanonicalGaussianAutoRecipe, CanonicalGaussianAutoSource, CanonicalDefaultAutoRecipe, CanonicalDefaultAutoSource, CanonicalAutoRecipe, CanonicalAutoSource } from '@grafetto/shared';
import { prepareSourceDefaultAutoDab } from '../presets/sourceDefaultAutoDab';
import { CanonicalRgba8CompositePass } from './CanonicalRgba8CompositePass';
import { runBrushGlBatch,runBrushGlTurn,type BrushGlTurn } from './BrushGlBatch';
import { describe, expect, it, vi } from 'vitest';
import { BrushTextureCache } from './BrushTextureCache';
import { BrushMipCache } from './BrushMipCache';
import { TransformedMaskPrepass, transformedMaskPrepassBudget, type TransformedMaskRequest } from './TransformedMaskPrepass';
import { resolvedTransformedMaskPlan } from './TransformedMaskPlan';
import { sourcePngMaskExtent } from '../presets/sourcePngGeometry';
import { recordingGL } from '../../testing/brushPassTestUtils';
type AutoTestRequest<R extends CanonicalAutoRecipe,S extends CanonicalAutoSource> = Omit<import('./TransformedMaskPrepass').CanonicalAutoMaskRequest,'material'> & {
  readonly material:{readonly kind:'canonicalAuto';readonly recipe:R;readonly trustedSource:S}
};

function material(scale = .6) {
  const brush = Object.freeze({ width: 2, height: 1, scale: 1, angle: 0 }), shape = Object.freeze({ scale, ratio: 1, rotation: .37 });
  const [width, height] = sourcePngMaskExtent(brush, shape, .25, .5);
  return Object.freeze({ sequence: 0, brushIdentity: 'immutable-test', brush, shape, width, height, position: { x: 0, y: 0 }, key: Object.freeze({ color: 'fixed', angle: .37, width, height, subPixelX: .25, subPixelY: .5, softness: 1, lightness: 1, ratio: 1, index: 0, mirrorH: false, mirrorV: false }), mirror: Object.freeze({ horizontal: false, vertical: false, coordinateSystemFlipped: false }) });
}
function setup(gpu = 2 * 1024 * 1024, cpuBudget = 2 * 1024 * 1024) {
  const { gl, snapshot } = recordingGL(), cache = new BrushTextureCache(gl, gpu), cpu = new BrushMipCache(cpuBudget), service = new TransformedMaskPrepass(gl, cache, cpu, 'test');
  gl.texSubImage2D = vi.fn();
  gl.UNPACK_FLIP_Y_WEBGL=9001; gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL=9002;
  const pixelStore=gl.pixelStorei, getParameter=gl.getParameter, flags=new Map([[9001,true],[9002,true]]);
  gl.pixelStorei=(key:number,value:number|boolean)=>flags.has(key)?flags.set(key,!!value):pixelStore(key,value);
  gl.getParameter=(key:number)=>flags.has(key)?flags.get(key):getParameter(key);
  const m = material(), p = resolvedTransformedMaskPlan(m), source = { key: 'source', texture: null as unknown as WebGLTexture, width: p.levelWidth + 2, height: p.levelHeight + 2 };
  const resources = [{ key: source.key, bytes: source.width * source.height * 4 }];
  cache.protect(['source']);
  const owned=allocateOwnedBrushTexture(gl,resources[0].bytes,(texture,mark)=>{gl.bindTexture(gl.TEXTURE_2D,texture);mark(resources[0].bytes);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null)});source.texture=owned.texture;
  cache.putOwned('source',owned);
  const owner = {}, request: TransformedMaskRequest = { owner, role: 'primary', material: m, source, rect: { x: -90, y: 45, width: m.width, height: m.height }, profile: 'neon4-summed-wordsize64' };
  gl.texImage2D.mockClear();gl.bufferData.mockClear();
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
  it('rejects auto material before a compatible preloaded image revision can reuse its cached PNG plan', () => {
    const s = setup(), original = material()
    s.service.prepare({ width: 16, height: 16, slots: 1 }, s.resources)
    const first = s.service.resolveGroup([{ ...s.request, material: original }])
    first.release()
    const draws = s.gl.drawArrays.mock.calls.length, uploads = s.gl.texImage2D.mock.calls.length, before = s.snapshot()
    const geometry = { kind: 'defaultAuto' as const, coverageProfile: 'neon64-f32-fma-v1' as const,
      source: { kind: 'defaultAuto' as const, generator: 'default' as const, shape: 'circle' as const,
        diameter: 2, ratio: .5, horizontalFade: 1, verticalFade: 1, antialias: false, spikes: 2, randomness: 0, density: 1 } }
    // Every old revision component is identical; only the new source strategy
    // differs. Without the early guard, previous.plan bypasses plan validation.
    const auto = { ...original, geometry }
    const gaussian = { ...original, geometry: { ...geometry, kind: 'gaussianAuto' as const, source: { ...geometry.source, kind: 'gaussianAuto' as const, generator: 'gauss' as const } } }
    for (const m of [auto, { kind: 'savedSource' as const, source: auto }, gaussian, { kind: 'savedSource' as const, source: gaussian }]) {
      expect(() => s.service.resolveGroup([{ ...s.request, material: m }])).toThrow('Default auto')
      expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws)
      expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads)
      expect(s.snapshot()).toEqual(before)
    }
    const image = s.service.resolveGroup([{ ...s.request, material: original }])
    image.release()
    expect(image.views[0].texture).toBe(first.views[0].texture)
    expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws)
  })
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
    const renewed=allocateOwnedBrushTexture(s.gl,s.resources[0].bytes,(texture,mark)=>{s.gl.bindTexture(s.gl.TEXTURE_2D,texture);mark(s.resources[0].bytes);s.gl.texImage2D(s.gl.TEXTURE_2D,0,s.gl.RGBA,s.request.source.width,s.request.source.height,0,s.gl.RGBA,s.gl.UNSIGNED_BYTE,null)});
    s.request={...s.request,source:{...s.request.source,texture:renewed.texture}};s.cache.putOwned('source',renewed);
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

describe('prepass explicit synchronous batch', () => {
  it('retains ordinary group lifetime while sharing one capture across misses and hits', () => {
    const clock=vi.spyOn(performance,'now').mockReturnValue(0);
    try {
      const s=setup();s.gl.isContextLost=()=>false;
      s.service.prepare({width:16,height:16,slots:2},s.resources);
      const before=s.snapshot(), query=vi.spyOn(s.gl,'getParameter');let late:(()=>void)|undefined;
      runBrushGlBatch({participants:[s.service]},frame=>{
        const count=query.mock.calls.length;
        const group=s.service.resolveGroup([s.request],frame);late=group.release;
        expect(()=>s.service.resolveGroup([s.request],frame)).toThrow('previous');
        group.release();
        const hit=s.service.resolveGroup([s.request],frame);hit.release();
        const changed={...s.request,owner:{}};
        // Intentionally omit release: coordinator finally closes the final group.
        s.service.resolveGroup([changed],frame);
        expect(query.mock.calls.length).toBe(count);
        expect(()=>s.service.prepare({width:16,height:16,slots:2},s.resources)).toThrow('batch');
      });
      expect(s.gl.drawArrays).toHaveBeenCalledTimes(2);expect(s.snapshot()).toEqual(before);
      runBrushGlBatch({participants:[s.service]},frame=>{
        const group=s.service.resolveGroup([s.request],frame);late!();
        expect(()=>s.service.resolveGroup([s.request],frame)).toThrow('previous');group.release();
      });
      s.service.reset();
    }finally{clock.mockRestore();}
  });
});

it('shares one state capture for the real ordered prepass→composite services',()=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0);
  try {
    const s=setup();s.gl.isContextLost=()=>false;s.gl.STATIC_DRAW=9001;s.gl.TEXTURE1=s.gl.TEXTURE0+1;
    s.gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;s.gl.copyTexSubImage2D=vi.fn();s.gl.uniform3f=vi.fn();s.gl.uniform4f=vi.fn();
    const originalAttrib=s.gl.getAttribLocation;s.gl.getAttribLocation=(program:unknown,name:string)=>name==='position'?0:originalAttrib(program,name);
    s.gl.getTexParameter=(_:number,p:number)=>p===s.gl.TEXTURE_MIN_FILTER||p===s.gl.TEXTURE_MAG_FILTER?s.gl.NEAREST:s.gl.CLAMP_TO_EDGE;
    s.service.prepare({width:16,height:16,slots:2},s.resources);
    const pass=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'joined');
    pass.prepare({width:16,height:16},[...s.resources,...s.service.preparedResources()],s.cpu.reservedBytes);
    const release=vi.fn(),lifetime={kind:'external' as const,owner:{},lease:()=>release};
    const target={brand:'canonical-straight-rgba8-v1' as const,texture:s.gl.createTexture(),framebuffer:s.gl.createFramebuffer(),width:32,height:32,originX:-100,originY:40,lifetime};
    s.gl.getFramebufferAttachmentParameter=()=>target.texture;
    const before=s.snapshot(),query=vi.spyOn(s.gl,'getParameter'),attrib=vi.spyOn(s.gl,'getVertexAttrib'),sampler=vi.spyOn(s.gl,'getTexParameter');
    runBrushGlBatch({participants:[s.service,pass],owners:[lifetime]},frame=>{
      const count=query.mock.calls.length;
      for(let i=0;i<2;i++){
        const group=s.service.resolveGroup([s.request],frame);
        try{pass.drawSource({source:{kind:'maskRgb',view:group.views[0],rgb:[20,40,60]},target,operation:{kind:'alphaDarken32',control:{profile:'optimized32-scalar-f32-rne-v1',variant:'creamy',opacity:.8,averageOpacity:.8,flow:1}}},frame)}finally{group.release()}
      }
      expect(query.mock.calls.length).toBe(count);
    });
    expect(s.snapshot()).toEqual(before);expect(s.gl.drawArrays).toHaveBeenCalledTimes(3);
    // Four unique attribs, once each, with the ANGLE divisor query.
    expect(attrib).toHaveBeenCalledTimes(28);expect(release).toHaveBeenCalledOnce();expect(sampler).not.toHaveBeenCalled();
    pass.reset();s.service.reset();
  }finally{clock.mockRestore()}
});

describe('canonical default-auto incremental slot generation', () => {
  function autoRequest(owner = {}): AutoTestRequest<CanonicalDefaultAutoRecipe,CanonicalDefaultAutoSource> {
    const source = { kind: 'defaultAuto' as const, generator: 'default' as const, shape: 'circle' as const,
      diameter: 7, ratio: .5, horizontalFade: .7, verticalFade: .9, antialias: true, spikes: 2, randomness: 0, density: 1 };
    const trustedSource = { kind: 'defaultAuto' as const, descriptorId: 'test-auto', descriptorVersion: 1,
      descriptorSha256: 'a'.repeat(64), source, brushScale: 1, brushAngle: -.37, coverageProfile: 'neon64-f32-fma-v1' as const };
    const raw = { dialect: 'krita-default-auto-qt5-arm64-v1' as const,
      tip: { ...source, kind: 'auto' as const, softness: 1 as const, spikes: 2 as const, randomness: 0 as const, density: 1 as const }, storedScale: 1, storedAngle: -.37,
      shape: { scale: .7, ratio: 1, rotation: .19 }, subpixelX: .25, subpixelY: .5,
      coverageProfile: trustedSource.coverageProfile, maxPixels: 1048576, maxWorkSamples: 16*1048576 };
    const geometry = prepareSourceDefaultAutoDab(raw).geometry;
    const [width,height] = geometry.maskSize;
    return { owner, role: 'primary', material: { kind: 'canonicalAuto', trustedSource,
      recipe: {kind:'defaultAuto', source, coverageProfile:trustedSource.coverageProfile, brushScale:1,brushAngle:-.37,
        scale:.7,ratio:1,rotation:.19,subX:.25,subY:.5,width,height,mirrorH:false,mirrorV:false}},
      rect:{x:-9,y:17,width,height},profile:'neon4-summed-wordsize64' };
  }
  it('defers only final CPU output without GL/readiness and retains its same charged owner',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);const baseline=s.cpu.reservedBytes
    try{
      s.service.beginAutoGeneration(r);s.gl.texSubImage2D.mockClear();const query=vi.spyOn(s.gl,'getParameter');query.mockClear()
      const result=s.service.advanceAutoGeneration(65536,{deferFinalUpload:true})
      expect(result).toMatchObject({done:false,uploadedBytes:0,finalUploadPending:true})
      expect(s.gl.texSubImage2D).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBeGreaterThan(baseline)
      expect(s.service.finalAutoUploadPending(r)).toBe(true);expect(()=>s.service.resolveGroup([r])).toThrow('incomplete')
      expect(s.service.advanceAutoGeneration(64,{deferFinalUpload:true})).toMatchObject({done:false,consumed:0,uploadedBytes:0,finalUploadPending:true})
      s.service.cancelAutoGeneration();expect(s.cpu.reservedBytes).toBe(baseline)
    }finally{s.service.reset()}
  })
  it('flushes final output through one opted full snapshot with no five-query recapture',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[])
    try{
      const query=vi.spyOn(s.gl,'getParameter');query.mockClear();runBrushGlTurn({participants:[s.service]},()=>{});const full=query.mock.calls.length
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true});query.mockClear();s.gl.texSubImage2D.mockClear()
      const before=s.snapshot();query.mockClear()
      runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>{
        s.service.flushFinalAutoGeneration(r,turn)
        runBrushGlBatch({turn,participants:[s.service]},()=>{})
      })
      expect(query.mock.calls).toHaveLength(full+2);expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
      expect(s.service.beginAutoGeneration(r)).toBe(true);expect(s.snapshot()).toEqual(before)
      expect(s.gl.getParameter(s.gl.UNPACK_FLIP_Y_WEBGL)).toBe(true);expect(s.gl.getParameter(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(true)
    }finally{s.service.reset()}
  })
  it('rejects forged final-upload turn before lease or publication without cancelling its accepted owner',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[])
    try{
      expect(typeof s.service.flushFinalAutoGeneration).toBe('function')
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true})
      const lease=vi.spyOn(s.cache,'lease'),query=vi.spyOn(s.gl,'getParameter');lease.mockClear();query.mockClear();s.gl.texSubImage2D.mockClear()
      expect(()=>s.service.flushFinalAutoGeneration(r,{} as BrushGlTurn)).toThrow()
      expect(lease).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(s.gl.texSubImage2D).not.toHaveBeenCalled()
      expect(s.service.finalAutoUploadPending(r)).toBe(true)
      runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>s.service.flushFinalAutoGeneration(r,turn))
      expect(s.service.beginAutoGeneration(r)).toBe(true)
    }finally{s.service.reset()}
  })
  it('can explicitly complete deferred final output through the unchanged standalone result shape',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[])
    try{
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true})
      const query=vi.spyOn(s.gl,'getParameter');query.mockClear()
      const result=s.service.advanceAutoGeneration(1)
      expect(Object.keys(result).sort()).toEqual(['consumed','done','uploadedBytes']);expect(result).toMatchObject({done:true,consumed:0})
      expect(query.mock.calls).toHaveLength(5);expect(s.service.beginAutoGeneration(r)).toBe(true)
    }finally{s.service.reset()}
  })
  it.each(['owner','revision'] as const)('does not let a foreign %s cancel or flush the accepted final stripe',kind=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[])
    try{
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true})
      const wrong=kind==='owner'?{...r,owner:{}}:{...r,material:{...r.material,recipe:{...r.material.recipe,subX:r.material.recipe.subX+.125}}}
      const lease=vi.spyOn(s.cache,'lease');lease.mockClear();s.gl.texSubImage2D.mockClear()
      runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>expect(()=>s.service.flushFinalAutoGeneration(wrong,turn)).toThrow())
      expect(lease).not.toHaveBeenCalled();expect(s.gl.texSubImage2D).not.toHaveBeenCalled();expect(s.service.finalAutoUploadPending(r)).toBe(true)
      runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>s.service.flushFinalAutoGeneration(r,turn))
    }finally{s.service.reset()}
  })
  it('retires stale final residency without upload or a replacement readiness grant',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);const baseline=s.cpu.reservedBytes
    try{
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true});s.gl.texSubImage2D.mockClear()
      s.cache.discard(s.service['pendingAuto']!.slot.key)
      expect(()=>s.service.finalAutoUploadPending(r)).toThrow('residency');expect(s.gl.texSubImage2D).not.toHaveBeenCalled()
      expect(s.cpu.reservedBytes).toBe(baseline);expect(s.service['pendingAuto']).toBeUndefined()
    }finally{s.service.reset()}
  })
  it('does not publish readiness when the final release callback invalidates its workspace',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[])
    try{
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true})
      const pending=s.service['pendingAuto']!,slot=pending.slot,release=pending.release
      Object.defineProperty(pending,'release',{value:()=>{release();s.service['workspace']=undefined}})
      expect(()=>runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>s.service.flushFinalAutoGeneration(r,turn))).toThrow('residency changed')
      expect(slot.revision).toBeUndefined();expect(s.service['pendingAuto']).toBeUndefined();expect(s.cache['leases'].size).toBe(0)
    }finally{s.service.reset()}
  })
  it.each(['upload','restore','cache-release','cpu-release'] as const)('retires a failed owned final %s before publishing readiness and preserves its first exact error',fault=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);const baseline=s.cpu.reservedBytes,primary=new Error(fault)
    try{
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true});const pending=s.service['pendingAuto']!,slot=pending.slot,before=s.snapshot()
      if(fault==='upload')s.gl.texSubImage2D.mockImplementationOnce(()=>{throw primary})
      if(fault==='restore'){
        const store=s.gl.pixelStorei;let once=false;s.gl.pixelStorei=(key:number,value:number|boolean)=>{if(!once&&key===s.gl.UNPACK_FLIP_Y_WEBGL&&value===true){once=true;throw primary}store(key,value)}
      }
      if(fault==='cache-release'){
        const lease=s.cache.lease.bind(s.cache);vi.spyOn(s.cache,'lease').mockImplementation(resources=>{const release=lease(resources);return()=>{release();throw primary}})
      }
      if(fault==='cpu-release'){
        const release=pending.release;Object.defineProperty(pending,'release',{value:()=>{release();throw primary}})
      }
      let received:unknown;try{runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>s.service.flushFinalAutoGeneration(r,turn))}catch(error){received=error}
      expect(received).toBe(primary);expect(slot.revision).toBeUndefined();expect(s.service['pendingAuto']).toBeUndefined()
      expect(s.cache['leases'].size).toBe(0);expect(s.cpu.reservedBytes).toBe(baseline);expect(s.snapshot()).toEqual(before)
      expect(s.gl.getParameter(s.gl.UNPACK_FLIP_Y_WEBGL)).toBe(true);expect(s.gl.getParameter(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(true)
    }finally{s.service.reset()}
  })
  it('rejects nested upload/cancel/reset while final GPU output is synchronous',()=>{
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[])
    try{
      s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(65536,{deferFinalUpload:true})
      s.gl.texSubImage2D.mockImplementationOnce(()=>{expect(()=>s.service.advanceAutoGeneration(1)).toThrow('active');expect(()=>s.service.cancelAutoGeneration()).toThrow('inside');expect(()=>s.service.reset()).toThrow('inside')})
      runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>s.service.flushFinalAutoGeneration(r,turn));expect(s.service.beginAutoGeneration(r)).toBe(true)
    }finally{s.service.reset()}
  })
  it('generates partial samples outside batches, publishes once and reuses at new placement/mirror', () => {
    const s=setup(), request=autoRequest();
    s.service.prepare({width:16,height:16,slots:1},[]);
    const baseline=s.cpu.reservedBytes, before=s.snapshot();
    expect(s.service.beginAutoGeneration(request)).toBe(false);
    expect(s.cpu.reservedBytes).toBeGreaterThan(baseline);
    expect(()=>s.service.resolveGroup([request])).toThrow('incomplete');
    const uploads=s.gl.texSubImage2D.mock.calls.length;
    let done=false,total=0;
    while(!done){const step=s.service.advanceAutoGeneration(17);done=step.done;total+=step.consumed;expect(step.consumed).toBeLessThanOrEqual(17)}
    expect(total).toBe(request.rect.width*request.rect.height*9);
    expect(s.cpu.reservedBytes).toBe(baseline);
    expect(s.gl.texSubImage2D.mock.calls.length).toBeGreaterThan(uploads);
    expect(s.snapshot()).toEqual(before);
    const first=s.service.resolveGroup([request]);first.release();
    const moved={...request,rect:{...request.rect,x:456},material:{...request.material,recipe:{...request.material.recipe,mirrorH:true}}};
    const uploadCount=s.gl.texSubImage2D.mock.calls.length;
    expect(s.service.beginAutoGeneration(moved)).toBe(true);
    const hit=s.service.resolveGroup([moved]);hit.release();
    expect(hit.views[0].texture).toBe(first.views[0].texture);
    expect(hit.views[0].mirror.horizontal).toBe(true);
    expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(uploadCount);
    s.service.reset();expect(s.cpu.reservedBytes).toBe(0);
  });
  it('captures only the five upload states, preserving all other GL state without framebuffer/vertex/program queries', () => {
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);
    s.service.beginAutoGeneration(r);
    const before=s.snapshot(), getters=vi.spyOn(s.gl,'getParameter');
    getters.mockClear();
    expect(s.service.advanceAutoGeneration(65536).done).toBe(true);
    expect(getters.mock.calls.map(([p])=>p)).toEqual([s.gl.ACTIVE_TEXTURE,s.gl.UNPACK_ALIGNMENT,
      s.gl.UNPACK_FLIP_Y_WEBGL,s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,s.gl.TEXTURE_BINDING_2D]);
    expect(s.snapshot()).toEqual(before);
    expect(s.gl.getParameter(s.gl.UNPACK_FLIP_Y_WEBGL)).toBe(true);
    expect(s.gl.getParameter(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(true);
    s.service.reset();
  });
  it('restores active unit after a capture fault and all borrowed upload states after setter/upload faults', () => {
    for(const fault of ['unpack-get','binding-get','bind','unpack-set','upload'] as const){
      const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);
      const baseline=s.cpu.reservedBytes,before=s.snapshot();s.service.beginAutoGeneration(r);
      if(fault==='unpack-get'||fault==='binding-get'){
        const original=s.gl.getParameter;let thrown=false;
        s.gl.getParameter=(key:number)=>{
          if(!thrown&&key===(fault==='binding-get'?s.gl.TEXTURE_BINDING_2D:s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)){
            thrown=true;throw Error('capture failure');
          }
          return original(key);
        };
      }else if(fault==='bind')vi.spyOn(s.gl,'bindTexture').mockImplementationOnce(()=>{throw Error('bind failure')});
      else if(fault==='unpack-set')vi.spyOn(s.gl,'pixelStorei').mockImplementationOnce(()=>{throw Error('unpack failure')});
      else s.gl.texSubImage2D.mockImplementationOnce(()=>{throw Error('upload failure')});
      expect(()=>s.service.advanceAutoGeneration(65536)).toThrow('failure');
      expect(s.snapshot(),fault).toEqual(before);
      expect(s.gl.getParameter(s.gl.UNPACK_FLIP_Y_WEBGL)).toBe(true);
      expect(s.gl.getParameter(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(true);
      expect(s.cpu.reservedBytes).toBe(baseline);
      expect(s.cache['leases'].size).toBe(0);
      expect(()=>s.service.resolveGroup([r])).toThrow('complete');
      s.service.reset();expect(s.cpu.reservedBytes).toBe(0);
    }
  });
  it('keeps the primary upload error and attempts flags/active restoration after a cleanup setter throws', () => {
    for(const fault of ['restore-bind','restore-alignment'] as const){
      const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);
      const baseline=s.cpu.reservedBytes, before=s.snapshot(), primary=new Error('primary upload'), secondary=new Error('secondary restore');
      s.service.beginAutoGeneration(r);
      if(fault==='restore-bind'){
        const bind=s.gl.bindTexture;let calls=0;
        s.gl.bindTexture=vi.fn((target:number,texture:WebGLTexture|null)=>{if(++calls===2)throw secondary;bind(target,texture)});
      }else{
        const store=s.gl.pixelStorei;let thrown=false;
        s.gl.pixelStorei=vi.fn((key:number,value:number|boolean)=>{
          if(!thrown&&key===s.gl.UNPACK_ALIGNMENT&&value===before.unpack){thrown=true;throw secondary}
          store(key,value);
        });
      }
      s.gl.texSubImage2D.mockImplementationOnce(()=>{throw primary});
      let received:unknown;try{s.service.advanceAutoGeneration(65536)}catch(error){received=error}
      expect(received).toBe(primary);
      expect(s.snapshot().active).toBe(before.active);
      expect(s.gl.getParameter(s.gl.UNPACK_FLIP_Y_WEBGL)).toBe(true);
      expect(s.gl.getParameter(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(true);
      expect(s.cpu.reservedBytes).toBe(baseline);expect(s.cache['leases'].size).toBe(0);
      expect(()=>s.service.resolveGroup([r])).toThrow('complete');s.service.reset();
    }
  });
  it('cancels incomplete generation on owner/reset/eviction and never exposes partial pixels', () => {
    for(const mode of ['owner','reset','evict'] as const){
      const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);
      const baseline=s.cpu.reservedBytes;s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(1);
      if(mode==='owner')s.service.releaseOwner(r.owner);
      else if(mode==='reset')s.service.reset(true);
      else {const entry=s.service.preparedResources()[1];s.cache.discard(entry.key);expect(()=>s.service.advanceAutoGeneration(1)).toThrow('residency')}
      expect(s.cpu.reservedBytes).toBe(mode==='reset'?0:baseline);
      expect(()=>s.service.resolveGroup([r])).toThrow();
      s.service.reset();expect(s.cpu.reservedBytes).toBe(0);
    }
  });
  it('rejects forged source and CPU budget before upload, and releases after upload failure', () => {
    const s=setup(),r=autoRequest();s.service.prepare({width:16,height:16,slots:1},[]);
    const before=s.cpu.reservedBytes,uploads=s.gl.texSubImage2D.mock.calls.length;
    const exhaust=s.cpu.reserve(s.cpu.budgetBytes-before);
    expect(()=>s.service.beginAutoGeneration(r)).toThrow('budget');
    expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(uploads);exhaust();
    const forged:typeof r={...r,material:{...r.material,recipe:structuredClone(r.material.recipe)}};Object.assign(forged.material.recipe.source,{diameter:8});
    expect(forged.material.recipe.source).not.toBe(forged.material.trustedSource.source);
    expect(()=>s.service.beginAutoGeneration(forged)).toThrow('source static mismatch');
    expect(s.cpu.reservedBytes).toBe(before);expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(uploads);
    s.service.beginAutoGeneration(r);s.gl.texSubImage2D.mockImplementationOnce(()=>{throw Error('upload failure')});
    expect(()=>{while(true)s.service.advanceAutoGeneration(64)}).toThrow('upload failure');
    expect(s.cpu.reservedBytes).toBe(before);expect(()=>s.service.resolveGroup([r])).toThrow('complete');
    s.service.reset();
  });
});


describe('Gaussian in the same incremental prepass slot and cache',()=>{
  function requestFor(recipe:CanonicalGaussianAutoRecipe,trustedSource:CanonicalGaussianAutoSource,owner:object={}):AutoTestRequest<CanonicalGaussianAutoRecipe,CanonicalGaussianAutoSource> {
    return {owner,role:'primary',material:{kind:'canonicalAuto',recipe,trustedSource},rect:{x:-9,y:17,width:recipe.width,height:recipe.height},profile:'neon4-summed-wordsize64'}
  }
  function capture(s:ReturnType<typeof setup>,width:number,height:number) {
    const pixels=new Uint8Array(width*height)
    s.gl.texSubImage2D.mockImplementation((...args:unknown[])=>{
      const y=args[3] as number,w=args[4] as number,h=args[5] as number,bytes=args[8] as Uint8Array
      expect(w).toBe(width)
      for(let i=0;i<w*h;i++) {
        const b=bytes[i*4];if(bytes[i*4+1]!==b||bytes[i*4+2]!==b||bytes[i*4+3]!==b)throw Error('A8 replication differs');pixels[y*width+i]=b
      }
    })
    return pixels
  }
  function drain(s:ReturnType<typeof setup>,r:import('./TransformedMaskPrepass').CanonicalAutoMaskRequest) {
    if(s.service.beginAutoGeneration(r))return true
    let done=false
    while(!done){const step=s.service.advanceAutoGeneration(64);expect(step.consumed).toBeLessThanOrEqual(64);done=step.done}
    return false
  }
  it('uploads all104 original whole-Gaussian masks byte-exact through the same64sample cursor and RGBA stripe layout',()=>{
    const s=setup();s.cache.clear();const owner={}
    const maxWidth=Math.max(...gaussianNative.cases.map(c=>c.width)),maxHeight=Math.max(...gaussianNative.cases.map(c=>c.height))
    s.service.prepare({width:maxWidth,height:maxHeight,slots:1},[])
    const baseline=s.cpu.reservedBytes;let total=0,lastRevision='',lastMask=new Uint8Array()
    try {for(const c of gaussianNative.cases) {
      const g=c.generator,source={kind:'gaussianAuto' as const,generator:'gauss' as const,shape:'circle' as const,diameter:+g.diameter,ratio:+g.ratio,
        horizontalFade:+g.hfade,verticalFade:+g.vfade,antialias:g.antialiasEdges!=='0',spikes:2,randomness:0,density:1}
      const profile=c.mode==='scalar-common'?'scalar-bionic-f64-fma-v1' as const:'neon64-f32-fma-v1' as const
      const pin:CanonicalGaussianAutoSource={kind:'gaussianAuto',descriptorId:'native-original-ABI-state',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source,brushScale:c.storedScale,brushAngle:c.storedAngle,coverageProfile:profile}
      const recipe:CanonicalGaussianAutoRecipe={kind:'gaussianAuto',source,coverageProfile:profile,brushScale:c.storedScale,brushAngle:c.storedAngle,
        ...c.shape,subX:c.subpixelX,subY:c.subpixelY,width:c.width,height:c.height,mirrorH:false,mirrorV:false}
      const r=requestFor(recipe,pin,owner),mask=capture(s,c.width,c.height),revision=canonicalAutoMaskRevision(r.material)
      const hit=drain(s,r)
      const expected=Uint8Array.from(Buffer.from(c.coverageBase64,'base64'))
      expect(hit).toBe(revision===lastRevision)
      expect(hit?lastMask:mask).toEqual(expected)
      const group=s.service.resolveGroup([r]);group.release()
      expect(s.cpu.reservedBytes).toBe(baseline)
      lastRevision=revision;lastMask=expected;total+=expected.length
    }}finally{s.service.reset()}
    expect(total).toBe(29098);expect(s.cpu.reservedBytes).toBe(0)
  })
  it('retains native eraser#2 source coverage but refuses the default painting fixture',()=>{
    expect(GAUSSIAN_DATA_STOCK).toContain(2)
    expect(()=>sourceGaussianCanonicalFixture(2,'neon64-f32-fma-v1',false)).toThrow(/outer composition/)
  })
  const streams=GAUSSIAN_DATA_STOCK.flatMap(index=>(['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const).map(profile=>[index,profile] as const))
  it.each(streams)('takes actual#%i %s data-only author→adapter→wire recipes without a paint grant or hot hit upload',(index,profile)=>{
    let draws=0
    {
      const fixture=sourceGaussianCanonicalFixture(index,profile,false,{dataOnly:true}),all=fixture.accepted.flatMap(a=>a.frame.definitions)
      const s=setup();s.cache.clear();s.service.prepare({width:Math.max(...all.map(d=>d.width)),height:Math.max(...all.map(d=>d.height)),slots:1},[])
      const owner={},baseline=s.cpu.reservedBytes
      try {for(const accepted of fixture.accepted)for(const draw of accepted.frame.draws) {
        const recipe=accepted.frame.definitions[draw.definition];if(recipe.kind!=='gaussianAuto')throw Error('Missing Gaussian recipe')
        const coverageProfile=recipe.coverageProfile;if(coverageProfile==='browser-number-coverage-v1')throw Error('Native fixture coverage required')
        const r={...requestFor(recipe,fixture.pin,owner),rect:{x:draw.x,y:draw.y,width:recipe.width,height:recipe.height}}
        const mask=capture(s,recipe.width,recipe.height),hit=drain(s,r)
        if(!hit) {
          const raw=sourceGaussianDab({dialect:'krita-gaussian-auto-qt5-arm64-v1',tip:{...recipe.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},
            storedScale:recipe.brushScale,storedAngle:recipe.brushAngle,shape:{scale:recipe.scale,ratio:recipe.ratio,rotation:recipe.rotation},subpixelX:recipe.subX,subpixelY:recipe.subY,
            coverageProfile,maxPixels:1048576,maxWorkSamples:16*1048576})
          expect(mask).toEqual(raw.mask)
        }
        const group=s.service.resolveGroup([r]);group.release()
        const uploads=s.gl.texSubImage2D.mock.calls.length,moved={...r,rect:{...r.rect,x:234},material:{...r.material,recipe:{...recipe,mirrorH:!recipe.mirrorH}}}
        expect(s.service.beginAutoGeneration(moved)).toBe(true)
        const copy=s.service.resolveGroup([moved]);copy.release()
        expect(copy.views[0].texture).toBe(group.views[0].texture)
        expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(uploads);expect(s.cpu.reservedBytes).toBe(baseline);draws++
      }}finally{s.service.reset()}
      expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)
    }
    expect(draws).toBeGreaterThan(0)
  })
  it('binds generator/profile in cache and trusted source, and cancels on owner release, reset/context loss or residency loss',()=>{
    const fixture=sourceGaussianCanonicalFixture(5,'neon64-f32-fma-v1',false),recipe=fixture.accepted.flatMap(a=>a.frame.definitions).find(d=>d.kind==='gaussianAuto')!
    if(recipe.kind!=='gaussianAuto')throw Error('Missing Gaussian')
    for(const mode of ['owner','reset','evict'] as const) {
      const s=setup();s.cache.clear();const r=requestFor(recipe,fixture.pin);s.service.prepare({width:64,height:64,slots:1},[])
      const baseline=s.cpu.reservedBytes;s.service.beginAutoGeneration(r);s.service.advanceAutoGeneration(1)
      if(mode==='owner')s.service.releaseOwner(r.owner)
      else if(mode==='reset')s.service.reset(true)
      else {s.cache.discard(s.service.preparedResources()[1].key);expect(()=>s.service.advanceAutoGeneration(1)).toThrow('residency')}
      expect(s.cpu.reservedBytes).toBe(mode==='reset'?0:baseline);expect(()=>s.service.resolveGroup([r])).toThrow();s.service.reset();expect(s.cpu.reservedBytes).toBe(0)
    }
    const s=setup();s.cache.clear();s.service.prepare({width:64,height:64,slots:1},[]);const r=requestFor(recipe,fixture.pin),before=s.snapshot()
    const invalid={...r,material:{...r.material,recipe:{...recipe,coverageProfile:'scalar-bionic-f64-fma-v1' as const}}}
    expect(()=>s.service.beginAutoGeneration(invalid)).toThrow('policy');expect(s.snapshot()).toEqual(before)
    const wrongGenerator={...r,material:{...r.material,recipe:{...recipe,source:{...recipe.source,generator:'default'}}}}
    expect(()=>s.service.beginAutoGeneration(wrongGenerator as never)).toThrow();expect(s.snapshot()).toEqual(before)
    drain(s,r);const initialUploads=s.gl.texSubImage2D.mock.calls.length
    const scalar={...r,material:{...r.material,recipe:{...recipe,coverageProfile:'scalar-bionic-f64-fma-v1' as const},trustedSource:{...fixture.pin,coverageProfile:'scalar-bionic-f64-fma-v1' as const}}}
    expect(s.service.beginAutoGeneration(scalar)).toBe(false)
    while(!s.service.advanceAutoGeneration(64).done){}
    expect(s.gl.texSubImage2D.mock.calls.length).toBeGreaterThan(initialUploads)
    const uploads=s.gl.texSubImage2D.mock.calls.length
    const source={...recipe.source,kind:'defaultAuto' as const,generator:'default' as const},defaultRequest={...r,material:{kind:'canonicalAuto' as const,
      recipe:{...recipe,kind:'defaultAuto' as const,source,coverageProfile:'neon64-f32-fma-v1' as const},trustedSource:{...fixture.pin,kind:'defaultAuto' as const,source,coverageProfile:'neon64-f32-fma-v1' as const}}}
    expect(s.service.beginAutoGeneration(defaultRequest)).toBe(false)
    while(!s.service.advanceAutoGeneration(64).done){}
    expect(s.gl.texSubImage2D.mock.calls.length).toBeGreaterThan(uploads)
    s.service.reset();expect(s.cpu.reservedBytes).toBe(0)
  })
})
