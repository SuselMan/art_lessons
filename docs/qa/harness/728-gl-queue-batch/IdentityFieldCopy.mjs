// Isolated CPU proposal; not imported by runtime. Admission requires the caller's
// existing ownership/liveness/uniform/alias checks BEFORE considering this path.
export function identityCopyRect({mode,k,width,height,sourceWidth,sourceHeight,format,nearest,worldZ=0,scissor,validated=false}) {
 if(!validated||mode!==1||k!==0||format!=='rgba8unorm'||!nearest||worldZ!==0)return null;
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||width!==sourceWidth||height!==sourceHeight)return null;
 const r=scissor??[0,0,width,height];
 if(r.length!==4||!r.every(Number.isSafeInteger)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>width||r[1]+r[3]>height)return null;
 return {origin:[r[0],height-r[1]-r[3],0],size:[r[2],r[3],1]};
}
export function encodeIdentityCopy(encoder,source,destination,rect) {
 if(source===destination)throw Error('identity copy alias');
 encoder.copyTextureToTexture({texture:source,origin:rect.origin},{texture:destination,origin:rect.origin},rect.size);
}
export function referenceQ8(a,b,k) {
 const v=a.map((x,i)=>Math.fround(Math.fround(x/255)+Math.fround(Math.fround(b[i]/255)*Math.fround(k))));
 const divisor=Math.max(1,...v);return v.map(x=>Math.round(Math.fround(x/divisor)*255));
}
