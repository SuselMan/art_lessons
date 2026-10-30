import { vi } from 'vitest';
/** Lifetime/state mock only. Actual pixels are independently GPU-probed. */
export function recordingGL() {
  let id = 0;
  const gl: any = {}, names = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'ARRAY_BUFFER', 'ARRAY_BUFFER_BINDING', 'STREAM_DRAW', 'TEXTURE_2D', 'TEXTURE0', 'ACTIVE_TEXTURE', 'TEXTURE_BINDING_2D', 'RGBA', 'UNSIGNED_BYTE', 'UNPACK_ALIGNMENT', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'NEAREST', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'CLAMP_TO_EDGE', 'FRAMEBUFFER', 'FRAMEBUFFER_BINDING', 'COLOR_ATTACHMENT0', 'FRAMEBUFFER_COMPLETE', 'MAX_TEXTURE_SIZE', 'HIGH_FLOAT', 'VIEWPORT', 'CURRENT_PROGRAM', 'COLOR_CLEAR_VALUE', 'COLOR_WRITEMASK', 'BLEND', 'SCISSOR_TEST', 'DITHER', 'CULL_FACE', 'DEPTH_TEST', 'STENCIL_TEST', 'COLOR_BUFFER_BIT', 'TRIANGLES', 'FLOAT', 'VERTEX_ATTRIB_ARRAY_ENABLED', 'VERTEX_ATTRIB_ARRAY_BUFFER_BINDING', 'VERTEX_ATTRIB_ARRAY_SIZE', 'VERTEX_ATTRIB_ARRAY_TYPE', 'VERTEX_ATTRIB_ARRAY_NORMALIZED', 'VERTEX_ATTRIB_ARRAY_STRIDE', 'VERTEX_ATTRIB_ARRAY_POINTER'];
  names.forEach((name, i) => { gl[name] = 1000 + i; });
  gl.NO_ERROR=0;gl.getError=vi.fn(()=>0);gl.isContextLost=()=>false;
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
