/** Internal soft-mask affine basis. No descriptor admission is implied.
 * One RGBA texel per UNORM32BE value; consecutive texels hold s0 then s1.
 * Preparation owns its byte copy. Pixel sampling never scans/copies the table.
 */
export interface RadialSoftnessLayout {
  readonly resolution:number
  readonly minimum:number
  readonly span:number
  readonly textureSide:number
}
export interface RadialSoftnessBasis extends RadialSoftnessLayout {}
const prepared=new WeakMap<RadialSoftnessBasis,DataView>()
const U32=4294967295
/** Renderer preparation: scans padding once, retains metadata ONLY. The caller
 * owns the immutable CAS bytes and uploads them through its existing route. */
export function validateRadialSoftnessTexture(payload:Uint8Array,metadata:{resolution:number;minimum:number;span:number}):RadialSoftnessLayout {
  const {resolution,minimum,span}=metadata
  if(!Number.isInteger(resolution)||resolution<1||resolution>40000||!Number.isFinite(minimum)||minimum< -65536||minimum>65536||!Number.isFinite(span)||span<1||span>131072||!Number.isFinite(minimum+span)) throw new RangeError('Invalid radial softness metadata')
  const length=8*(resolution+2)
  let textureSide=2
  while(textureSide*textureSide*4<length)textureSide*=2
  const capacity=textureSide*textureSide*4
  if(!(payload instanceof Uint8Array)||(payload.byteLength!==length&&payload.byteLength!==capacity))throw new RangeError('Invalid radial softness payload')
  // Padding has no samples, but accepting hidden nonzero data would obscure
  // resource identity. GPU packing is canonical and bounded by1MiB.
  for(let i=length;i<payload.length;i++)if(payload[i]!==0)throw new RangeError('Invalid radial softness padding')
  return Object.freeze({resolution,minimum,span,textureSide})
}
/** Standalone CPU evaluator owns a copy, unlike the renderer metadata path. */
export function prepareRadialSoftnessBasis(payload:Uint8Array,metadata:{resolution:number;minimum:number;span:number}):RadialSoftnessBasis {
  const basis=validateRadialSoftnessTexture(payload,metadata)
  const bytes=new Uint8Array(basis.textureSide*basis.textureSide*4)
  bytes.set(payload)
  prepared.set(basis,new DataView(bytes.buffer))
  return basis
}
function data(basis:RadialSoftnessBasis):DataView {
  const view=prepared.get(basis)
  if(!view)throw new TypeError('Expected prepared radial softness basis')
  return view
}
/** Upload copy, once at texture preparation. Never called by pixel sampling. */
export function radialSoftnessTextureBytes(basis:RadialSoftnessBasis):Uint8Array {
  return new Uint8Array(data(basis).buffer.slice(0))
}
function coverage(view:DataView,basis:RadialSoftnessBasis,index:number,softness:number):number {
  const a=view.getUint32(index*8,false),b=view.getUint32(index*8+4,false)
  return Math.max(0,Math.min(1,basis.minimum+basis.span*((a+(b-a)*softness)/U32)))
}
export function radialSoftnessAlpha(q:number,basis:RadialSoftnessBasis,softness=1):number {
  const view=data(basis)
  if(!Number.isFinite(q)||!Number.isFinite(softness)||softness<0||softness>1)throw new RangeError('Invalid radial softness sample')
  if(q<0||q>1)return 0
  const position=q*basis.resolution,index=Math.floor(position)
  const left=coverage(view,basis,index,softness),right=coverage(view,basis,index+1,softness)
  const value=left+(right-left)*(position-index)
  return 255-Math.floor(Math.max(0,Math.min(255,(1-value)*255)))
}
/** Self-contained GLSL ES1 helper, also valid in the existing ES3 conversion.
 * lookup is RGBA8/NEAREST, UNORM32BE bytes, unpacked without filtering.
 * profile=(authored R, prepared textureSide, signed minimum, positive span).
 * Caller derives q in the same source coordinates as the historical radial
 * curve. Both endpoint samples are clamped BEFORE interpolation in q.
 */
export const BRUSH_RADIAL_SOFTNESS_GLSL=`
float brushSoftnessBasisValue(sampler2D lookup,float index,float side) {
 vec2 pixel=vec2(mod(index,side),floor(index/side));
 highp vec4 channels=texture2D(lookup,(pixel+0.5)/side);
 return dot(channels,vec4(0.9960937502319217,0.0038909912118439674,0.000015199184421263446,0.000000059371814145793454));
}
float brushSoftnessSample(sampler2D lookup,float index,vec4 profile,float softness) {
 float a=brushSoftnessBasisValue(lookup,index*2.0,profile.y);
 float b=brushSoftnessBasisValue(lookup,index*2.0+1.0,profile.y);
 return clamp(profile.z+profile.w*mix(a,b,softness),0.0,1.0);
}
float brushRadialSoftnessMask(sampler2D lookup,float q,vec4 profile,float softness) {
 if(q<0.0||q>1.0)return 0.0;
 float position=q*profile.x,index=floor(position);
 float left=brushSoftnessSample(lookup,index,profile,softness);
 float right=brushSoftnessSample(lookup,index+1.0,profile,softness);
 float value=mix(left,right,position-index);
 return (255.0-floor(clamp((1.0-value)*255.0,0.0,255.0)))/255.0;
}
`
