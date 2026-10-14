import { DISPLAY_VERT, WC_RESAMPLE_FRAG } from './shaders'
import { createProgram, getUniforms } from './utils'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { WatercolorPassesContext } from './WatercolorPassTypes'

type Rect = [number, number, number, number]
export interface MaterialReconstruction {
  dst: AccumulationBuffer
  region: Rect
  source: AccumulationBuffer
  sourceOrigin: [number, number]
  ratio: number
  old: AccumulationBuffer
  base: AccumulationBuffer
  clamp: Rect
  fadeEdges: Rect
}
export interface PigmentReconstruction extends MaterialReconstruction {
  initialLow: AccumulationBuffer
  initialHigh: AccumulationBuffer
  preserveBrush: boolean
}
export interface ColorReconstruction extends MaterialReconstruction { mass: AccumulationBuffer }

// Versioned approximate material reconstruction. The old resample shader and
// all recorded pre-detail versions retain their original behaviour.
const oldResult = 'gl_FragColor = clamp(base + keep * (wcBilerp(u_src, q) - wcBilerp(u_old, q)), 0.0, 1.0);'
const oldEdge = 'float edge = min(min(q.x - u_clamp.x, u_clamp.z - q.x), min(q.y - u_clamp.y, u_clamp.w - q.y));'
const newEdge = 'float edge = min(min(mix(10000.0,q.x-u_clamp.x,u_fadeEdges.x),mix(10000.0,u_clamp.z-q.x,u_fadeEdges.z)),min(mix(10000.0,q.y-u_clamp.y,u_fadeEdges.y),mix(10000.0,u_clamp.w-q.y,u_fadeEdges.w)));'
function shader(uniforms: string, result: string): string {
  if (!WC_RESAMPLE_FRAG.includes(oldResult) || !WC_RESAMPLE_FRAG.includes(oldEdge)) throw new Error('Material reconstruction shader anchors changed')
  return WC_RESAMPLE_FRAG.replace('precision highp float;', `precision highp float; uniform vec4 u_fadeEdges; ${uniforms}`).replace(oldEdge, newEdge).replace(oldResult, result)
}

// P.b is pigment mass. Keep the original fine film only in an eroded
// moving-brush core; the coarse solution owns the spreading boundary.
const pigmentShader = shader('uniform sampler2D u_currentLo,u_currentHi; uniform float u_detail;', `vec4 n=wcBilerp(u_src,q),o=wcBilerp(u_old,q);vec4 result=base+keep*(n-o);
 if(u_detail>0.5){vec4 initial=wcBilerp(u_currentLo,q);float core=1.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 at=q+vec2(float(x),float(y));core=min(core,max(wcTexel(u_currentLo,at).b-wcTexel(u_old,at).b,0.0));}
 float strength=max(1.0-keep,smoothstep(1.0/255.0,8.0/255.0,core));
 vec4 film=initial-o;
 vec4 coarse=initial+keep*(n-initial);vec4 gain=clamp(coarse/max(initial,vec4(1.0/255.0)),0.0,4.0);gain=mix(vec4(1.0),gain,step(vec4(1.0/255.0),initial));vec4 original=texture2D(u_currentHi,gl_FragCoord.xy/u_baseSize);result=mix(base+film+keep*(n-initial),original*gain,strength);
 }gl_FragColor=clamp(result,0.0,1.0);`)

// C.rgb stores integrated optical density and C.a follows P.b. Reconstruct
// density per unit mass before attaching the final reconstructed mass.
const colorShader = shader('uniform sampler2D u_mass;', `vec4 n=wcBilerp(u_src,q),o=wcBilerp(u_old,q);
 vec3 baseTau=base.rgb/max(base.a,1.0/255.0),oldTau=o.rgb/max(o.a,1.0/255.0),newTau=n.rgb/max(n.a,1.0/255.0);
 float confidence=smoothstep(2.0/255.0,8.0/255.0,min(base.a,o.a));
 vec3 tau=mix(newTau,baseTau+newTau-oldTau,confidence);
 if(n.a<=0.5/255.0)tau=baseTau;
 tau=clamp(mix(baseTau,tau,keep),0.0,4.0);
 float mass=texture2D(u_mass,gl_FragCoord.xy/u_baseSize).b;
 gl_FragColor=vec4(clamp(tau*mass,0.0,1.0),mass);`)

type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number }
export class WatercolorMaterialReconstruction {
  private programs = new Map<'pigment' | 'color', Program>()
  private readonly ctx: WatercolorPassesContext
  constructor(ctx: WatercolorPassesContext) { this.ctx = ctx }

  pigment(request: PigmentReconstruction): void {
    this.draw('pigment', request, [['u_currentLo', request.initialLow], ['u_currentHi', request.initialHigh]], request.preserveBrush)
  }
  color(request: ColorReconstruction): void { this.draw('color', request, [['u_mass', request.mass]]) }

  private draw(kind: 'pigment' | 'color', r: MaterialReconstruction, extra: Array<[string, AccumulationBuffer]>, detail = false): void {
    const [dx, dy, dw, dh] = r.region
    if (dw <= 0 || dh <= 0) return
    const gl = this.ctx.gl()
    let cached = this.programs.get(kind)
    if (!cached) {
      const program = createProgram(gl, DISPLAY_VERT, kind === 'pigment' ? pigmentShader : colorShader)
      const names = ['u_src', 'u_old', 'u_base', 'u_srcSize', 'u_baseSize', 'u_dstOrigin', 'u_srcOrigin', 'u_ratio', 'u_mode', 'u_clamp', 'u_fadeEdges', 'u_detail', ...extra.map(([name]) => name)]
      cached = { program, uniforms: getUniforms(gl, program, names), position: gl.getAttribLocation(program, 'a_position') }
      this.programs.set(kind, cached)
    }
    r.dst.beginReplaceDraw()
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(dx, dy, dw, dh)
    gl.useProgram(cached.program)
    const u = cached.uniforms
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(cached.position)
    gl.vertexAttribPointer(cached.position, 2, gl.FLOAT, false, 0, 0)
    const inputs: Array<[string, AccumulationBuffer]> = [['u_src', r.source], ['u_old', r.old], ['u_base', r.base], ...extra]
    inputs.forEach(([name, buffer], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, buffer.texture)
      gl.uniform1i(u[name], unit)
    })
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(u.u_srcSize, r.source.width, r.source.height)
    gl.uniform2f(u.u_baseSize, r.base.width, r.base.height)
    gl.uniform2f(u.u_dstOrigin, dx, dy)
    gl.uniform2f(u.u_srcOrigin, ...r.sourceOrigin)
    gl.uniform1f(u.u_ratio, r.ratio)
    gl.uniform1f(u.u_mode, 1)
    gl.uniform4fv(u.u_clamp, r.clamp)
    gl.uniform4fv(u.u_fadeEdges, r.fadeEdges)
    if (kind === 'pigment') gl.uniform1f(u.u_detail, detail ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.SCISSOR_TEST)
    r.dst.endDraw()
  }

  dispose(): void {
    const gl = this.ctx.gl()
    for (const { program } of this.programs.values()) {
      if (gl.getParameter(gl.CURRENT_PROGRAM) === program) gl.useProgram(null)
      if (gl.isProgram?.(program) !== false) gl.deleteProgram(program)
    }
    this.programs.clear()
  }
}
