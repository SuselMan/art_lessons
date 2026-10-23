(async function(input) {
 const {PencilEngine}=await import('/src/engine/index.ts');
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
 const {createProgram,getUniforms}=await import('/src/engine/src/raster/utils.ts');
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;document.body.append(canvas);
 const out={costPaths:input.costPaths,source:input.source,roi:input.roi,targetId:input.targetId,planes:[],events:[],errors:[],guards:{},scope:'fresh immutable curated42, baked fixed, diagnostic readback; no Room/snapshot/performance claim'};
 const browserSHA=(function sha256(bytes) {
 const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],n=Math.ceil((bytes.length+9)/64)*64,p=new Uint8Array(n),v=new DataView(p.buffer),w=new Int32Array(64),rot=(x,n)=>(x>>>n)|(x<<(32-n));p.set(bytes);p[bytes.length]=128;v.setUint32(n-8,Math.floor(bytes.length/0x20000000));v.setUint32(n-4,(bytes.length*8)>>>0);
 for(let offset=0;offset<n;offset+=64){for(let i=0;i<16;i++)w[i]=v.getInt32(offset+4*i);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rot(x,7)^rot(x,18)^(x>>>3))+w[i-7]+(rot(y,17)^rot(y,19)^(y>>>10)))|0}let[a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0,t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0}for(let i=0;i<8;i++)H[i]=(H[i]+[a,b,c,d,e,f,g,h][i])|0}
 return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
});
 const raw=new Map();let rawSerial=0;window.__maskSolverPartial=out;
 let oldProgram=null,oldProbe=null;let e,owner=null,serial=0,stage=0,currentOp=null;window.__maskSolverPhase={phase:"imports"};const undo=[],ids=new WeakMap();
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
  return {name,id:id(b),map,buffer:[b.width,b.height],read:[x,y,w,h],sum,alphaNonzero:nonzero,glBox:box,rawKey:(()=>{const key=String(++rawSerial);raw.set(key,a);return key})(),byteLength:a.length,browserSHA:browserSHA(a)};
 }
 function checkpoint(property="checkpoint",entries=[["mobileP",owner.field.c],["totalC",owner.field.ca],["fixedP",owner.field.b],["fixedC",owner.field.cb],["V",owner.V],["coverage",owner.field.coverage],["cost",owner.field.pressure]],label="full-pre-carry") {
  if (out[property]) return;
  const gl=e.gl,records=[];
  for(const [name,buffer] of entries) {
   if(!buffer)throw Error('Missing full checkpoint '+name);
   const bytes=new Uint8Array(buffer.width*buffer.height*4);
   gl.bindFramebuffer(gl.FRAMEBUFFER,buffer.fbo);gl.readPixels(0,0,buffer.width,buffer.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   let alphaNonzero=0;const sum=[0,0,0,0];for(let i=0;i<bytes.length;i+=4){for(let c=0;c<4;c++)sum[c]+=bytes[i+c];if(bytes[i+3])alphaNonzero++;}
   const key=String(++rawSerial);raw.set(key,bytes);records.push({name,id:id(buffer),buffer:[buffer.width,buffer.height],read:[0,0,buffer.width,buffer.height],byteLength:bytes.length,rawKey:key,browserSHA:browserSHA(bytes),alphaNonzero,sum});
  }
  out[property]={label,map:owner.map,CMeaning:'total and fixed C; single-paint mobile C is reconstructed, not a paired record',records};
 }
 function capture(label,P,C,extra={}){
  if(!owner?.map||out.planes.length>=10)return;
  if(label==='pre-carry')checkpoint();
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
   const previous=this.diagnosticCostDomainPaths,previousPacked=this.diagnosticPackedCostPaths;this.diagnosticCostDomainPaths=chosen&&input.costPaths;this.diagnosticPackedCostPaths=chosen&&input.packed;
   try{const job=f.apply(this,a);if(chosen){owner.domain=job?.compositeDomain;out.guards.targetOps=job?.ops.length;}return job;}finally{this.diagnosticCostDomainPaths=previous;this.diagnosticPackedCostPaths=previousPacked;}
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
    const byte=actual[4*(j*w+i)+k],value=input.packed?((byte/stride|0)%2)*255:byte;if(value!==expected)differences++;if(value)nonzero++;
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
   if(active&&mode===15){out.guards.packedCarry=(out.guards.packedCarry??0)+(o.pathPacked?1:0);out.guards.carryCalls=(out.guards.carryCalls??0)+1;out.guards.phaseCalls=(out.guards.phaseCalls??0)+(o.tau?.[2]===1?1:0);if(!owner.seenCarry){owner.seenCarry=true;owner.V=o.e??owner.V;if(!owner.capturedPreCarry)capture('pre-carry',a[1],owner.field.ca,{CMeaning:'total C input, not claimed mobile',band:o.band,phase:o.tau?.[2]});}if(out.guards.carryCalls===1){out.guards.preFullPigmentIsCarrySource=out.checkpoint?.records.find(r=>r.name==='mobileP')?.id===id(a[1]);out.guards.preFullSourcesMatch=[['mobileP',a[1]],['fixedP',a[2]],['cost',o.d],['V',o.e]].every(([name,buffer])=>out.checkpoint.records.find(r=>r.name===name)?.id===id(buffer));if(!out.guards.preFullPigmentIsCarrySource||!out.guards.preFullSourcesMatch)throw Error('Full checkpoint does not capture actual first carry P/fixed/cost/V');}owner.lastCarry=a[0];out.guards.maskedCarry=(out.guards.maskedCarry??0)+(!!o.path?1:0);if(o.path&&o.origin?.[0]===64)verifyMask(o.path,64,o.band[0]);}
   if(active&&mode===19&&!owner.tide){owner.tide=true;capture('pre-group-tide-post-diffuse',owner.P,owner.C);event('group-tide-start');}
   let oldBytes=null;
   if(active&&mode===15&&input.oldOffProbe){
    if(o.path||o.tau?.[2]!==1)throw Error('OLD/OFF requires actual phase1 legacy inputs');
    const gl=e.gl;if(!oldProbe)oldProbe=new AccumulationBuffer(gl,a[0].width,a[0].height,'nearest');
    const saved=[this._fieldOpCarryProg,this._fieldOpCarryUni,this._fieldOpCarryPosLoc];
    this._fieldOpCarryProg=oldProgram.program;this._fieldOpCarryUni=oldProgram.uniforms;this._fieldOpCarryPosLoc=oldProgram.position;
    try{f.call(this,oldProbe,...a.slice(1));}finally{[this._fieldOpCarryProg,this._fieldOpCarryUni,this._fieldOpCarryPosLoc]=saved;}
    oldBytes=new Uint8Array(oldProbe.width*oldProbe.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,oldProbe.fbo);gl.readPixels(0,0,oldProbe.width,oldProbe.height,gl.RGBA,gl.UNSIGNED_BYTE,oldBytes);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   }
   const value=f.apply(this,a);
   if(oldBytes){
    const gl=e.gl,newBytes=new Uint8Array(oldBytes.length);gl.bindFramebuffer(gl.FRAMEBUFFER,a[0].fbo);gl.readPixels(0,0,a[0].width,a[0].height,gl.RGBA,gl.UNSIGNED_BYTE,newBytes);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    let different=0,max=0;for(let i=0;i<newBytes.length;i++){const d=Math.abs(newBytes[i]-oldBytes[i]);if(d)different++;if(d>max)max=d;}
    (out.oldOff??=[]).push({stride:o.origin[0],phase:o.tau[2],bytes:newBytes.length,different,max,oldSHA:browserSHA(oldBytes),newSHA:browserSHA(newBytes)});
    if(different)throw Error('Actual OLD/OFF phase1 carry differs');
   }
   if(active&&owner.tide&&mode===19&&stage===0){owner.mode19++;if(owner.mode19===2){stage=1;capture('post-both-mode19-union-seeds',owner.P,owner.C);}}
   if(active&&owner.tide&&mode===6&&stage===1){stage=2;capture('post-group-mode6',owner.P,owner.C,{bandRecord:sample('band',a[0],owner.map)});}
   if(active&&owner.tide&&mode===7&&stage===2){stage=3;capture('post-group-mode7-P-lift',owner.P,owner.C,{lift:sample('liftP',a[0],owner.map)});}
   if(active&&owner.tide&&mode===14&&stage===3){stage=4;owner.dryP=a[0];capture('post-group-mode14-dryP',owner.dryP,owner.C,{CMeaning:'wet C until reconstruction'});}
   if(active&&owner.tide&&mode===2&&stage===4&&a[1]===owner.dryP){stage=5;capture('post-group-dry-P-C',owner.dryP,a[0],{CMeaning:'actual dry reconstructed C'});checkpoint('finalField',[['dryP',owner.dryP],['dryC',a[0]],['V',owner.V],['coverage',owner.field.coverage],['cost',owner.field.pressure]],'full-target-dry-P-C');out.finalField.CMeaning='actual dry reconstructed C';owner=null;}
   return value;
  });
  if(input.oldOffProbe){
   const old=await import('/src/engine/src/raster/oldE8Shaders.ts'),gl=e.gl;
   const program=createProgram(gl,old.DISPLAY_VERT,old.WC_FIELD_OP_CARRY_FRAG);
   oldProgram={program,uniforms:getUniforms(gl,program,Object.keys(p._fieldOpCarryUni)),position:gl.getAttribLocation(program,'a_position')};
  }
  const {undoneInBatch}=await import('/src/pages/Room/undoneInBatch.ts');e.setUnpaintedInBatch(undoneInBatch(input.ops));
  const targetIndex=input.ops.findIndex(op=>op.id===input.targetId);if(targetIndex<0)throw Error('Missing target');
  let expected='prefix',busy=false;const cleanup=()=>{for(const f of undo.reverse())f();undo.length=0;if(oldProbe){oldProbe.destroy();oldProbe=null;}if(oldProgram){e.gl.deleteProgram(oldProgram.program);oldProgram=null;}if(e)e.destroy();canvas.remove();delete window.__stageEngine;out.engineClosed=true;raw.clear();delete window.__maskSolverSession};
  const run=async phase=>{
   if(busy||phase!==expected)throw Error('Split stage order '+phase+'/'+expected);busy=true;
   try{
    const list=phase==='prefix'?input.ops.slice(0,targetIndex):phase==='target'?[input.ops[targetIndex]]:phase==='suffix'?input.ops.slice(targetIndex+1):[];
    for(const op of list){currentOp=op;window.__maskSolverPhase={phase,seq:op.seq,type:op.type,id:op.id};e.appendOperation(structuredClone(op),'remote');await idle();}
    if(phase==='suffix'){e.appendOperation(input.finalDry,'remote');await idle();e.setCompositeOrder(input.strokeLayers.filter(id=>e._layers.has(id)).map(id=>({id,opacity:1})));}
    if(phase==='export'){window.__maskSolverPhase={phase:'export'};const png=await e.exportPNG(false);out.final=await new Promise(r=>{const f=new FileReader;f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(png)});}
    out.flags={packed:input.packed,costPaths:input.costPaths,phase:plan.diagnosticPlateauPhase,baked:e._wcGradientFibres,rebase:e._wcSourceFilmRebase,async:e._wcAsyncFinish,opDry:e._wcAb.opDry,partial:plan.diagnosticPartialFrontPreview??false};
    out.journal=e._log.entries.map(x=>({id:x.op.id,type:x.op.type,state:x.state,seq:x.serverSeq??null}));const debug=e.gl.getExtension('WEBGL_debug_renderer_info');out.renderer=debug?e.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):e.gl.getParameter(e.gl.RENDERER);out.gl=e.gl.getError();out.lost=e.gl.isContextLost();out.stageCount=stage;
    expected=({prefix:'target',target:'suffix',suffix:'export',export:'done'})[phase];window.__maskSolverPhase={phase:phase+'-done',expected,planes:out.planes.length};return {phase,expected,gl:out.gl,lost:out.lost,guards:out.guards,planes:out.planes.length};
   }catch(error){out.error=String(error);throw error}finally{busy=false}
  };
  window.__maskSolverSession={out,raw,run,dispose:cleanup,chunk:(key,offset,size)=>{const bytes=raw.get(key);if(!bytes)throw Error('Missing raw key');return b64(bytes.subarray(offset,offset+size));}};
  window.__maskSolverPhase={phase:'setup-done',expected};return {ready:true,targetIndex,totalOps:input.ops.length,rawBytes:0};
 }catch(err){out.error=String(err)}finally{if(!window.__maskSolverSession){for(const f of undo.reverse())f();if(oldProbe){oldProbe.destroy();oldProbe=null;}if(oldProgram){e.gl.deleteProgram(oldProgram.program);oldProgram=null;}if(e)e.destroy();canvas.remove();delete window.__stageEngine;out.engineClosed=true;}}return out;
})
