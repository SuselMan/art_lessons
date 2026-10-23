// Diagnostic reads only. Restore framebuffer binding before any original operator.
() => {
 const E=window.__engine;window.__materialStages=[];window.__fieldTasks=[];
 const snap=(kind,scratch,targets,request)=>{
  const record={kind,request,tiles:[]};window.__materialStages.push(record);
  const gl=E.gl,prior=gl.getParameter(gl.FRAMEBUFFER_BINDING);
  try{for(const t of targets){const entry=scratch.peek(t.buffer);if(!entry)continue;
   const tile={x:t.originX,y:t.originY,fields:{}};record.tiles.push(tile);
   for(const name of ['inkLoad','inkColor','coverage','strokeInk','strokeColor','solventLoad','strokeSolvent','inkDry','colorDry','inkSettled','colorSettled','foreignSolventLoad']){
    const b=entry[name];if(!b){tile.fields[name]=null;continue}
    const raw=b.readPixels(),field={bytes:raw.length,width:b.width,height:b.height,sha:null,channelSum:[0,0,0,0],nonzero:0,roi:[]};tile.fields[name]=field;
    for(let i=0;i<raw.length;i+=4){let nz=false;for(let c=0;c<4;c++){field.channelSum[c]+=raw[i+c];nz||=raw[i+c]!==0}field.nonzero+=+nz}
    // Bounded central ROI; full SHA covers all pixels even outside this ROI.
    const w=b.width??Math.sqrt(raw.length/4),h=b.height??w;
    field.width=w;field.height=h;field.roiRect={x:Math.floor(w/2)-16,y:Math.floor(h/2)-16,w:32,h:32};
    for(let y=field.roiRect.y;y<field.roiRect.y+32;y++)for(let x=field.roiRect.x;x<field.roiRect.x+32;x++)for(let c=0;c<4;c++)field.roi.push(raw[(y*w+x)*4+c]);
    field.sha=window.__sha256Bytes(raw);
   }
  }}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,prior)}
 };
 const plan=E._settlePlan,prepare=plan.prepare;let n=0;
 plan.prepare=function(...a){const id=++n,request={id,bounds:{...a[2]},bloom:a[3],radius:a[4],water:a[5],landedWet:a[6],standing:a[7],wetPeak:a[8],dwell:a[9],owner:a[13],finish:a[12]?{direction:a[12].direction,spacing:a[12].spacing}:null};snap('prepare',a[0],a[1],request);const result=prepare.apply(this,a);if(result){const finish=result.finish;result.finish=function(...args){const r=finish.apply(this,args);snap('finish',a[0],a[1],request);return r}}return result};
 return true;
}
