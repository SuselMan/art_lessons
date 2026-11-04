/** Defined functional world-pixel dissolve; safe integer world inputs hash explicit low32 bits (period2^32), not Krita global-thread RNG identity. */
import {canonicalSourceColorNoiseHash} from '@grafetto/shared'
const uint=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=0xffffffff
const world=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)
export function sourceDissolveSeed(gestureIdentity:string,draw?:Readonly<{role:'primary'|'mask';ordinal:number}>):number{
 if(typeof gestureIdentity!=='string'||!gestureIdentity.length||gestureIdentity.length>4096||draw&&(!Number.isSafeInteger(draw.ordinal)||draw.ordinal<0||!['primary','mask'].includes(draw.role)))throw new RangeError('Invalid canonical dissolve identity')
 const text=draw?JSON.stringify([gestureIdentity,draw.role,draw.ordinal]):gestureIdentity
 let h=0x811c9dc5
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h=Math.imul(h^(c&255),0x01000193)>>>0;h=Math.imul(h^(c>>>8),0x01000193)>>>0}
 return h>>>0
}
export function sourceDissolveByte(seed:number,x:number,y:number):number{
 if(!uint(seed)||!world(x)||!world(y))throw new RangeError('Invalid canonical dissolve world coordinate')
 return canonicalSourceColorNoiseHash((seed^(x>>>0)^Math.imul(y>>>0,0x9e3779b9))>>>0)>>>24
}
export function sourceDissolveUint32Bytes(value:number):readonly[number,number,number,number]{
 if(!uint(value))throw new RangeError('Invalid dissolve uint32')
 return Object.freeze([value&255,(value>>>8)&255,(value>>>16)&255,value>>>24])
}

// Little-endian limbs; every product/carry <2^18, exactly representable in ES1highp.
const DISSOLVE_LIMB_CORE=/*glsl*/`
vec4 sourceDissolveXor32(vec4 a,vec4 b){return vec4(sourceDissolveByteXor(a.x,b.x),sourceDissolveByteXor(a.y,b.y),sourceDissolveByteXor(a.z,b.z),sourceDissolveByteXor(a.w,b.w));}
vec4 sourceDissolveMultiply32(vec4 a,vec4 b){
 float c=a.x*b.x,r0=c-floor(c/256.0)*256.0;c=floor(c/256.0)+a.x*b.y+a.y*b.x;float r1=c-floor(c/256.0)*256.0;
 c=floor(c/256.0)+a.x*b.z+a.y*b.y+a.z*b.x;float r2=c-floor(c/256.0)*256.0;
 c=floor(c/256.0)+a.x*b.w+a.y*b.z+a.z*b.y+a.w*b.x;return vec4(r0,r1,r2,c-floor(c/256.0)*256.0);
}
vec4 sourceDissolveShift16(vec4 a){return vec4(a.z,a.w,0.0,0.0);}
vec4 sourceDissolveShift15(vec4 a){float c=floor(a.y/128.0)+2.0*a.z,d=floor(a.z/128.0)+2.0*a.w;return vec4(c-floor(c/256.0)*256.0,d-floor(d/256.0)*256.0,floor(a.w/128.0),0.0);}
vec4 sourceDissolveHash32(vec4 a){
 a=sourceDissolveMultiply32(sourceDissolveXor32(a,sourceDissolveShift16(a)),vec4(45.0,53.0,235.0,127.0));
 a=sourceDissolveMultiply32(sourceDissolveXor32(a,sourceDissolveShift15(a)),vec4(139.0,166.0,108.0,132.0));
 return sourceDissolveXor32(a,sourceDissolveShift16(a));
}
vec4 sourceDissolveAddOffset(vec4 origin,float offset){
 float c=origin.x+offset,r0=c-floor(c/256.0)*256.0;c=origin.y+floor(c/256.0);float r1=c-floor(c/256.0)*256.0;
 c=origin.z+floor(c/256.0);float r2=c-floor(c/256.0)*256.0;c=origin.w+floor(c/256.0);return vec4(r0,r1,r2,c-floor(c/256.0)*256.0);
}
float sourceDissolveWorldByte(vec4 seed,vec4 originX,vec4 originY,float targetHeight){
 vec4 x=sourceDissolveAddOffset(originX,floor(gl_FragCoord.x)),y=sourceDissolveAddOffset(originY,targetHeight-1.0-floor(gl_FragCoord.y));
 return sourceDissolveHash32(sourceDissolveXor32(sourceDissolveXor32(seed,x),sourceDissolveMultiply32(y,vec4(185.0,121.0,55.0,158.0)))).w;
}
`;
export const SOURCE_DISSOLVE_ES1_GLSL='float sourceDissolveByteXor(float a,float b){return sourceRgba8Binary(53.0,a,b);}' +DISSOLVE_LIMB_CORE
export const SOURCE_DISSOLVE_ES3_GLSL='float sourceDissolveByteXor(float a,float b){return float(uint(a)^uint(b));}' +DISSOLVE_LIMB_CORE
