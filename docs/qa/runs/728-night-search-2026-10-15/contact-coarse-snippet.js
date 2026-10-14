
const contactOps = (contact, oneShot = false) => {
 if(S!==1 || contact.radius<48)return contactOpsOriginal(contact,oneShot);
 const {rect:cr,radius,field:{width,height,pixels}}=contact;
 const commands=[],substeps=Math.max(1,Math.ceil(0.2*radius/2*brushDragMaxExposure(pixels)*Math.SQRT2/0.84)),gain=0.2*radius/(substeps*2);
 const payload={pixels};if(oneShot){contactPixels.add(payload);this._ownedContactPixels.add(payload)}
 const LW=field.w/2,LH=field.h/2;let lp,lc,np,nc,p0,c0,cov,rect,scissor;const buffers=[];
 const low={w:LW,h:LH,coverage:null};let lastPreview=-Infinity;
 const reconstruct=()=>{
  this.ctx.passes().wcResample(field.pressure,0,0,field.w,field.h,lp,0,0,.5,1,p0,dep.out);
  this.ctx.passes().wcResample(field.band,0,0,field.w,field.h,lc,0,0,.5,1,c0,col.out);
 };
 commands.push(()=>{
  if(!flowTexture)bindFlowTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,flowTexture);
  try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,payload.pixels)}finally{if(oneShot){payload.pixels=null;contactPixels.delete(payload);this._ownedContactPixels.delete(payload)}}
  for(let i=0;i<7;i++)buffers.push(acquireInput(LW,LH));[lp,lc,np,nc,p0,c0,cov]=buffers;low.coverage=cov;
  this.ctx.passes().wcResample(lp,0,0,LW,LH,dep.out,0,0,2,0);
  this.ctx.passes().wcResample(lc,0,0,LW,LH,col.out,0,0,2,0);
  this.ctx.passes().wcResample(cov,0,0,LW,LH,field.coverage,0,0,2,0);
  lp.copyRegionInto(np,0,0,0,0,LW,LH);lc.copyRegionInto(nc,0,0,0,0,LW,LH);lp.copyRegionInto(p0,0,0,0,0,LW,LH);lc.copyRegionInto(c0,0,0,0,0,LW,LH);
  rect=[(cr.x-x0)/field.w,1-(cr.y+cr.h-y0)/field.h,cr.w/field.w,cr.h/field.h];
  const left=Math.max(0,Math.floor((cr.x-x0)/2)-1),right=Math.min(LW,Math.ceil((cr.x+cr.w-x0)/2)+1),bottom=Math.max(0,Math.floor(LH-(cr.y+cr.h-y0)/2)-1),top=Math.min(LH,Math.ceil(LH-(cr.y-y0)/2)+1);scissor=[left,bottom,right-left,top-bottom];
 });
 const exchange=()=>{
  this.ctx.passes().brushPass(low,flowTexture,8,2,lc,nc,lp,rect,scissor,lc,gain);
  this.ctx.passes().brushPass(low,flowTexture,8,2,lp,np,lp,rect,scissor,lc,gain);
  [lp,np]=[np,lp];[lc,nc]=[nc,lc];
  if(performance.now()-lastPreview>180){lastPreview=performance.now();reconstruct();present(field.pressure,null,field.band)}
 };
 for(let i=0;i<substeps;i++)commands.push(contactPulseOp(exchange));
 commands.push(()=>{reconstruct();field.pressure.copyRegionInto(dep.out,0,0,0,0,field.w,field.h);field.band.copyRegionInto(col.out,0,0,0,0,field.w,field.h);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,col.out.texture);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,dep.out.texture);gl.activeTexture(gl.TEXTURE0);for(const b of buffers)releaseInput(b)});
 return commands;
};
