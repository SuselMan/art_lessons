(async function(input) {
 const {PencilEngine}=await import('/src/engine/index.ts');
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;document.body.append(canvas);
 const out={costPaths:input.costPaths,source:input.source,roi:input.roi,targetId:input.targetId,planes:[],events:[],errors:[],guards:{},scope:'fresh immutable curated42, baked fixed, diagnostic readback; no Room/snapshot/performance claim'};
 let e,owner=null,serial=0,stage=0,currentOp=null;window.__maskSolverPhase={phase:"imports"};const undo=[],ids=new WeakMap();
 const id=b=>b?(ids.has(b)?ids.get(b):(ids.set(b,++serial),serial)):null;
 const wrap=(o,k,make)=>{const f=o[k];if(typeof f!=='function')throw Error('Missing seam '+k);o[k]=make(f);undo.push(()=>o[k]=f)};
 const event=(kind,x={})=>{if(out.events.length<256)out.events.push({kind,at:performance.now(),...x})};
 const raf=()=>new Promise(r=>requestAnimationFrame(r));
 const idle=async()=>{const until=performance.now()+150000;while(e._settle||e._wcCanonical.pending||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()>until)throw Error('Idle bounded deadline');await raf()}};
 const intersect=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY;
 const b64=a=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s)};
 function sample(name,b,map) {
  if(!b||!map)return {name,missing:true};
  const R=input.roi,S=map.S; if(!Number.isFinite(S)||S<=0)return {name,invalidScale:S}; const x=Math.floor((R.minX-map.x0)/S),top=Math.floor((R.minY-map.y0)/S),w=Math.ceil((R.maxX-R.minX)/S),h=Math.ceil((R.maxY-R.minY)/S),y=b.height-top-h;
  if(x<0||y<0||x+w>b.width||y+h>b.height)return {name,outside:true,map,buffer:[b.width,b.height],read:[x,y,w,h]};
  const a=new Uint8Array(w*h*4),gl=e.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const sum=[0,0,0,0],box=[w,h,-1,-1];let nonzero=0;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const n=(j*w+i)*4;for(let c=0;c<4;c++)sum[c]+=a[n+c];if(a[n+3]){nonzero++;box[0]=Math.min(box[0],i);box[1]=Math.min(box[1],j);box[2]=Math.max(box[2],i);box[3]=Math.max(box[3],j)}}
  return {name,id:id(b),map,buffer:[b.width,b.height],read:[x,y,w,h],sum,alphaNonzero:nonzero,glBox:box,rgba:b64(a)};
 }
 function capture(label,P,C,extra={}){
  if(!owner?.map||out.planes.length>=10)return;
  out.planes.push({label,at:performance.now(),CMeaning:extra.CMeaning??'actual-record',costMeaning:owner.mode19===2?'group-union-seed':'outward-pressure',...extra,records:[sample('P',P,owner.map),sample('C',C,owner.map),sample('V',owner.V,owner.map),sample('coverage',owner.field.coverage,owner.map),sample('cost',owner.field.pressure,owner.map)]});
 }
 try {
  e=new PencilEngine(canvas,{pageWidth:3508,pageHeight:2480,paper:'medium'});window.__stageEngine=e;
  e.setBaseLayers(['layer-1']);e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'layer-1',opacity:1}]);
  e._wcSourceFilmRebase=true;e._wcAsyncFinish=true;e._wcGradientFibres=true;e._watercolorPasses.warmGradientFibres();e._settlePlan.diagnosticPlateauPhase=true;
  await e.paperReady();e.setLocked(false);
  const p=e._watercolorPasses,plan=e._settlePlan;
  wrap(plan,'prepare',f=>function(...a){
   const metadata=a[12],finish=metadata?.finish??a[0].finishContext;
   const chosen=currentOp?.id===input.targetId&&finish?.profile.pigmentStrength>0&&intersect(a[2],input.targetBox);
   if(chosen){out.guards.matchedJobs=(out.guards.matchedJobs??0)+1;owner={scratch:a[0],finish,bounds:a[2],map:null,V:null,field:null,P:null,C:null,lastCarry:null,dryP:null,mode19:0,seenCarry:false,seenDiffuse:false,tide:false};out.guards.owner14=a[13]===true;out.guards.singlePaint=(metadata??a[0]).paints?.size===1;event('selected-prepare',{owner14:a[13]===true,paints:metadata?.paints?.size,bounds:a[2],profile:{pigmentStrength:finish.profile.pigmentStrength,waterLevel:finish.profile.waterLevel},groupDry:!e._wcAb.opDry});}
   const previous=this.diagnosticCostDomainPaths;this.diagnosticCostDomainPaths=chosen&&input.costPaths;
   try{const job=f.apply(this,a);if(chosen){owner.domain=job?.compositeDomain;out.guards.targetOps=job?.ops.length;}return job;}finally{this.diagnosticCostDomainPaths=previous;}
  });
  wrap(p,'waterFrontStep',f=>function(...a){
   if(owner&&!owner.map){owner.field=a[0];owner.map={x0:a[1],y0:a[2],S:a[10]};const candidates=[...plan._ownedInputs].filter(b=>b.width===owner.field.w&&b.height===owner.field.h);owner.V=candidates.length===1?candidates[0]:null;event('actual-field-map',{...owner.map,domain:owner.domain,VcandidateCount:candidates.length});capture('prefront-after-seed',owner.field.c,owner.field.ca,{CMeaning:'total C input, not claimed mobile'});}
   return f.apply(this,a);
  });
  function verifyMask(mask,stride,band){
   const map=owner.map,R=input.roi,S=map.S,gl=e.gl;
   const x=Math.floor((R.minX-map.x0)/S),top=Math.floor((R.minY-map.y0)/S),w=Math.ceil((R.maxX-R.minX)/S),h=Math.ceil((R.maxY-R.minY)/S),y=mask.height-top-h;
   const px=Math.max(0,x-stride),py=Math.max(0,y-stride),pw=Math.min(mask.width,x+w+stride)-px,ph=Math.min(mask.height,y+h+stride)-py;
   const cost=new Uint8Array(pw*ph*4),actual=new Uint8Array(w*h*4);
   gl.bindFramebuffer(gl.FRAMEBUFFER,owner.field.pressure.fbo);gl.readPixels(px,py,pw,ph,gl.RGBA,gl.UNSIGNED_BYTE,cost);
   gl.bindFramebuffer(gl.FRAMEBUFFER,mask.fbo);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,actual);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   const directions=[[1,0],[-1,0],[0,1],[0,-1]],rect=owner.maskRect;let differences=0,nonzero=0;
   for(let j=0;j<h;j++)for(let i=0;i<w;i++)for(let k=0;k<4;k++){
    let expected=255;for(let n=0;n<=stride;n++){const xx=x+i+directions[k][0]*n,yy=y+j+directions[k][1]*n;
     if(xx<rect[0]||yy<rect[1]||xx>=rect[2]||yy>=rect[3]||xx<px||yy<py||xx>=px+pw||yy>=py+ph||cost[4*((yy-py)*pw+xx-px)]/255>band){expected=0;break}}
    const value=actual[4*(j*w+i)+k];if(value!==expected)differences++;if(value)nonzero++;
   }
   (out.maskReachability??=[]).push({stride,band,read:[x,y,w,h],costRead:[px,py,pw,ph],rect,compared:w*h*4,differences,nonzero});
  }
  wrap(p,'costDomainStep',f=>function(...a){
   if(owner?.map){out.guards.maskCalls=(out.guards.maskCalls??0)+1;owner.maskRect=a[2];if(!owner.capturedPreCarry){owner.capturedPreCarry=true;capture('pre-carry',owner.field.c,owner.field.ca,{CMeaning:'total C before borrowed masks',band:[a[3],1],phase:1});}
    window.__maskSolverPhase={phase:'target-mask',calls:out.guards.maskCalls,step:a[4]};}
   return f.apply(this,a);
  });
  wrap(p,'pigmentColor',f=>function(...a){const v=f.apply(this,a);if(owner?.seenDiffuse&&!owner.tide&&a[0]===owner.field.cc){owner.P=a[1];owner.C=a[0];event('wet-colour-reconstructed',{P:id(a[1]),C:id(a[0])});}return v});
  wrap(p,'diffuseStep',f=>function(...a){
   if(owner?.map&&a[0]===owner.field){if(!owner.seenDiffuse){owner.seenDiffuse=true;owner.V=a[12]??owner.V;capture('pre-diffuse-post-carry',a[11]??a[6],owner.field.ca,{CMeaning:input.costPaths?'borrowed mask storage, NOT optical C; singlepaint C reconstruction follows':'total C input for singlepaint; not claimed diffused'});}const v=f.apply(this,a);owner.P=a[7];return v;}return f.apply(this,a);
  });
  wrap(p,'fieldOp',f=>function(...a){
   const mode=a[3],o=a[5]??{};const active=owner?.map&&a[0].width===owner.field.w&&a[0].height===owner.field.h;
   if(active&&mode===15){out.guards.carryCalls=(out.guards.carryCalls??0)+1;out.guards.phaseCalls=(out.guards.phaseCalls??0)+(o.tau?.[2]===1?1:0);if(!owner.seenCarry){owner.seenCarry=true;owner.V=o.e??owner.V;if(!owner.capturedPreCarry)capture('pre-carry',a[1],owner.field.ca,{CMeaning:'total C input, not claimed mobile',band:o.band,phase:o.tau?.[2]});}owner.lastCarry=a[0];out.guards.maskedCarry=(out.guards.maskedCarry??0)+(!!o.path?1:0);if(o.path&&o.origin?.[0]===64)verifyMask(o.path,64,o.band[0]);}
   if(active&&mode===19&&!owner.tide){owner.tide=true;capture('pre-group-tide-post-diffuse',owner.P,owner.C);event('group-tide-start');}
   const value=f.apply(this,a);
   if(active&&owner.tide&&mode===19&&stage===0){owner.mode19++;if(owner.mode19===2){stage=1;capture('post-both-mode19-union-seeds',owner.P,owner.C);}}
   if(active&&owner.tide&&mode===6&&stage===1){stage=2;capture('post-group-mode6',owner.P,owner.C,{bandRecord:sample('band',a[0],owner.map)});}
   if(active&&owner.tide&&mode===7&&stage===2){stage=3;capture('post-group-mode7-P-lift',owner.P,owner.C,{lift:sample('liftP',a[0],owner.map)});}
   if(active&&owner.tide&&mode===14&&stage===3){stage=4;owner.dryP=a[0];capture('post-group-mode14-dryP',owner.dryP,owner.C,{CMeaning:'wet C until reconstruction'});}
   if(active&&owner.tide&&mode===2&&stage===4&&a[1]===owner.dryP){stage=5;capture('post-group-dry-P-C',owner.dryP,a[0],{CMeaning:'actual dry reconstructed C'});owner=null;}
   return value;
  });
  const {undoneInBatch}=await import('/src/pages/Room/undoneInBatch.ts');e.setUnpaintedInBatch(undoneInBatch(input.ops));
  for(const op of input.ops){currentOp=op;window.__maskSolverPhase={phase:"replay",seq:op.seq,type:op.type,id:op.id};e.appendOperation(structuredClone(op),'remote');await idle();}
  e.appendOperation(input.finalDry,'remote');await idle();
  e.setCompositeOrder(input.strokeLayers.filter(id=>e._layers.has(id)).map(id=>({id,opacity:1})));
  window.__maskSolverPhase={phase:'export'};const png=await e.exportPNG(false);out.final=await new Promise(r=>{const f=new FileReader;f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(png)});
  out.flags={costPaths:input.costPaths,phase:plan.diagnosticPlateauPhase,baked:e._wcGradientFibres,rebase:e._wcSourceFilmRebase,async:e._wcAsyncFinish,opDry:e._wcAb.opDry,partial:plan.diagnosticPartialFrontPreview??false,painter:{segment:e._ribbonPainter.diagnosticSegmentDelivery,solvent:e._ribbonPainter.diagnosticSolventField}};
  out.journal=e._log.entries.map(x=>({id:x.op.id,type:x.op.type,state:x.state,seq:x.serverSeq??null}));const debug=e.gl.getExtension('WEBGL_debug_renderer_info');out.renderer=debug?e.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER);out.gl=e.gl.getError();out.lost=e.gl.isContextLost();out.stageCount=stage;
 }catch(err){out.error=String(err)}finally{for(const f of undo.reverse())f();if(e)e.destroy();canvas.remove();delete window.__stageEngine;out.engineClosed=true;}return out;
})
