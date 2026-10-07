/** Experimental float solver. Each unordered face uses the same donor shares
 * from both endpoints, preserving all four pigment channels before float rounding.
 * No readback, atomic races, or in-place neighbour reads. */
export const SOLVER_WGSL = `
struct Cell { mobile: vec4f, settled: vec4f, liquid: vec4f, flow: vec4f }
struct Dab { pose: vec4f, shape: vec4f, paint: vec4f, motion: vec4f }
struct Params { grid: vec4u, clock: vec4f, bounds: vec4u }
@group(0) @binding(0) var<storage, read_write> src: array<Cell>;
@group(0) @binding(1) var<storage, read_write> dst: array<Cell>;
@group(0) @binding(2) var<storage, read> paper: array<f32>;
@group(0) @binding(3) var<storage, read> dabs: array<Dab>;
@group(0) @binding(4) var<uniform> p: Params;
fn inside(q: vec2i) -> bool { return all(q >= vec2i(0)) && all(q < vec2i(p.grid.xy)); }
fn idx(q: vec2u) -> u32 { return q.y * p.grid.x + q.x; }
fn height(q: vec2u) -> f32 { return paper[idx(q)]; }
@compute @workgroup_size(8,8) fn deposit(@builtin(global_invocation_id) tid: vec3u) {
 let q = tid.xy + p.bounds.xy;
 if (any(q >= p.bounds.zw) || any(q >= p.grid.xy)) { return; }
 let i=idx(q); var c=src[i]; let pos=vec2f(q)+0.5;
 for (var k=0u;k<p.grid.z;k++) {
  let d=dabs[k]; let delta=pos-d.pose.xy;
  let cs=cos(d.shape.y); let sn=sin(d.shape.y);
  let local=vec2f(delta.x*cs+delta.y*sn,-delta.x*sn+delta.y*cs);
  let r=length(local/vec2f(max(d.pose.z*d.shape.x,0.5),max(d.pose.z,0.5)));
  let contact=1.0-smoothstep(0.84,1.0,r);
  if(contact<=0.0){continue;}
  // Add water first. Pigment knows only liquid, never whose stroke laid it.
  c.liquid.x=max(c.liquid.x,d.pose.w*contact);
  let wet=clamp(c.liquid.x,0.0,1.0);
  let retention=0.72+0.56*(1.0-height(q));
  let dose=d.shape.z*contact*retention;
  let amount=vec4f(d.paint.xyz,1.0)*dose;
  let dissolved=c.settled*clamp(wet*contact*(0.15+0.4*d.motion.z),0.0,0.60);
  c.settled-=dissolved;c.mobile+=dissolved;
  let mobile=0.20+0.75*wet;
  c.mobile+=amount*mobile; c.settled+=amount*(1.0-mobile);
  // Contact-weighted direction; returning directions cancel without renormalising.
  let drag=clamp(d.motion.z*contact*wet,0.0,0.82);
  c.flow.xy=mix(c.flow.xy,d.motion.xy,drag);c.flow.z=max(c.flow.z,drag);
 }
 src[i]=c;
}
// Canonical endpoint ordering makes the ray's wet gate identical for i→j/j→i.
// Supercover includes both orthogonal cells at diagonal corner crossings.
fn wetPath(qa:vec2i,qb:vec2i,endpointGate:f32)->f32 {
 var start=qa;var end=qb;
 if(start.y>end.y||(start.y==end.y&&start.x>end.x)){start=qb;end=qa;}
 let delta=end-start;let count=max(abs(delta.x),abs(delta.y));
 var last=start;var gate=endpointGate;
 for(var k=1;k<=count;k++) {
  let at=vec2i(round(vec2f(start)+vec2f(delta)*(f32(k)/f32(count))));
  gate=min(gate,clamp(src[idx(vec2u(at))].liquid.x,0,1));
  if(at.x!=last.x&&at.y!=last.y) {
   gate=min(gate,clamp(src[idx(vec2u(vec2i(at.x,last.y)))].liquid.x,0,1));
   gate=min(gate,clamp(src[idx(vec2u(vec2i(last.x,at.y)))].liquid.x,0,1));
  }
  if(gate<=0.0001){return 0;}
  last=at;
 }
 return gate;
}
@compute @workgroup_size(8,8) fn evolve(@builtin(global_invocation_id) tid: vec3u) {
 let q=tid.xy;if(any(q>=p.grid.xy)){return;}
 let i=idx(q);let a=src[i];var out=a;let wa=clamp(a.liquid.x,0.0,1.0);
 let h=height(q);var mw=a.mobile;var w=a.liquid.x;
 let dirs=array<vec2i,8>(vec2i(1,0),vec2i(-1,0),vec2i(0,1),vec2i(0,-1),vec2i(1,1),vec2i(-1,1),vec2i(1,-1),vec2i(-1,-1));
 let knight=array<vec2i,8>(vec2i(2,1),vec2i(-2,-1),vec2i(1,2),vec2i(-1,-2),vec2i(-1,2),vec2i(1,-2),vec2i(-2,1),vec2i(2,-1));
 for(var k=0u;k<8u;k++) {
  // Liquid uses local faces; large pigment steps never create distant solvent.
  let local=vec2i(q)+dirs[k];
  if(inside(local)) {
   let l=src[idx(vec2u(local))];let dh=h-height(vec2u(local));
   let wf=0.036*(a.liquid.x-l.liquid.x)+0.014*(max(dh,0.0)*a.liquid.x-max(-dh,0.0)*l.liquid.x);
   w-=wf;
  }
  let v=select(dirs[k],knight[k],p.clock.w>0.5)*i32(abs(p.clock.z));
  let n=vec2i(q)+v;if(!inside(n)){continue;}
  let b=src[idx(vec2u(n))];
  if(a.mobile.w+b.mobile.w<=0.0){continue;}
  let wb=clamp(b.liquid.x,0.0,1.0);
  // Endpoints are necessary members of every supercover path. Reject before
  // visiting interior cells; legacy oracle deliberately has no path threshold.
  var gate=min(wa,wb);
  if(p.clock.z>=0.0) {
   if(gate<=0.0001){continue;}
   gate=wetPath(vec2i(q),n,gate);
  }
  if(gate<=0.0){continue;}
  let dh=h-height(vec2u(n));let unit=normalize(vec2f(v));
  let faceFlow=0.5*(a.flow.xy*a.flow.z+b.flow.xy*b.flow.z);
  let velocity=dot(faceFlow,unit);
  let give=gate*(0.09+0.03*max(dh,0.0)+0.018*max(velocity,0.0)+0.015*max(wa-wb,0.0));
  let take=gate*(0.09+0.03*max(-dh,0.0)+0.018*max(-velocity,0.0)+0.015*max(wb-wa,0.0));
  mw+=b.mobile*take-a.mobile*give;
 }
 w=max(w,0.0);let evaporation=p.clock.x*(0.020+0.010*(1.0-h));
 var nextWater=max(0.0,w-evaporation);
 let dryShare=clamp(evaporation/max(w,0.0001),0.0,1.0);
 let grainDeposit=p.clock.x*0.012*(1.0-h)*clamp(1.0-nextWater,0.0,1.0);
 let share=clamp(dryShare+grainDeposit,0.0,1.0);
 out.mobile=mw*(1.0-share);out.settled+=mw*share;
 if(p.clock.y>0.5){out.settled+=out.mobile;out.mobile=vec4f(0);nextWater=0.0;}
 out.liquid=vec4f(nextWater,0,0,0);out.flow=a.flow*0.90;dst[i]=out;
}
`;
export const DISPLAY_WGSL = `
struct Cell { mobile:vec4f, settled:vec4f, liquid:vec4f, flow:vec4f }
struct View { grid:vec4u }
@group(0) @binding(0) var<storage,read> field:array<Cell>;
@group(0) @binding(1) var<storage,read> paper:array<f32>;
@group(0) @binding(2) var<uniform> view:View;
struct VOut { @builtin(position) pos:vec4f, @location(0) uv:vec2f }
@vertex fn vs(@builtin(vertex_index) n:u32)->VOut {
 let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:VOut;o.pos=vec4f(xy[n],0,1);o.uv=xy[n]*vec2f(0.5,-0.5)+0.5;return o;
}
@fragment fn fs(v:VOut)->@location(0) vec4f {
 let q=min(vec2u(v.uv*vec2f(view.grid.xy)),view.grid.xy-1u);let i=q.y*view.grid.x+q.x;
 let c=field[i];let total=c.mobile+c.settled;
 // Existing absorption model: logarithmic transmittance sums, not RGB averaging.
 let grain=0.975+0.025*paper[i];let color=exp(-total.xyz)*grain;
 let wet=clamp(c.liquid.x,0,1);let darkening=0.065*wet*exp(-total.w*3.0);
 return vec4f(color*(1.0-darkening),1);
}
`;
