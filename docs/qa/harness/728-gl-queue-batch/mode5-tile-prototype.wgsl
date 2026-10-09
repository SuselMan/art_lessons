// CPU-reviewed prototype ONLY, not compiled/integrated. Host admits nearest
// same-extent rgba8 input, integer stride1/2, original finite/scissor/alias guards.
struct Params { dims:vec2u, stride:u32, pad:u32, dispatch:vec4u, scissor:vec4f }
@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var out:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2) var<uniform> u:Params;
var<workgroup> tile:array<vec4f,144>;
@compute @workgroup_size(8,8) fn main(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(local_invocation_index) lane:u32){
 let base=u.dispatch.xy+group.xy*8u;let side=8u+2u*u.stride;
 for(var t=lane;t<side*side;t+=64u){
  let p=vec2i(base)+vec2i(i32(t%side),i32(t/side))-vec2i(i32(u.stride));
  tile[t]=textureLoad(source,clamp(p,vec2i(0),vec2i(u.dims)-vec2i(1)),0);
 }
 // No early return before this barrier: even out-of-image/scissor lanes load.
 workgroupBarrier();
 let q=base+local.xy;
 if(any(q>=u.dims)||any(q>=u.dispatch.xy+u.dispatch.zw)){return;}
 let px=vec2f(f32(q.x)+.5,f32(u.dims.y)-f32(q.y)-.5);
 if(any(px<u.scissor.xy)||any(px>=u.scissor.xy+u.scissor.zw)){return;}
 var s=vec4f(0);
 for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){
  var wx=1.0;var wy=1.0;if(i==0){wx=2;}if(j==0){wy=2;}
  let index=u32(i32(local.y+u.stride)-j*i32(u.stride))*side+u32(i32(local.x+u.stride)+i*i32(u.stride));
  s+=wx*wy*tile[index];
 }}
 textureStore(out,vec2i(q),s/16.0);
}
