/// <reference types="@webgpu/types" />
import { WC_BRUSH_DRAG_BASELINE_FRAG } from '../raster/shaders'

/** Literal donor/receiver-capacity/Q8 port of WC_BRUSH_DRAG_BASELINE_FRAG.
 * Only the full-resolution flow-rectangle fixture is supported by this oracle;
 * the full product's compact bilinear flow rectangle needs a separate port. */
export const CANONICAL_BRUSH_WGSL = `
struct Pair { pigment:vec4u, color:vec4u }
struct Params { grid:vec4u, rate:vec4f }
@group(0) @binding(0) var<storage,read> before:array<Pair>;
@group(0) @binding(1) var<storage,read_write> after:array<Pair>;
@group(0) @binding(2) var<storage,read> flow:array<vec4u>;
@group(0) @binding(3) var<storage,read> water:array<vec4u>;
@group(0) @binding(4) var<uniform> p:Params;
fn valid(q:vec2i)->bool { return all(q>=vec2i(0)) && all(q<vec2i(p.grid.xy)); }
fn index(q:vec2i)->u32 { return u32(q.y)*p.grid.x+u32(q.x); }
fn raw(donorPos:vec2i,to:vec2i,direction:vec2f)->f32 {
 if(!valid(donorPos)||!valid(to)){return 0;}
 let f=vec4f(flow[index(donorPos)])/255.0;let ft=vec4f(flow[index(to)])/255.0;
 let wf=f32(water[index(donorPos)].a)/255.0;let wt=f32(water[index(to)].a)/255.0;
 let midpoint=vec2i(floor((vec2f(donorPos)+vec2f(to))*0.5+0.5));
 var contact=smoothstep(0.015,0.15,min(wf,wt));
 contact*=step(0.015,f32(water[index(midpoint)].a)/255.0);
 let donor=f32(before[index(donorPos)].pigment.a)/255.0;
 let neighbour=f32(before[index(to)].pigment.a)/255.0;
 let mixFraction=0.02*max(donor-neighbour,0.0)/max(donor,5e-5);
 let dose=min(f.b,ft.b);let clock=-log(max(1.0-clamp(dose,0.0,1.0),1.0/255.0));
 return (0.3535533905932738*p.rate.x*abs(dot(0.5*((f.rg*2.0-1.0)+(ft.rg*2.0-1.0)),direction))*clock+mixFraction*dose)*contact;
}
fn fraction(donorPos:vec2i,to:vec2i,direction:vec2f)->f32 {
 let amount=raw(donorPos,to,direction);if(amount<=0){return 0;}
 let donor=before[index(donorPos)];let receiver=before[index(to)];
 let roomP=(vec4u(255)-receiver.pigment)/4u;let roomC=(vec4u(255)-receiver.color)/4u;
 var limit=1.0;
 for(var k=0u;k<4u;k++) {
  if(donor.pigment[k]>0u){limit=min(limit,f32(roomP[k])/(f32(donor.pigment[k])*amount));}
  if(donor.color[k]>0u){limit=min(limit,f32(roomC[k])/(f32(donor.color[k])*amount));}
 }
 return amount*limit;
}
@compute @workgroup_size(8,8) fn brush(@builtin(global_invocation_id) tid:vec3u) {
 if(any(tid.xy>=p.grid.xy)){return;}
 let q=vec2i(tid.xy);let i=index(q);let own=before[i];var P=vec4i(own.pigment);var C=vec4i(own.color);
 if(p.grid.w==1u && (any(tid.xy<p.grid.xy/4u)||any(tid.xy>=p.grid.xy*3u/4u))){after[i]=own;return;}
 let dirs=array<vec2i,4>(vec2i(1,0),vec2i(-1,0),vec2i(0,1),vec2i(0,-1));
 for(var k=0u;k<4u;k++) {
  let dir=dirs[k];let other=q+dir*i32(p.grid.z);if(!valid(other)){continue;}
  let give=fraction(q,other,vec2f(dir));let take=fraction(other,q,-vec2f(dir));
  let donor=before[index(other)];
  P-=vec4i(floor(vec4f(own.pigment)*give));P+=vec4i(floor(vec4f(donor.pigment)*take));
  C-=vec4i(floor(vec4f(own.color)*give));C+=vec4i(floor(vec4f(donor.color)*take));
 }
 // RGBA8 render targets clamp after each production pulse. Calibrated
 // gain has a positive donor budget; arbitrary stress fixtures can saturate.
 after[i]=Pair(vec4u(clamp(P,vec4i(0),vec4i(255))),vec4u(clamp(C,vec4i(0),vec4i(255))));
}
`;
interface Fixture { name: string; size: number; step: number; pulses: number; zero?: boolean; partial?: boolean }
const FIXTURES: Fixture[] = [
  { name: 'zero', size: 16, step: 2, pulses: 1, zero: true },
  { name: 'capacity', size: 16, step: 2, pulses: 3 },
  { name: 'partial', size: 128, step: 2, pulses: 2, partial: true },
  { name: 'brush400', size: 512, step: 100, pulses: 1 },
]
function fixture(c: Fixture) {
  const n = c.size, pigment = new Uint8Array(n * n * 4), color = new Uint8Array(pigment.length), flow = new Uint8Array(pigment.length), water = new Uint8Array(pigment.length)
  let seed = 728
  for (let i = 0; i < pigment.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const alpha = seed >>> 24
    pigment.set([alpha >> 2, alpha >> 1, alpha, alpha], i); color.set([alpha, 255 - alpha, alpha >> 1, alpha], i)
    flow.set([128 + seed % 93, 128 - (seed >>> 8) % 71, c.zero ? 0 : 64 + seed % 191, 255], i)
    water.set([0, 0, 0, i / 4 % 7 ? 255 : 0], i)
  }
  return { pigment, color, flow, water }
}
function compare(a: Uint8Array, b: Uint8Array) {
  let changed = 0, max = 0
  for (let k = 0; k < a.length; k++) { const difference = Math.abs(a[k] - b[k]); if (difference) changed++; max = Math.max(max, difference) }
  return { changed, max }
}
function glBrush(c: Fixture, data: ReturnType<typeof fixture>): [Uint8Array, Uint8Array] {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = c.size
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false })
  if (!gl) throw new Error('WebGL1 oracle unavailable')
  const textures: WebGLTexture[] = [], shaders: WebGLShader[] = []
  const program = gl.createProgram()!, fbo = gl.createFramebuffer()!, vertices = gl.createBuffer()!
  try {
    for (const [kind, code] of [[gl.VERTEX_SHADER, 'attribute vec2 a_position; varying vec2 v_uv; void main(){gl_Position=vec4(a_position,0.,1.);v_uv=a_position*.5+.5;}'], [gl.FRAGMENT_SHADER, WC_BRUSH_DRAG_BASELINE_FRAG]] as const) {
      const shader = gl.createShader(kind)!; shaders.push(shader); gl.shaderSource(shader, code); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'WebGL compile failed')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL link failed')
    const texture = (bytes: Uint8Array, linear = false) => {
      const t = gl.createTexture()!; textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, c.size, c.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return t
    }
    const banks = [[texture(data.pigment), texture(data.color)], [texture(data.pigment), texture(data.color)]], flow = texture(data.flow, true), water = texture(data.water)
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    gl.uniform2f(uniform('u_step'), c.step / c.size, c.step / c.size); gl.uniform2f(uniform('u_texel'), 1 / c.size, 1 / c.size); gl.uniform4f(uniform('u_flowRect'), 0, 0, 1, 1); gl.uniform1f(uniform('u_contactGain'), 0.84)
    const bind = (name: string, unit: number, t: WebGLTexture) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(uniform(name), unit) }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, c.size, c.size); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST)
    if (c.partial) { gl.enable(gl.SCISSOR_TEST); gl.scissor(c.size / 4, c.size / 4, c.size / 2, c.size / 2) }
    let current = 0
    for (let pulse = 0; pulse < c.pulses; pulse++) {
      bind('u_flow', 1, flow); bind('u_water', 2, water); bind('u_pigment', 3, banks[current][0]); bind('u_color', 4, banks[current][1])
      for (const role of [1, 0]) { bind('u_paint', 0, banks[current][role]); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, banks[1 - current][role], 0); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('WebGL framebuffer incomplete'); gl.drawArrays(gl.TRIANGLES, 0, 6) }
      current = 1 - current
    }
    const result: [Uint8Array, Uint8Array] = [new Uint8Array(data.pigment.length), new Uint8Array(data.color.length)]
    for (const role of [0, 1]) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, banks[current][role], 0); gl.readPixels(0, 0, c.size, c.size, gl.RGBA, gl.UNSIGNED_BYTE, result[role]) }
    if (gl.getError() || gl.isContextLost()) throw new Error('WebGL oracle errored/lost context')
    return result
  } finally {
    for (const t of textures) gl.deleteTexture(t); for (const s of shaders) gl.deleteShader(s)
    gl.deleteProgram(program); gl.deleteFramebuffer(fbo); gl.deleteBuffer(vertices); gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
export async function checkCanonicalBrush(device: GPUDevice) {
  device.pushErrorScope('validation')
  const module = device.createShaderModule({ code: CANONICAL_BRUSH_WGSL, label: 'Canonical Q8 brush oracle' })
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'brush' } })
  const compilation = await device.popErrorScope()
  if (compilation) throw new Error(compilation.message)
  const rows = []
  for (const c of FIXTURES) {
    const data = fixture(c), resources: GPUBuffer[] = []
    const make = (size: number, usage: GPUBufferUsageFlags) => { const b = device.createBuffer({ size, usage }); resources.push(b); return b }
    try {
      const cells = c.size * c.size, bytes = cells * 32, packed = new Uint32Array(cells * 8)
      for (let i = 0; i < cells; i++) { packed.set(data.pigment.subarray(i * 4, i * 4 + 4), i * 8); packed.set(data.color.subarray(i * 4, i * 4 + 4), i * 8 + 4) }
      const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      const bank = [make(bytes, usage), make(bytes, usage)], flow = make(cells * 16, usage), water = make(cells * 16, usage), uniform = make(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
      const read = make(bytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ)
      for (const b of bank) device.queue.writeBuffer(b, 0, packed)
      device.queue.writeBuffer(flow, 0, Uint32Array.from(data.flow)); device.queue.writeBuffer(water, 0, Uint32Array.from(data.water))
      const params = new ArrayBuffer(32); new Uint32Array(params).set([c.size, c.size, c.step, c.partial ? 1 : 0]); new Float32Array(params).set([0.84, 0, 0, 0], 4); device.queue.writeBuffer(uniform, 0, params)
      let current = 0
      const encoder = device.createCommandEncoder()
      for (let pulse = 0; pulse < c.pulses; pulse++) {
        const bindings = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [bank[current], bank[1 - current], flow, water, uniform].map((b, binding) => ({ binding, resource: { buffer: b } })) })
        const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, bindings); pass.dispatchWorkgroups(Math.ceil(c.size / 8), Math.ceil(c.size / 8)); pass.end(); current = 1 - current
      }
      encoder.copyBufferToBuffer(bank[current], 0, read, 0, bytes); device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ)
      const output = new Uint32Array(read.getMappedRange()), actual: [Uint8Array, Uint8Array] = [new Uint8Array(cells * 4), new Uint8Array(cells * 4)]
      for (let i = 0; i < cells; i++) { actual[0].set(output.subarray(i * 8, i * 8 + 4), i * 4); actual[1].set(output.subarray(i * 8 + 4, i * 8 + 8), i * 4) }
      read.unmap()
      const expected = glBrush(c, data), comparison = actual.map((a, role) => compare(a, expected[role]))
      rows.push({ fixture: c, comparison, identity: actual.map((a, role) => compare(a, role === 0 ? data.pigment : data.color)) })
    } finally { for (const b of resources) b.destroy() }
  }
  return { pass: rows.every(row => row.comparison.every(c => c.changed === 0)) && rows[0].identity.every(c => c.changed === 0), rows, scope: 'Canonical Q8 brush only; full-resolution flow rectangle, fixed-step pulse boundaries. Float transcendental parity is measured, not assumed.' }
}
