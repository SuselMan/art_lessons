/** Internal native-principle rectangle generators. No descriptor admission.
 * Native source: Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f,
 * kis_gauss_rect_mask_generator.cpp / kis_curve_rect_mask_generator.cpp.
 * Functional browser erf precision; no native SIMD/byte identity claim.
 */
import {autoSpikeFold} from './autoSpikes'
import {gaussianTransparency,gaussianSampleCount,maskStencilAlpha} from './gaussianTip'
import {validateRadialSoftnessTexture} from './radialSoftness'
export interface GaussianRectangle {readonly rx:number;readonly ry:number;readonly antialias:boolean}
interface GaussianData {kx:number;ky:number;hx:number;hy:number;factor:number}
const gaussians=new WeakMap<object,GaussianData>()
const curves=new WeakMap<object,{view:DataView;affine:boolean;minimum:number;span:number}>()
export interface CurveRectangle {readonly resolution:number;readonly antialias:boolean}
const U32=4294967295
function axes(rx:number,ry:number):void {if(!Number.isFinite(rx)||!Number.isFinite(ry)||rx<=0||ry<=0)throw new RangeError('Invalid rectangle axes')}
function erf(value:number):number {
 const direction=value<0?-1:1,x=Math.abs(value),t=1/(1+.3275911*x)
 if(x>6)return direction
 return direction*(1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-x*x))
}
const byte=(n:number)=>Math.floor(Math.max(0,Math.min(255,n)))
/** Native Gaussian ignores Softness; horizontal/vertical fade remain distinct. */
export function prepareGaussianRectangle(rx:number,ry:number,horizontalFade:number,verticalFade:number,antialias:boolean):GaussianRectangle {
 axes(rx,ry)
 if(![horizontalFade,verticalFade].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||typeof antialias!=='boolean')throw new RangeError('Invalid Gaussian rectangle profile')
 const sx=(1-horizontalFade/2)*rx*.2,sy=(1-verticalFade/2)*ry*.2
 const kx=1/(Math.SQRT2*sx),ky=1/(Math.SQRT2*sy),hx=rx-2.5*sx,hy=ry-2.5*sy
 const data={kx,ky,hx,hy,factor:255/(4*erf(hx*kx)*erf(hy*ky))}
 if(!Object.values(data).every(Number.isFinite))throw new RangeError('Unrepresentable Gaussian rectangle geometry')
 const result=Object.freeze({rx,ry,antialias});gaussians.set(result,data);return result
}
/** Native setScale precomputes these coefficients once per placed geometry.
 * Two vec4 uploads; no erf normalization or coefficient divisions per pixel. */
export function gaussianRectangleUniforms(profile:GaussianRectangle):{coefficients:readonly[number,number,number,number];geometry:readonly[number,number,number,number]} {
 const d=gaussians.get(profile);if(!d)throw new TypeError('Expected prepared Gaussian rectangle')
 return {coefficients:[d.kx,d.ky,d.hx,d.hy],geometry:[profile.rx,profile.ry,d.factor,profile.antialias?1:0]}
}
/** Scalar native 2D fade: quantize base, X, then Y. Negative edge starts for
 * subpixel axes are intentional; clamping them to zero changes coverage. */
export function rectangleEdgeTransparency(x:number,y:number,rx:number,ry:number,antialias:boolean,base:(x:number,y:number)=>number):number {
 x=Math.abs(x);y=Math.abs(y)
 if(x>rx||y>ry)return 255
 let value=byte(base(x,y))
 if(antialias){if(x>rx-1)value=byte(value+(255-value)*(x-(rx-1)));if(y>ry-1&&value<255)value=byte(value+(255-value)*(y-(ry-1)))}
 return value
}
export function gaussianRectangleTransparency(x:number,y:number,profile:GaussianRectangle):number {
 const d=gaussians.get(profile);if(!d)throw new TypeError('Expected prepared Gaussian rectangle')
 if(!Number.isFinite(x)||!Number.isFinite(y))throw new RangeError('Invalid rectangle point')
 return rectangleEdgeTransparency(x,y,profile.rx,profile.ry,profile.antialias,(a,b)=>255-byte(d.factor*(erf((d.hx+a)*d.kx)+erf((d.hx-a)*d.kx))*(erf((d.hy+b)*d.ky)+erf((d.hy-b)*d.ky))))
}
/** Standalone CPU owns one bounded copy. Renderer should validate/upload the
 * existing CAS directly, exactly as radialSoftness's metadata-only route. */
export function prepareCurveRectangle(payload:Uint8Array,resolution:number,antialias:boolean,affine?:{minimum:number;span:number}):CurveRectangle {
 if(!Number.isInteger(resolution)||resolution<1||resolution>40000||typeof antialias!=='boolean'||!(payload instanceof Uint8Array))throw new RangeError('Invalid rectangle curve')
 if(affine)validateRadialSoftnessTexture(payload,{resolution,...affine})
 else {
  const used=4*(resolution+2),side=Math.sqrt(payload.length)
  if(payload.length!==used&&(!Number.isInteger(side)||side<4||(side&(side-1))!==0||payload.length<used||payload.length>1048576))throw new RangeError('Invalid rectangle curve payload')
  for(let i=used;i<payload.length;i++)if(payload[i]!==0)throw new RangeError('Invalid rectangle curve padding')
 }
 const result=Object.freeze({resolution,antialias})
 curves.set(result,{view:new DataView(payload.slice().buffer),affine:!!affine,minimum:affine?.minimum??0,span:affine?.span??1});return result
}
export function curveRectangleTransparency(x:number,y:number,rx:number,ry:number,profile:CurveRectangle,softness=1):number {
 const d=curves.get(profile);if(!d)throw new TypeError('Expected prepared rectangle curve')
 axes(rx,ry)
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(softness)||softness<0||softness>1)throw new RangeError('Invalid rectangle curve sample')
 if(!d.affine&&softness!==1)throw new RangeError('Dynamic rectangle softness requires affine basis')
 const sample=(index:number)=>{
  if(!d.affine)return d.view.getUint32(index*4,false)/U32
  const a=d.view.getUint32(index*8,false),b=d.view.getUint32(index*8+4,false)
  return Math.max(0,Math.min(1,d.minimum+d.span*(a+(b-a)*softness)/U32))
 }
 return rectangleEdgeTransparency(x,y,rx,ry,profile.antialias,(a,b)=>{
  const i=Math.floor(a/rx*profile.resolution+.5),j=Math.floor(b/ry*profile.resolution+.5)
  const product=sample(i)*(1-sample(profile.resolution-i))*sample(j)*(1-sample(profile.resolution-j))
  return (1-product)*255
 })
}
/** Source axes stay anisotropic, fold BEFORE evaluation; unlike standardRect,
 * Gaussian/curve rectangle native generators do not abs(X) before folding. */
export function autoRectangleAlpha(x:number,y:number,rx:number,ry:number,angle:number,spikes:number,profile:GaussianRectangle|CurveRectangle,softness=1):number {
 axes(rx,ry)
 if(![x,y,angle].every(Number.isFinite))throw new RangeError('Invalid rectangle geometry')
 if(!Number.isInteger(spikes)||spikes<2||spikes>20)throw new RangeError('Invalid rectangle spikes')
 const gaussian=gaussians.has(profile),curve=curves.has(profile)
 if(!gaussian&&!curve)throw new TypeError('Expected prepared rectangle profile')
 if(gaussian&&(profile as GaussianRectangle).rx!==rx||gaussian&&(profile as GaussianRectangle).ry!==ry)throw new RangeError('Gaussian rectangle axes differ from preparation')
 const c=Math.cos(angle),s=Math.sin(angle),n=gaussianSampleCount(Math.min(rx,ry)*2,profile.antialias)
 return maskStencilAlpha(x,y,n,(px,py)=>{
  const localX=c*px+s*py,localY=-s*px+c*py
  const p=autoSpikeFold(localX,Math.abs(localY),spikes,false)
  return gaussian?gaussianRectangleTransparency(p[0],p[1],profile as GaussianRectangle):curveRectangleTransparency(p[0],p[1],rx,ry,profile as CurveRectangle,softness)
 })
}
/** Explicit new-profile ellipse route. Historical gaussian profile keeps its
 * old evaluator; this scales only the source Y axis, AFTER native angular fold. */
export function gaussianEllipseAlpha(x:number,y:number,rx:number,ry:number,fade:number,antialias:boolean,angle=0,spikes=2):number {
 axes(rx,ry)
 if(![x,y,angle,fade].every(Number.isFinite)||fade<=0||fade>=1||typeof antialias!=='boolean'||!Number.isInteger(spikes)||spikes<2||spikes>20)throw new RangeError('Invalid Gaussian ellipse')
 const c=Math.cos(angle),s=Math.sin(angle),n=gaussianSampleCount(2*Math.min(rx,ry),antialias)
 return maskStencilAlpha(x,y,n,(px,py)=>{
  const p=autoSpikeFold(c*px+s*py,Math.abs(-s*px+c*py),spikes,false)
  return gaussianTransparency(p[0],p[1]*rx/ry,rx,fade,antialias)
 })
}
/** Dependencies: brushGaussianErf, brushCurveValue, brushSoftnessSample.
 * Functions return U8 transparency; caller uses the existing 1/3/6 stencil.
 * Gaussian coeff=(kx,ky,hx,hy), geometry=(rx,ry,factor,AA).
 * Curve p=(R,lookupSide,AA,0), basis=(R,side,min,span).
 */
export const BRUSH_AUTO_RECTANGLE_GLSL=`
float brushGaussianEllipseTransparency(vec2 point,vec2 radii,vec2 profile) {
 return brushGaussianTransparency(vec2(point.x,point.y*radii.x/radii.y),radii.x,profile);
}
float brushRectangleEdge(float value,vec2 a,vec2 radii,float aa) {
 if(aa>0.5){
  if(a.x>radii.x-1.0)value=floor(clamp(value+(255.0-value)*(a.x-radii.x+1.0),0.0,255.0));
  if(a.y>radii.y-1.0&&value<255.0)value=floor(clamp(value+(255.0-value)*(a.y-radii.y+1.0),0.0,255.0));
 }
 return value;
}
float brushGaussianRectangleTransparency(vec2 point,vec4 coeff,vec4 geometry) {
 vec2 a=abs(point),radii=geometry.xy;if(any(greaterThan(a,radii)))return 255.0;
 vec2 k=coeff.xy,h=coeff.zw;
 float coverage=geometry.z*(brushGaussianErf((h.x+a.x)*k.x)+brushGaussianErf((h.x-a.x)*k.x))*(brushGaussianErf((h.y+a.y)*k.y)+brushGaussianErf((h.y-a.y)*k.y));
 return brushRectangleEdge(255.0-floor(clamp(coverage,0.0,255.0)),a,radii,geometry.w);
}
float brushRectangleCurveValue(sampler2D lookup,float i,vec4 basis,float softness,float affine) {
 if(affine>0.5)return brushSoftnessSample(lookup,i,basis,softness);
 return brushCurveValue(lookup,i,basis.y);
}
float brushCurveRectangleTransparency(vec2 point,vec2 radii,sampler2D lookup,vec4 p,vec4 basis,float softness,float affine) {
 vec2 a=abs(point);if(any(greaterThan(a,radii)))return 255.0;
 vec2 ij=floor(a/radii*p.x+0.5);
 float sx=brushRectangleCurveValue(lookup,ij.x,basis,softness,affine);
 float tx=brushRectangleCurveValue(lookup,p.x-ij.x,basis,softness,affine);
 float sy=brushRectangleCurveValue(lookup,ij.y,basis,softness,affine);
 float ty=brushRectangleCurveValue(lookup,p.x-ij.y,basis,softness,affine);
 return brushRectangleEdge(floor(clamp((1.0-sx*(1.0-tx)*sy*(1.0-ty))*255.0,0.0,255.0)),a,radii,p.z);
}
`
