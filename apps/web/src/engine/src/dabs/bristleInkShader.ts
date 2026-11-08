import type {BristleInkProfile} from '../presets/brushBristleInk'
/** Packed IEEE754, not a floating-point texture. Nonnegative canonical F32
 * values include subnormals; no curve interpolation or runtime power law. */
export function bristleInkTextureBytes(profile:BristleInkProfile):{bytes:Uint8Array;width:number;height:number}{
 const width=Math.min(256,profile.amount),height=Math.ceil(profile.amount/width),bytes=new Uint8Array(width*height*4),view=new DataView(bytes.buffer)
 for(let i=0;i<profile.amount;i++)view.setFloat32(i*4,profile.depletion[i],true)
 return {bytes,width,height}
}
export const BRISTLE_INK_GLSL=`
uniform sampler2D u_inkCurve;
uniform vec3 u_inkTable;
uniform vec4 u_inkWeights;
uniform vec2 u_inkFlags;
varying vec4 v_inkState;
varying vec4 v_inkAxis;
float bristleCurve(float index){
 index=clamp(index,0.0,u_inkTable.z-1.0);
 vec4 b=floor(texture2D(u_inkCurve,(vec2(mod(index,u_inkTable.x),floor(index/u_inkTable.x))+0.5)/u_inkTable.xy)*255.0+0.5);
 float exponent=b.w*2.0+floor(b.z/128.0);
 float mantissa=mod(b.z,128.0)*65536.0+b.y*256.0+b.x;
 if(exponent==0.0)return mantissa*exp2(-149.0);
 return (8388608.0+mantissa)*exp2(exponent-150.0);
}
float bristleInkAt(float k){
 float previous=k<0.5?v_inkState.y:1.0-bristleCurve(v_inkState.x+k-1.0);
 float opacity=v_inkState.z;
 if(u_inkFlags.x>0.5){
  opacity=u_inkFlags.y>0.5?dot(vec4(v_inkState.w,v_inkState.z,previous,1.0-bristleCurve(v_inkState.x+k)),u_inkWeights):v_inkState.z*previous;
 }
 return floor(clamp(opacity,0.0,1.0)*255.0+0.5)/255.0;
}
float bristleInkAlpha(vec2 pixel){
 float coordinate=mix(pixel.x,pixel.y,v_inkAxis.z);
 float k=clamp(floor((coordinate-v_inkAxis.x)*v_inkAxis.y+0.5),0.0,v_inkAxis.w-1.0);
 float a=bristleInkAt(k);
 // Native aliased trajectories append a separate final endpoint. At the
 // terminal pixel combine that bounded second deposit in trajectory order.
 // Capsule coverage/endpoint pixel rounding is a functional approximation.
 if(u_requestMode.x<0.5&&k>=v_inkAxis.w-2.0&&k<v_inkAxis.w-1.0){
  float b=bristleInkAt(v_inkAxis.w-1.0);
  a=u_requestMode.z>0.5?b+a*(1.0-b):max(a,b);
 }
 return a;
}
`

/** Opt-in139 only; old72/93 shader constants above remain byte-for-byte. */
export function bristleSoakInkFragment139(fragment:string):string {
 const anchor='float opacity=v_inkState.z;'
 if(fragment.split(anchor).length!==2)throw Error('Bristle Soak shader anchor drift')
 return fragment.replace('float bristleInkAt(float k){','varying highp float v_soakAlpha;\nfloat bristleInkAt(float k){').replace(anchor,'float opacity=v_soakAlpha;')
}
export function bristleSoakInkVertex139(vertex:string):string {
 if(vertex.split('void main(){').length!==2)throw Error('Bristle Soak vertex anchor drift')
 return vertex.replace('void main(){','attribute float a_soakAlpha;varying highp float v_soakAlpha;void main(){v_soakAlpha=a_soakAlpha;')
}
