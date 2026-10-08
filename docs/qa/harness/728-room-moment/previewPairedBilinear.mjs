/** OFF proposal: reconstruct records, never blur composed RGB. */
export function previewBilinearFootprint(uv,width=128,height=128){
 if(uv.length!==2||uv.some(v=>!Number.isFinite(v))||![width,height].every(v=>Number.isInteger(v)&&v>0))throw Error('FiniteUV/positiveinteger size required');
 const pos=[uv[0]*width-.5,uv[1]*height-.5],i=pos.map(Math.floor),f=pos.map((v,k)=>v-i[k]);
 const clamp=(v,n)=>Math.max(0,Math.min(n-1,v));
 return{xy:[[clamp(i[0],width),clamp(i[1],height)],[clamp(i[0]+1,width),clamp(i[1],height)],[clamp(i[0],width),clamp(i[1]+1,height)],[clamp(i[0]+1,width),clamp(i[1]+1,height)]],weights:[(1-f[0])*(1-f[1]),f[0]*(1-f[1]),(1-f[0])*f[1],f[0]*f[1]]};
}
export function samplePreviewPair({p,c,width=128,height=128},uv){
 if(p.length!==width*height*4||c.length!==p.length)throw Error('PairedRGBA extent required');
 const footprint=previewBilinearFootprint(uv,width,height),read=field=>[0,1,2,3].map(channel=>footprint.xy.reduce((sum,[x,y],j)=>sum+field[(y*width+x)*4+channel]*footprint.weights[j],0));
 return{p:read(p),c:read(c),footprint};
}
export const PREVIEW_PAIRED_BILINEAR_GLSL=`
// Caller binds NEAREST textures; no OES_texture_float_linear needed.
// u_previewP/u_previewC: same extent, one immutable completed front pair.
uniform sampler2D u_previewP;
uniform sampler2D u_previewC;
uniform vec2 u_previewSize;
void previewPairAt(vec2 uv, out vec4 p, out vec4 c) {
 vec2 x=uv*u_previewSize-vec2(0.5);
 vec2 i=floor(x);
 vec2 f=x-i; //floor-consistent, avoid builtinfract reassociation
 vec2 lo=clamp(i,vec2(0.0),u_previewSize-vec2(1.0));
 vec2 hi=clamp(i+vec2(1.0),vec2(0.0),u_previewSize-vec2(1.0));
 vec2 q00=(lo+vec2(0.5))/u_previewSize;
 vec2 q10=(vec2(hi.x,lo.y)+vec2(0.5))/u_previewSize;
 vec2 q01=(vec2(lo.x,hi.y)+vec2(0.5))/u_previewSize;
 vec2 q11=(hi+vec2(0.5))/u_previewSize;
 vec4 weights=vec4((1.0-f.x)*(1.0-f.y),f.x*(1.0-f.y),(1.0-f.x)*f.y,f.x*f.y);
 p=texture2D(u_previewP,q00)*weights.x+texture2D(u_previewP,q10)*weights.y+texture2D(u_previewP,q01)*weights.z+texture2D(u_previewP,q11)*weights.w;
 c=texture2D(u_previewC,q00)*weights.x+texture2D(u_previewC,q10)*weights.y+texture2D(u_previewC,q01)*weights.z+texture2D(u_previewC,q11)*weights.w;
}
`;
