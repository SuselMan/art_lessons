import {WC_BRUSH_DRAG_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {CANONICAL_TEXTURE_BRUSH_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/brush'
export const BRUSH_FRACTION_CELLS=[[349,288],[350,288]] as const
/** Diagnostic float outputs only: same original helper bodies, no altered
 * fraction/capacity/floor or epsilon. Compiler optimisation can differ from
 * the material pipeline; coefficients require corroboration with original Q8. */
export function brushFractionGlShader(){
 const i=WC_BRUSH_DRAG_FRAG.indexOf('  void main() {');if(i<0)throw Error('Original GL brush main seam')
 return WC_BRUSH_DRAG_FRAG.slice(0,i)+`uniform int u_face;uniform float u_take;
 void main(){vec2 center=snapUV(v_uv),dir=axis(u_face),neighbour=snapUV(center+dir*u_step);
 vec2 a=center,b=neighbour,d=dir;if(u_take>.5){a=neighbour;b=center;d=-dir;}
 float amount=rawFraction(a,b,d),f=integerFraction(a,b,d);
 float q=floor(texture2D(u_pigment,a).r*255.0+.5),product=q*f;
 gl_FragColor=vec4(amount,f,product,floor(product));}`
}
export function brushFractionWgslShader(){
 const i=CANONICAL_TEXTURE_BRUSH_WGSL.indexOf('@compute @workgroup_size');if(i<0)throw Error('Original WGSL brush main seam')
 const prefix=CANONICAL_TEXTURE_BRUSH_WGSL.slice(0,i).replace('@group(0) @binding(6) var outPigment:texture_storage_2d<rgba8unorm,write>;','@group(0) @binding(6) var<storage,read_write> results:array<vec4f>;').replace('@group(0) @binding(7) var outColor:texture_storage_2d<rgba8unorm,write>;','')
 return prefix+`@compute @workgroup_size(16) fn probe(@builtin(global_invocation_id) tid:vec3u){
 let row=tid.x;if(row>=16u){return;}let x=349u+row/8u;let center=snap(vec2f(f32(x)+.5,1536.0-288.0-.5)/vec2f(1536));
 let dir=axis(row%4u);let neighbour=snap(center+dir*u.step);var a=center;var b=neighbour;var d=dir;
 if((row/4u)%2u==1u){a=neighbour;b=center;d=-dir;}
 let amount=raw(a,b,d);let f=fraction(a,b,d);let q=floor(pigmentAt(a).r*255.0+.5);let product=q*f;
 results[row]=vec4f(amount,f,product,floor(product));}`
}
export function brushFractionRows(){return BRUSH_FRACTION_CELLS.flatMap(([x,y])=>[false,true].flatMap(take=>Array.from({length:4},(_,axis)=>({fieldX:x,fieldY:y,take,axis}))))}
