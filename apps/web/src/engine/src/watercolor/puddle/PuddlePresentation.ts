import { AccumulationBuffer } from '../../buffers/AccumulationBuffer'
import { createFullscreenQuad, createProgram, getUniforms } from '../../raster/utils'

/** Presentation time only. Never feeds canonical pigment, replay or simulation. */
export function presentationStep(dtMs: number, dry: boolean): { advance: number; travel: number } {
  const seconds = Math.min(100, Math.max(0, Number.isFinite(dtMs) ? dtMs : 0)) / 1000 * (dry ? 100 : 1)
  return { advance: 1 - Math.exp(-seconds / (120 / 7.6)), travel: 1 - Math.exp(-seconds / (120 / 24)) }
}

/** An input event supersedes the old target, without replacing the shown paint. */
export class PresentationEpoch {
  epoch = -Infinity
  progress = 0
  hasTarget = false
  accept(epoch: number): boolean {
    if (!Number.isFinite(epoch) || epoch < this.epoch) return false
    if (epoch > this.epoch) { this.epoch = epoch; this.progress = 0; this.hasTarget = false }
    return true
  }
  step(advance: number): void {
    if (this.hasTarget) this.progress += (1 - this.progress) * advance
  }
}

const VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main(){v_uv=a_position*0.5+0.5;gl_Position=vec4(a_position,0.0,1.0);}
`
const HEADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_current, u_target, u_extra;
  uniform vec2 u_texel;
`
const COPY = HEADER + `void main(){gl_FragColor=texture2D(u_current,v_uv);}`
const FEATURE = HEADER + `
  void main(){
    vec4 p=texture2D(u_current,v_uv+u_texel*vec2(-1.5,-1.5));
    p+=texture2D(u_current,v_uv+u_texel*vec2(1.5,-1.5));
    p+=texture2D(u_current,v_uv+u_texel*vec2(-1.5,1.5));
    p+=texture2D(u_current,v_uv+u_texel*vec2(1.5,1.5));
    gl_FragColor=p*0.25;
  }
`
const FLOW = HEADER + `
  // Search is in world pixels, independent of feature-map resolution.
  vec4 feature(sampler2D image,vec2 uv){return texture2D(image,clamp(uv,vec2(0.0),vec2(1.0)));}
  float errorAt(vec2 uv,vec2 shift,vec4 goal){
    vec4 p=feature(u_current,uv+shift*u_texel);
    vec4 d=p-goal;
    // Alpha locates the advancing wet boundary; premultiplied colour locates
    // interior bristle texture and two-colour mixing without unstable /alpha.
    return dot(d.rgb,d.rgb)+2.0*d.a*d.a+0.000003*dot(shift,shift);
  }
  void main(){
    vec4 goal=feature(u_target,v_uv);
    vec2 best=vec2(0.0);
    float cost=errorAt(v_uv,best,goal);
    for(int level=0;level<4;level++){
      float span=16.0*pow(0.5,float(level));
      vec2 center=best;
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
        vec2 candidate=center+vec2(float(x),float(y))*span;
        float score=errorAt(v_uv,candidate,goal);
        if(score<cost){cost=score;best=candidate;}
      }
    }
    // RGBA8 signed displacement, range +/-32 source pixels.
    gl_FragColor=vec4(0.5+best/64.0,0.0,1.0);
  }
`
const INPUT = HEADER + `
  uniform sampler2D u_after;
  void main(){
    vec4 shown=texture2D(u_current,v_uv), before=texture2D(u_extra,v_uv), after=texture2D(u_after,v_uv);
    if(max(max(abs(after.r-before.r),abs(after.g-before.g)),max(abs(after.b-before.b),abs(after.a-before.a)))<0.001){gl_FragColor=shown;return;}
    // Inferred change in optical transmittance over white. Apply the new
    // brush to SHOWN material, not a replacement with the accumulated source.
    vec3 oldT=vec3(1.0-before.a)+before.rgb;
    vec3 newT=vec3(1.0-after.a)+after.rgb;
    vec3 shownT=vec3(1.0-shown.a)+shown.rgb;
    vec3 ratio=clamp(newT/max(oldT,vec3(1.0/255.0)),vec3(0.0),vec3(8.0));
    vec3 trans=clamp(shownT*ratio,vec3(0.0),vec3(1.0));
    // A fully opaque black channel has no invertible optical ratio; retain
    // its signed source delta rather than trapping it at zero forever.
    vec3 fallback=vec3(1.0)-step(vec3(1.0/255.0),oldT);
    fallback=max(fallback,step(oldT*8.0,newT));
    trans=mix(trans,clamp(shownT+newT-oldT,vec3(0.0),vec3(1.0)),fallback);
    float alpha;
    if(before.a<0.995)alpha=1.0-(1.0-shown.a)*(1.0-after.a)/max(1.0-before.a,1.0/255.0);
    else alpha=shown.a+after.a-before.a;
    alpha=clamp(max(alpha,1.0-min(min(trans.r,trans.g),trans.b)),0.0,1.0);
    gl_FragColor=vec4(clamp(trans-vec3(1.0-alpha),vec3(0.0),vec3(alpha)),alpha);
  }
`
const MORPH = HEADER + `
  uniform sampler2D u_flow;
  uniform float u_advance, u_travel, u_progress;
  float grain(vec2 p){return fract(sin(dot(floor(p),vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec4 own=texture2D(u_current,v_uv), goal=texture2D(u_target,v_uv);
    vec4 water=texture2D(u_extra,v_uv);
    float wet=max(water.a,water.b);
    // Paint outside this wet wash is an immutable dry backing, not a flow source.
    if(wet<0.5/255.0){gl_FragColor=own;return;}
    vec2 move=(texture2D(u_flow,v_uv).rg-0.5)*64.0;
    // Encoded zero is 128/255, not exactly 0.5. Suppress subpixel bias.
    move*=step(vec2(0.3),abs(move));
    float mobile=smoothstep(0.005,0.12,max(wet,max(own.a,goal.a)));
    vec2 from=clamp(v_uv+move*u_texel*u_travel*mobile,vec2(0.0),vec2(1.0));
    vec4 carried=texture2D(u_current,from);
    // Spatial correspondence carries existing texture first. R2 removes the
    // independent 3px arrival cells; old controllers retain legacy arrival.
    #ifdef SMOOTH_ARRIVAL
    float residual=u_progress;
    #else
    float cell=grain(v_uv/u_texel/3.0);
    float arrival=smoothstep(cell*0.62,cell*0.62+0.26,u_progress+max(own.a,goal.a)*0.16);
    float residual=clamp(u_progress+(arrival-u_progress)*sin(3.14159265*u_progress)*0.35,0.0,1.0);
    #endif
    vec4 result=mix(carried,goal,residual);
    // No global final snap: only individual pixels already within one byte
    // may land exactly. Large mismatches continue travelling/correcting.
    vec4 difference=abs(result-goal);
    float tiny=max(max(difference.r,difference.g),max(difference.b,difference.a));
    if(u_progress>0.97&&tiny<1.5/255.0)result=goal;
    result.a=clamp(result.a,0.0,1.0);
    result.rgb=clamp(result.rgb,vec3(0.0),vec3(result.a));
    gl_FragColor=result;
  }
`

export function createPuddlePresentation(gl: WebGLRenderingContext, size: number | { width: number; height: number }, options: {smoothArrival?:boolean; bufferFactory?:(width:number,height:number,filter?:'linear'|'nearest')=>AccumulationBuffer} = {}) {
  const width = typeof size === 'number' ? size : size.width
  const height = typeof size === 'number' ? size : size.height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Invalid presentation size')
  const buffers:AccumulationBuffer[]=[]
  const programHandles:WebGLProgram[]=[]
  let allocatedQuad:WebGLBuffer|undefined
  try {
  const allocate=(w:number,h:number)=>{
    const buffer=options.bufferFactory?.(w,h,'linear') ?? new AccumulationBuffer(gl,w,h)
    buffers.push(buffer);return buffer
  }
  let current = allocate(width, height)
  let next = allocate(width, height)
  const target = allocate(width, height)
  const wet = allocate(width, height)
  const anchor = allocate(width, height)
  const fw = Math.min(128, width), fh = Math.min(128, height)
  const sourceFeature = allocate(fw, fh)
  const targetFeature = allocate(fw, fh)
  const flow = allocate(fw, fh)
  const quad = createFullscreenQuad(gl)
  allocatedQuad=quad
  const state = new PresentationEpoch()
  let destroyed = false
  const make = (frag: string) => {
    const program = createProgram(gl, VERT, frag)
    programHandles.push(program)
    return { program, position: gl.getAttribLocation(program, 'a_position'), uniforms: getUniforms(gl, program,
      ['u_current', 'u_target', 'u_extra', 'u_after', 'u_flow', 'u_texel', 'u_advance', 'u_travel', 'u_progress']) }
  }
  const copy = make(COPY), feature = make(FEATURE), match = make(FLOW), input = make(INPUT), morph = make((options.smoothArrival?'#define SMOOTH_ARRIVAL\n':'')+MORPH)
  const programs = [copy, feature, match, input, morph]
  type Program = typeof copy
  function validate(buffer: AccumulationBuffer) {
    if (destroyed) throw new Error('Presentation destroyed')
    if (buffer.gl !== gl || buffer.width !== width || buffer.height !== height) throw new Error('Presentation source must share context and size')
  }
  function draw(out: AccumulationBuffer, p: Program, textures: Record<string, AccumulationBuffer>, values: Record<string, number> = {}) {
    out.beginReplaceDraw()
    gl.disable(gl.SCISSOR_TEST)
    gl.colorMask(true, true, true, true)
    gl.useProgram(p.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.enableVertexAttribArray(p.position)
    gl.vertexAttribPointer(p.position, 2, gl.FLOAT, false, 0, 0)
    let unit = 0
    for (const [name, buffer] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, buffer.texture)
      gl.uniform1i(p.uniforms[name], unit++)
    }
    gl.uniform2f(p.uniforms.u_texel, 1 / width, 1 / height)
    for (const [name, value] of Object.entries(values)) gl.uniform1f(p.uniforms[name], value)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    out.endDraw()
    gl.activeTexture(gl.TEXTURE0)
  }
  function swap() { const old = current; current = next; next = old }
  for (const buffer of buffers) buffer.clear()
  return {
    get state() { return { epoch: state.epoch, progress: state.progress } },
    invalidate(epoch: number) {if(state.accept(epoch)){state.progress=0;state.hasTarget=false}},
    reset(rgba: AccumulationBuffer, epoch: number) {
      if (!state.accept(epoch)) return
      validate(rgba)
      draw(next, copy, { u_current: rgba }); swap()
      state.progress = 0; state.hasTarget = false
    },
    acceptInput(beforeRGBA: AccumulationBuffer, afterRGBA: AccumulationBuffer, epoch: number) {
      if (!state.accept(epoch)) return
      validate(beforeRGBA); validate(afterRGBA)
      draw(next, input, { u_current: current, u_extra: beforeRGBA, u_after: afterRGBA }); swap()
      // Even same-epoch inputs invalidate its target; wait for a fresh target.
      state.progress = 0; state.hasTarget = false
    },
    setTarget(rgba: AccumulationBuffer, wetCoverage: AccumulationBuffer, epoch: number, options: {preserveAnchor?:boolean} = {}) {
      if (!state.accept(epoch)) return
      validate(rgba); validate(wetCoverage)
      draw(target, copy, { u_current: rgba })
      draw(wet, copy, { u_current: wetCoverage })
      draw(targetFeature, feature, { u_current: target })
      if (!options.preserveAnchor) draw(anchor, copy, { u_current: current })
      draw(sourceFeature, feature, { u_current: anchor })
      draw(flow, match, { u_current: sourceFeature, u_target: targetFeature })
      state.hasTarget = true
    },
    tick(dtMs: number, options: { dry: boolean; progress?: number }): AccumulationBuffer {
      if (destroyed) throw new Error('Presentation destroyed')
      const weight = presentationStep(dtMs, options.dry)
      if (!state.hasTarget || weight.advance === 0) return current
      if (options.progress !== undefined) state.progress = Math.min(1, Math.max(0, options.progress))
      else state.step(weight.advance)
      draw(next, morph, { u_current: anchor, u_target: target, u_extra: wet, u_flow: flow },
        { u_advance: state.progress, u_travel: state.progress, u_progress: state.progress })
      swap()
      return current
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      gl.useProgram(null)
      for (const buffer of buffers) buffer.destroy()
      for (const p of programs) gl.deleteProgram(p.program)
      gl.deleteBuffer(quad)
    },
  }
  }catch(error){
    for(const buffer of buffers)buffer.destroy()
    if(programHandles.length)gl.useProgram(null)
    for(const program of programHandles)gl.deleteProgram(program)
    if(allocatedQuad)gl.deleteBuffer(allocatedQuad)
    throw error
  }
}
