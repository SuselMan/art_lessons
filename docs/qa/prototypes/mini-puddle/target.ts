import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { createProgram } from '../../../../apps/web/src/engine/src/raster/utils'

export type PuddleMaterial = { p: AccumulationBuffer; c: AccumulationBuffer; coverage: AccumulationBuffer }
export type PuddleTargetOptions = {
  coarseSize?: number
  iterations?: number
  /** Engine paper height map. Omit for deterministic procedural relief. */
  paperTexture?: WebGLTexture
  /** World pixels per paper repeat. */
  paperScale?: number
  strength?: number
}

const VERT = `attribute vec2 a_position; varying vec2 v_uv;
void main(){v_uv=a_position*0.5+0.5;gl_Position=vec4(a_position,0.0,1.0);}`
const RESTRICT = `precision highp float; varying vec2 v_uv;
uniform sampler2D u_source;uniform vec2 u_size;uniform float u_ratio;
void main(){vec4 sum=vec4(0.0);for(int y=0;y<4;y++)for(int x=0;x<4;x++){
vec2 offset=(vec2(float(x),float(y))+0.5)/4.0-0.5;
sum+=texture2D(u_source,v_uv+offset*u_ratio/u_size);}
gl_FragColor=sum/16.0;}`
const SOLVE = `precision highp float; varying vec2 v_uv;
uniform sampler2D u_source,u_p,u_c,u_water,u_paper;
uniform vec2 u_texel;uniform float u_waterMode,u_expand,u_relief,u_strength,u_stride,u_paperRepeat;
vec2 cell(vec2 q){return (floor(q/u_texel)+0.5)*u_texel;}
float heightAt(vec2 q){
 if(u_relief>0.5)return texture2D(u_paper,q*u_paperRepeat).r;
 // World-anchored channels; never depend on epoch, stroke count or wall time.
 vec2 w=q/u_texel;
 return clamp(0.5+0.20*sin(w.x*.71+sin(w.y*.13)*2.0)+0.14*sin(w.y*1.13+w.x*.19),0.0,1.0);
}
vec2 axis(int k){if(k==0)return vec2(1.0,0.0);if(k==1)return vec2(-1.0,0.0);if(k==2)return vec2(0.0,1.0);return vec2(0.0,-1.0);}
bool outside(vec2 q){return min(min(q.x,q.y),min(1.0-q.x,1.0-q.y))<0.0;}
float limitChannel(float mass,float capacity,float raw){return mass<0.5||raw<=0.0?1.0:min(1.0,capacity/(mass*raw));}
float fraction(vec2 from,vec2 to){
 if(outside(from)||outside(to))return 0.0;
 float a=texture2D(u_water,from).a,b=texture2D(u_water,to).a;
 float gate=smoothstep(.025,.20,min(a,b));
 if(u_stride>1.0)gate*=smoothstep(.025,.20,texture2D(u_water,cell((from+to)*.5)).a);
 if(gate<=0.0)return 0.0;
 float p=texture2D(u_p,from).a,q=texture2D(u_p,to).a;
 // Concentration equalisation and capillary outflow into shallower water.
 // Downhill paper channels break the halo into fingers rather than a blur.
 float concentration=.12*max(p-q,0.0)/max(p,.00001);
 float capillary=.10*max(a-b,0.0);
 float channel=.06*max(heightAt(from)-heightAt(to),0.0);
 float raw=min(.22,u_strength*(concentration+capillary+channel))*gate;
 vec4 P=floor(texture2D(u_p,from)*255.0+.5),C=floor(texture2D(u_c,from)*255.0+.5);
 vec4 rp=floor((255.0-floor(texture2D(u_p,to)*255.0+.5))/4.0);
 vec4 rc=floor((255.0-floor(texture2D(u_c,to)*255.0+.5))/4.0);
 float lim=1.0;
 lim=min(lim,limitChannel(P.r,rp.r,raw));lim=min(lim,limitChannel(P.g,rp.g,raw));
 lim=min(lim,limitChannel(P.b,rp.b,raw));lim=min(lim,limitChannel(P.a,rp.a,raw));
 lim=min(lim,limitChannel(C.r,rc.r,raw));lim=min(lim,limitChannel(C.g,rc.g,raw));
 lim=min(lim,limitChannel(C.b,rc.b,raw));lim=min(lim,limitChannel(C.a,rc.a,raw));
 return raw*lim;
}
void main(){vec2 center=cell(v_uv);vec4 own=texture2D(u_source,center);
 if(u_waterMode>.5){
  float wet=own.a*.995;
  for(int k=0;k<4;k++){vec2 q=center+axis(k)*u_texel;
   if(!outside(q)){
    float climb=max(heightAt(center)-heightAt(q),0.0);
    float incoming=texture2D(u_water,q).a*max(.70,.97-.30*climb);
    wet=max(wet,incoming*u_expand);
   }
  }
  gl_FragColor=vec4(own.rgb,wet);return;
 }
 vec4 integerOwn=floor(own*255.0+.5),result=integerOwn;
 for(int k=0;k<4;k++){
  vec2 q=cell(center+axis(k)*u_texel*u_stride);
  result-=floor(integerOwn*fraction(center,q));
  result+=floor(floor(texture2D(u_source,q)*255.0+.5)*fraction(q,center));
 }
 gl_FragColor=result/255.0;
}`
const RECONSTRUCT = `precision highp float;varying vec2 v_uv;
uniform sampler2D u_base,u_low,u_initial;uniform vec2 u_coarse;
uniform float u_coverage;
vec4 point(sampler2D t,vec2 i){return texture2D(t,(clamp(i,vec2(0.0),u_coarse-1.0)+.5)/u_coarse);}
vec4 linearAt(sampler2D t){vec2 g=v_uv*u_coarse-.5,i=floor(g),f=fract(g);
return mix(mix(point(t,i),point(t,i+vec2(1.,0.)),f.x),mix(point(t,i+vec2(0.,1.)),point(t,i+vec2(1.,1.)),f.x),f.y);}
void main(){vec4 base=texture2D(u_base,v_uv),current=linearAt(u_low),initial=linearAt(u_initial);
 if(u_coverage>.5){gl_FragColor=vec4(base.rgb,max(base.a,current.a));return;}
 // Keep the original high-frequency brush and apply only material movement.
 gl_FragColor=clamp(base+current-initial,0.0,1.0);
}`

/** One replaceable whole-puddle solve. No history, timers, readback or engine owner. */
export function createPuddleTarget(gl: WebGLRenderingContext, size: number, options: PuddleTargetOptions = {}) {
  const coarse = Math.max(8, Math.min(size, Math.round(options.coarseSize ?? size / 4)))
  const total = Math.max(1, Math.floor(options.iterations ?? 32))
  const make = (n: number) => new AccumulationBuffer(gl, n, n, 'nearest')
  const base: PuddleMaterial = { p: make(size), c: make(size), coverage: make(size) }
  const output: PuddleMaterial = { p: make(size), c: make(size), coverage: make(size) }
  let pendingP = make(size), pendingC = make(size)
  let p = make(coarse), c = make(coarse), water = make(coarse)
  let nextP = make(coarse), nextC = make(coarse), nextWater = make(coarse)
  const initialP = make(coarse), initialC = make(coarse)
  const all = [...Object.values(base), ...Object.values(output), pendingP, pendingC, p, c, water, nextP, nextC, nextWater, initialP, initialC]
  const programs = [RESTRICT, SOLVE, RECONSTRUCT].map(source => createProgram(gl, VERT, source))
  const quad = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
  const state = { epoch: 0, iterations: 0, done: true }
  let active = false, destroyed = false, phase = 0
  const locations = programs.map(program => ({
    position: gl.getAttribLocation(program, 'a_position'),
    uniforms: new Map<string, WebGLUniformLocation | null>(),
  }))
  function draw(index: number, dst: AccumulationBuffer, textures: Record<string, WebGLTexture>, values: Record<string, number | readonly number[]>) {
    const program = programs[index], loc = locations[index]
    const uniform = (name: string) => {
      if (!loc.uniforms.has(name)) loc.uniforms.set(name, gl.getUniformLocation(program, name))
      return loc.uniforms.get(name)!
    }
    dst.beginReplaceDraw(); gl.disable(gl.SCISSOR_TEST); gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(loc.position)
    gl.vertexAttribPointer(loc.position, 2, gl.FLOAT, false, 0, 0)
    let unit = 0
    for (const [name, texture] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(uniform(name), unit++)
    }
    for (const [name, value] of Object.entries(values)) {
      if (typeof value === 'number') gl.uniform1f(uniform(name), value)
      else gl.uniform2f(uniform(name), value[0], value[1])
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6); dst.endDraw(); gl.activeTexture(gl.TEXTURE0)
  }
  function restrict(source: AccumulationBuffer, dst: AccumulationBuffer) {
    draw(0, dst, { u_source: source.texture }, { u_size: [size, size], u_ratio: size / coarse })
  }
  function reconstruct(dst: AccumulationBuffer, source: AccumulationBuffer, low: AccumulationBuffer, initial: AccumulationBuffer, coverage = false) {
    draw(2, dst, { u_base: source.texture, u_low: low.texture, u_initial: initial.texture }, { u_coarse: [coarse, coarse], u_coverage: coverage ? 1 : 0 })
  }
  return {
    state,
    reset(source: PuddleMaterial, epoch: number) {
      if (destroyed) throw new Error('Puddle target destroyed')
      if (Object.values(source).some(b => b.width !== size || b.height !== size)) throw new Error('Puddle target size mismatch')
      active = false; phase = 0; state.epoch = epoch; state.iterations = 0; state.done = false
      for (const key of ['p', 'c', 'coverage'] as const) { source[key].copyTo(base[key]); source[key].copyTo(output[key]) }
      restrict(base.p, p); restrict(base.c, c); restrict(base.coverage, water)
      p.copyTo(initialP); c.copyTo(initialC)
      active = true
    },
    step(maxPasses = 1) {
      if (!active || destroyed) return state
      const budget = Math.max(0, Math.floor(maxPasses))
      for (let pass = 0; pass < budget && active; pass++) {
        const i = state.iterations
        if (phase < 3) {
          const source = phase === 0 ? c : phase === 1 ? p : water
          const dst = phase === 0 ? nextC : phase === 1 ? nextP : nextWater
          draw(1, dst, { u_source: source.texture, u_p: p.texture, u_c: c.texture, u_water: water.texture, u_paper: options.paperTexture ?? initialP.texture }, {
            u_texel: [1 / coarse, 1 / coarse], u_waterMode: phase === 2 ? 1 : 0,
            u_expand: i < 12 ? 1 : 0, u_relief: options.paperTexture ? 1 : 0,
            u_strength: Math.max(0, Math.min(2, options.strength ?? 1.25)),
            u_stride: i < 24 && i % 3 === 1 ? 2 : 1,
            u_paperRepeat: size / (options.paperScale ?? 1024),
          })
          if (phase === 2) { [p, nextP] = [nextP, p]; [c, nextC] = [nextC, c]; [water, nextWater] = [nextWater, water] }
        } else if (phase === 3) reconstruct(pendingP, base.p, p, initialP)
        else if (phase === 4) reconstruct(pendingC, base.c, c, initialC)
        else reconstruct(output.coverage, base.coverage, water, water, true)
        phase++
        if (phase === 6) {
          // Publish P/C atomically: step(1) never exposes half a new pair.
          ;[output.p, pendingP] = [pendingP, output.p]
          ;[output.c, pendingC] = [pendingC, output.c]
          phase = 0; state.iterations++
          if (state.iterations >= total) { state.done = true; active = false }
        }
      }
      return state
    },
    buffers: () => output,
    cancel() { active = false; phase = 0; state.done = true },
    destroy() {
      if (destroyed) return
      active = false; destroyed = true; state.done = true
      gl.useProgram(null)
      for (const program of programs) gl.deleteProgram(program)
      gl.deleteBuffer(quad)
      for (const buffer of all) buffer.destroy()
    },
  }
}
