/** Small framebuffer diagnostic; readPixels perturbs GPU timing. Never enable for latency baseline. */
export function readOwnedVisibleProbe(e,owner,phase,visible){
 if(!owner.probePoint)return null;const gl=e.gl,previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),[cx,cy]=owner.probePoint,points=[[cx,cy],[cx-20,cy],[cx+20,cy]].map(([x,y])=>[Math.max(0,Math.min(1023,Math.round(x))),Math.max(0,Math.min(1023,Math.round(y)))]),samples=[];
 try{for(const [x,y]of points){const read=field=>{const bytes=new Uint8Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,field.fbo);gl.readPixels(x,1023-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return[...bytes]};samples.push({x,y,source:read(owner.lease.fields.presentation),visible:read(visible)})}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous)}
 return{phase,sequence:owner.token.sequence,samples,limitations:'Small actual RGBA framebuffer samples, not scanout; GPU readback perturbs cadence and is excluded from latency claims'};
}
