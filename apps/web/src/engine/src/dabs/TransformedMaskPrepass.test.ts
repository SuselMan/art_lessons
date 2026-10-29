import { describe, expect, it, vi } from 'vitest';
import { BrushTextureCache } from './BrushTextureCache';
import { BrushMipCache } from './BrushMipCache';
import { TransformedMaskPrepass, type TransformedMaskRequest } from './TransformedMaskPrepass';
import { resolvedTransformedMaskPlan } from './TransformedMaskPlan';
import { sourcePngMaskExtent } from '../presets/sourcePngGeometry';
/** Lifetime/state mock only. Actual pixels are independently GPU-probed. */
function recordingGL() {
  let id = 0;
  const gl: any = {}, names = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'ARRAY_BUFFER', 'ARRAY_BUFFER_BINDING', 'STREAM_DRAW', 'TEXTURE_2D', 'TEXTURE0', 'ACTIVE_TEXTURE', 'TEXTURE_BINDING_2D', 'RGBA', 'UNSIGNED_BYTE', 'UNPACK_ALIGNMENT', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'NEAREST', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'CLAMP_TO_EDGE', 'FRAMEBUFFER', 'FRAMEBUFFER_BINDING', 'COLOR_ATTACHMENT0', 'FRAMEBUFFER_COMPLETE', 'MAX_TEXTURE_SIZE', 'HIGH_FLOAT', 'VIEWPORT', 'CURRENT_PROGRAM', 'COLOR_CLEAR_VALUE', 'COLOR_WRITEMASK', 'BLEND', 'SCISSOR_TEST', 'DITHER', 'CULL_FACE', 'DEPTH_TEST', 'STENCIL_TEST', 'COLOR_BUFFER_BIT', 'TRIANGLES', 'FLOAT', 'VERTEX_ATTRIB_ARRAY_ENABLED', 'VERTEX_ATTRIB_ARRAY_BUFFER_BINDING', 'VERTEX_ATTRIB_ARRAY_SIZE', 'VERTEX_ATTRIB_ARRAY_TYPE', 'VERTEX_ATTRIB_ARRAY_NORMALIZED', 'VERTEX_ATTRIB_ARRAY_STRIDE', 'VERTEX_ATTRIB_ARRAY_POINTER'];
  names.forEach((name, i) => { gl[name] = 1000 + i; });
  const object = () => ({ id: ++id, deleted: false });
  const divisors = new Map<number, number>([[0, 2], [1, 0], [2, 3], [3, 0]]);
  const extension = { VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: 8000, vertexAttribDivisorANGLE: (i: number, v: number) => { divisors.set(i, v); } };
  gl.getExtension = (name: string) => name === 'ANGLE_instanced_arrays' ? extension : null;
  const state = { active: gl.TEXTURE0 + 3, textures: new Map<number, any>(), framebuffer: object(), viewport: [9, 8, 7, 6], program: object(), buffer: object(), unpack: 8, clear: [.1, .2, .3, .4], mask: [false, true, false, true], caps: new Set<number>([gl.BLEND, gl.CULL_FACE]), attribs: new Map<number, any>() };
  for (let i = 0; i < 4; i++) {
    state.textures.set(gl.TEXTURE0 + i, object());
    state.attribs.set(i, { enabled: i % 2 === 0, buffer: object(), size: 3, type: gl.FLOAT, normalized: true, stride: 20, offset: 4 });
  }
  const snapshot = () => ({ active: state.active, textures: [...state.textures], framebuffer: state.framebuffer, viewport: [...state.viewport], program: state.program, buffer: state.buffer, unpack: state.unpack, clear: [...state.clear], mask: [...state.mask], caps: [...state.caps].sort(), divisors: [...divisors], attribs: [...state.attribs].map(([i, v]) => [i, { ...v }]) });
  gl.getParameter = (p: number) => p === gl.MAX_TEXTURE_SIZE ? 4096 : p === gl.ACTIVE_TEXTURE ? state.active : p === gl.TEXTURE_BINDING_2D ? state.textures.get(state.active) ?? null : p === gl.FRAMEBUFFER_BINDING ? state.framebuffer : p === gl.VIEWPORT ? [...state.viewport] : p === gl.CURRENT_PROGRAM ? state.program : p === gl.ARRAY_BUFFER_BINDING ? state.buffer : p === gl.UNPACK_ALIGNMENT ? state.unpack : p === gl.COLOR_CLEAR_VALUE ? [...state.clear] : p === gl.COLOR_WRITEMASK ? [...state.mask] : null;
  gl.getShaderPrecisionFormat = () => ({ precision: 23 });
  for (const kind of ['Texture', 'Framebuffer', 'Buffer', 'Program', 'Shader']) {
    gl['create' + kind] = vi.fn(object);
    gl['delete' + kind] = vi.fn((o: any) => { if (o)
      o.deleted = true; });
  }
  gl.isTexture = gl.isBuffer = (o: any) => !!o && !o.deleted;
  gl.activeTexture = (v: number) => { state.active = v; };
  gl.bindTexture = (_: number, t: any) => { state.textures.set(state.active, t); };
  gl.bindFramebuffer = (_: number, f: any) => { state.framebuffer = f; };
  gl.viewport = (...v: number[]) => { state.viewport = v; };
  gl.useProgram = (p: any) => { state.program = p; };
  gl.bindBuffer = (_: number, b: any) => { state.buffer = b; };
  gl.pixelStorei = (_: number, v: number) => { state.unpack = v; };
  gl.clearColor = (...v: number[]) => { state.clear = v; };
  gl.colorMask = (...v: boolean[]) => { state.mask = v; };
  gl.enable = (c: number) => state.caps.add(c);
  gl.disable = (c: number) => state.caps.delete(c);
  gl.isEnabled = (c: number) => state.caps.has(c);
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_COMPLETE;
  gl.getAttribLocation = (_: any, name: string) => ['a_position', 'a_origin', 'a_step', 'a_span'].indexOf(name);
  gl.getUniformLocation = (_: any, name: string) => ({ name });
  gl.enableVertexAttribArray = (i: number) => { state.attribs.get(i).enabled = true; };
  gl.disableVertexAttribArray = (i: number) => { state.attribs.get(i).enabled = false; };
  gl.vertexAttribPointer = (i: number, size: number, type: number, normalized: boolean, stride: number, offset: number) => { Object.assign(state.attribs.get(i), { buffer: state.buffer, size, type, normalized, stride, offset }); };
  gl.getVertexAttrib = (i: number, p: number) => { const a = state.attribs.get(i); return p === extension.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE ? divisors.get(i) : p === gl.VERTEX_ATTRIB_ARRAY_ENABLED ? a.enabled : p === gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING ? a.buffer : p === gl.VERTEX_ATTRIB_ARRAY_SIZE ? a.size : p === gl.VERTEX_ATTRIB_ARRAY_TYPE ? a.type : p === gl.VERTEX_ATTRIB_ARRAY_NORMALIZED ? a.normalized : a.stride; };
  gl.getVertexAttribOffset = (i: number) => state.attribs.get(i).offset;
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'texImage2D', 'texParameteri', 'framebufferTexture2D', 'bufferData', 'bufferSubData', 'uniform1i', 'uniform1f', 'uniform2f', 'drawArrays', 'clear'])
    gl[name] = vi.fn();
  return { gl, snapshot };
}
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

});
