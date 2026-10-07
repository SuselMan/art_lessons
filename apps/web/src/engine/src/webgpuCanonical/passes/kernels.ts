/** Native canonical ports of WC_DIFFUSE_FRAG / WC_WATER_FRONT_FRAG.
 * Intermediate storage remains rgba8unorm: no fused or float physical model.
 * Field storage row0=world top. Paper/noise retain raw upload row ordering.
 */
export const CANONICAL_PASS_HEADER = `
struct PassUniforms {
  resolution: vec2f, paperOrigin: vec2f,
  paperTexSize: vec2f, paperScale: vec2f,
  coefficients: vec4f, // diffuse D/B/radius/knight OR front climb/floor/costMax/stride
  wet: vec4f, // front dryCost/foreignWet, unused, unused
}
@group(0) @binding(0) var input: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var paper: texture_2d<f32>;
@group(0) @binding(3) var foreignFilm: texture_2d<f32>;
@group(0) @binding(4) var noise: texture_2d<f32>;
@group(0) @binding(5) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(6) var<uniform> u: PassUniforms;
// Canonical GL uv with nearest/clamp semantics, converted to top-row storage.
fn fieldAt(t: texture_2d<f32>, uv: vec2f)->vec4f {
 let dims=vec2i(textureDimensions(t));
 let glq=clamp(vec2i(floor(uv*vec2f(dims))),vec2i(0),dims-vec2i(1));
 return textureLoad(t,vec2i(glq.x,dims.y-1-glq.y),0);
}
fn fieldLinear(t:texture_2d<f32>,uv:vec2f)->vec4f {
 let dims=vec2f(textureDimensions(t));let g=uv*dims-.5;let i=floor(g);let f=fract(g);
 let a=fieldAt(t,(i+.5)/dims);let b=fieldAt(t,(i+vec2f(1,0)+.5)/dims);let c=fieldAt(t,(i+vec2f(0,1)+.5)/dims);let d=fieldAt(t,(i+vec2f(1,1)+.5)/dims);
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
fn repeatAt(q:vec2i,dims:vec2i)->vec2i { return ((q%dims)+dims)%dims; }
fn paperAt(uv:vec2f)->vec4f {
 let dims=vec2i(textureDimensions(paper));let g=uv*vec2f(dims)-0.5;
 let base=vec2i(floor(g));let f=fract(g);
 let a=textureLoad(paper,repeatAt(base,dims),0);
 let b=textureLoad(paper,repeatAt(base+vec2i(1,0),dims),0);
 let c=textureLoad(paper,repeatAt(base+vec2i(0,1),dims),0);
 let d=textureLoad(paper,repeatAt(base+vec2i(1,1),dims),0);
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
fn heightAt(px:vec2f)->f32 { return paperAt((px+u.paperOrigin)/u.paperTexSize*u.paperScale).r; }
fn offset(k:i32, knight:bool)->vec2f {
 let king=array<vec2f,8>(vec2f(1,0),vec2f(-1,0),vec2f(0,1),vec2f(0,-1),vec2f(1,1),vec2f(-1,1),vec2f(1,-1),vec2f(-1,-1));
 let knights=array<vec2f,8>(vec2f(2,1),vec2f(-2,-1),vec2f(1,2),vec2f(-1,-2),vec2f(-1,2),vec2f(1,-2),vec2f(-2,1),vec2f(2,-1));
 if(knight){return knights[k];}return king[k];
}
fn waterAt(cov:vec4f)->f32 { if(cov.a<=0.002){return 0;}return clamp(cov.a,0,1); }
`;
export const CANONICAL_DIFFUSE_WGSL = CANONICAL_PASS_HEADER + `
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u) {
 let q=tid.xy;if(any(q>=vec2u(u.resolution))){return;}
 let px=vec2f(f32(q.x)+0.5,u.resolution.y-f32(q.y)-0.5);let uv=px/u.resolution;
 let ink=fieldAt(input,uv);let wi=waterAt(fieldAt(coverage,uv));let hi=heightAt(px);var out4=ink;
 if(wi>0) {
  for(var k=0;k<8;k++) {
   let o=offset(k,u.coefficients.w>=0.5)*u.coefficients.z;
   let uvj=uv+o/u.resolution;
   if(any(uvj<vec2f(0))||any(uvj>vec2f(1))){continue;}
   let inkj=fieldAt(input,uvj);let wj=waterAt(fieldAt(coverage,uvj));let gate=min(wi,wj);
   if(gate<=0){continue;}
   let dh=hi-heightAt(px+o);
   let give=gate*(u.coefficients.x+u.coefficients.y*max(dh,0));
   let take=gate*(u.coefficients.x+u.coefficients.y*max(-dh,0));
   out4-=give*ink;out4+=take*inkj;
  }
 }
 textureStore(output,vec2i(q),max(out4,vec4f(0)));
}
`;
export const CANONICAL_WATER_FRONT_WGSL = CANONICAL_PASS_HEADER + `
fn lattice(p:vec2f)->f32 {
 let wrapped=p-251.0*floor(p/251.0);
 return textureLoad(noise,vec2i(wrapped),0).r;
}
fn wcNoise(p:vec2f)->f32 {
 let i=floor(p);let f=fract(p);let interpolant=f*f*(3.0-2.0*f);
 let a=lattice(i);let b=lattice(i+vec2f(1,0));let c=lattice(i+vec2f(0,1));let d=lattice(i+vec2f(1,1));
 return mix(mix(a,b,interpolant.x),mix(c,d,interpolant.x),interpolant.y);
}
fn fbm(p:vec2f)->f32 { return 0.63*wcNoise(p)+0.37*wcNoise(p*2.7+vec2f(31.4,17.9)); }
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u) {
 let q=tid.xy;if(any(q>=vec2u(u.resolution))){return;}
 let px=vec2f(f32(q.x)+0.5,u.resolution.y-f32(q.y)-0.5);let uv=px/u.resolution;
 let source=fieldAt(input,uv);var best=source.r*u.coefficients.z;let hj=heightAt(px);
 let climb=u.coefficients.x*(1.0+4.0*smoothstep(0.5,0.64,fbm((px+u.paperOrigin)*0.025+vec2f(41,7))));
 for(var k=0;k<8;k++) {
  let o=offset(k,false);let stride=u.coefficients.w;let uvj=uv+o*stride/u.resolution;
  if(any(uvj<vec2f(0))||any(uvj>vec2f(1))){continue;}
  let ci=fieldAt(input,uvj).r;if(ci>=0.999){continue;}
  var len=1.41421356;if(k<4){len=1;}
  let relief=max(u.coefficients.y*stride,stride+climb*(hj-heightAt(px+o*stride)));
  let film=smoothstep(0.02,0.15,max(fieldAt(coverage,uv).a,u.wet.y*fieldLinear(foreignFilm,uv).r));
  let edge=len*relief*mix(u.wet.x,1.0,film);best=min(best,ci*u.coefficients.z+edge);
 }
 textureStore(output,vec2i(q),vec4f(min(best,u.coefficients.z)/u.coefficients.z,hj,source.b,1));
}
`;
