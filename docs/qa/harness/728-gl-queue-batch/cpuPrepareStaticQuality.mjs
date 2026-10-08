/* Standalone hardware diagnostic: no Room/server/ACK/persistence proof. */
export async function runCpuPrepareStaticQuality(input) {
  const {PencilEngine}=await import(input.engineUrl);
  const ownedCanvas=document.createElement('canvas');ownedCanvas.width=ownedCanvas.height=1024;
  document.querySelector('#surface').replaceChildren(ownedCanvas);
  const e=new PencilEngine(ownedCanvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'standalone-qa',joinedTouch:true,joinedFinishDeferred:input.deferred??false,gradientFibres:true});
  window.__standaloneMixedEngine=e;e._settleQueue.diagnosticSolverBatchEnabled=true;
  await e.paperReady();
  e.appendOperation({id:'layer-0',type:'layer_add',userId:'standalone-qa',timestamp:1791400000000,layerId:'L',name:'QA'},'remote');
  e.setLocked(false);e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setViewport(512,512,1,0);
  if(e._strokeLayerId||e._settle||e._wcCanonical.pending||e._contextLost||e.gl.isContextLost())throw Error('Initial Room not idle');
  if(e._wcAsyncFinish||e._wcMaterialPresentation||!e._wcSourceFilmRebase||e._settlePlan.splitQuanta)throw Error('Immutable physical flags mismatch');
  if(!('_wcJoinedFinishDeferred' in e))throw Error('Deferred finish candidate missing');
  await e.paperReady();
  const lazyCounts=await(await import(input.installerUrl)).installCpuPrepareStatic(e,input.lazy,input.generatedUrl);
  const original=e._paintStrokeDabs,tape=[[[220,300],[500,300],[720,320]],[[430,310],[650,330],[840,340]]];
  const beforeIDs=new Set(e.getOperations().map(x=>x.id));let gesture=0,seeded=false,scratch;
  const stages=[];if(!e._wcJoinedTouch||e._wcJoinedFinishDeferred!==(input.deferred??false))throw Error('Required narrow joined/deferred baseline absent');
  if(typeof input.on!=='boolean')throw Error('Explicit ONE mixed flag required');e._wcJoinedTouchMixed=input.on;
  if(input.kind!=='water-pigment')throw Error('Only controlled water→pigment first-pixel fixture approved');
  let completeCalls=0;const originalComplete=e._completeSettle;e._completeSettle=function(...args){completeCalls++;return originalComplete.apply(this,args)};
  window.__joinedMixedPartial={input,stages};
  e._paintStrokeDabs=function(...args){if(!seeded){this._strokeId='deferred-fixed-'+gesture;if(!gesture){this._washId='deferred-fixed-wash';if(this._wash)this._wash.id=this._washId}seeded=true}return original.apply(this,args)};
  const sample=(p,n)=>({x:p[0],y:p[1],pressure:.8,tiltX:0,tiltY:0,twist:0,speed:0,timeStamp:1000+n*16,pointerType:'pen'});
  const stable=value=>JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
  const withoutSeq=op=>{const result={...op};delete result.seq;return result};
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  try{
    for(gesture=0;gesture<2;gesture++){
      seeded=false;e.setTool('watercolor');e.setSize(400);
      e.setPencil(gesture===0?'normal:100:0:PB29:round':'normal:100:100:PB29:round');
      e.setColor([.22,0,.6]);
      if(gesture&&input.noOverlap)e._completeSettle();
      const old=e._settle,p=tape[gesture],callsBefore=completeCalls,oldBefore={present:!!old,next:old?.next??null,length:old?.ops.length??null,metadataPreset:old?e._wcJoinedTouchInputs.get(old)?.preset:null,lease:!!e._wcJoinedTouchLease},at=performance.now();e._onStart(sample(p[0],gesture*10));
      const downCpuMs=performance.now()-at;const downAdmission={oldBefore,oldStillCurrent:e._settle===old,leaseEqualsOld:!!old&&e._wcJoinedTouchLease===old,completeCalls:completeCalls-callsBefore};stages.push({gesture,downCpuMs,downAdmission});
      scratch=e._ribbonStrokeScratch;
      if(gesture&&!input.noOverlap){if(!old)throw Error('Predecessor solver absent');if(input.on&&(e._settle!==old||e._wcJoinedTouchLease!==old||downAdmission.completeCalls))throw Error('ON mixed admission absent');if(!input.on&&(e._settle===old||e._wcJoinedTouchLease===old||!downAdmission.completeCalls))throw Error('OFF mixed rejection barrier absent')}
      e._onMove(sample(p[1],gesture*10+1));e._onMove(sample(p[2],gesture*10+2));
      const commands=scratch.runningSourceCommands.length;if(gesture&&!input.noOverlap&&input.on&&!commands)throw Error('Mandatory mixed source commands absent');const up=performance.now();e._onEnd(sample(p[2],gesture*10+3));
      Object.assign(stages.at(-1),{downAndMoveMs:up-at,upMs:performance.now()-up,oldOps:old?.ops.length??0,oldNext:old?.next??0,commands,held:!!e._wcJoinedDeferred,oldStillCurrent:e._settle===old});
      if(gesture&&!input.noOverlap&&input.on&&!!e._wcJoinedDeferred!==(input.deferred??false))throw Error('Deferred UP ownership mismatch');
    }
    // No synchronous completion and no readback during input/canonical tail.
    const liftedAt=performance.now(),rafIntervals=[];let lastFrame=liftedAt,observing=true;
    const frame=now=>{if(!observing)return;const measured=performance.now();rafIntervals.push(measured-lastFrame);lastFrame=measured;requestAnimationFrame(frame)};requestAnimationFrame(frame);
    const waitDeadline=liftedAt+240000;
    try{while(e._settle||e._wcJoinedDeferred){if(e._wcJoinedRecoveryLayers.size||e._wcJoinedDeferredError!==null)throw Error('Canonical failure '+String(e._wcJoinedDeferredError));if(performance.now()>waitDeadline)throw Error('Natural canonical completion deadline');await new Promise(r=>setTimeout(r,25))}}finally{observing=false}
    const settleDurationMs=performance.now()-liftedAt;
    const timing={note:'CPU rAF callback wall intervals; not guaranteed display pixels',settleDurationMs,rafIntervals,maxRafMs:Math.max(0,...rafIntervals),over33:rafIntervals.filter(x=>x>33).length,over100:rafIntervals.filter(x=>x>100).length};
    if(!scratch)throw Error('Retained native scratch absent');
    const fields=[];window.__joinedMixedPartial.timing=timing;window.__joinedMixedPartial.fields=fields;
    const inspect=async(label,b)=>{if(!b){fields.push({label,absent:true});return}const bytes=b.readPixels();if(bytes.length!==b.width*b.height*4)throw Error('Actual field dimensions/bytes mismatch '+label);let nonzero=0;for(const x of bytes)nonzero+=x!==0;fields.push({label,bytes:bytes.length,width:b.width,height:b.height,sha:await hash(bytes),nonzero})};
    const scratchKeys=['original','coverage','inkLoad','inkColor','inkDry','colorDry','solventLoad','solventBase','inkBase','colorBase','strokeInk','strokeColor','inkSettled','colorSettled'];
    let tile=0;for(const [,entry]of scratch.tileEntries()){for(const key of scratchKeys)await inspect('tile'+tile+':'+key,entry[key]);tile++}
    for(let i=0;i<e._fieldCache.length;i++)for(const key of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'])await inspect('field'+i+':'+key,e._fieldCache[i][key]);
    if(!tile||!e._fieldCache.length||fields.length<24)throw Error('Mandatory 24 field roles absent');
    for(const key of ['inkLoad','inkColor','coverage'])if(!fields.some(x=>x.label.endsWith(':'+key)&&x.nonzero>0))throw Error('Mandatory nonzero '+key);
    const journal=e.getOperations().filter(x=>!beforeIDs.has(x.id)),material=journal.map(op=>{const result={...op};for(const key of ['id','userId','layerId','timestamp','seq'])delete result[key];return result});
    if(journal.filter(x=>x.type==='stroke').length!==2)throw Error('Mandatory two local strokes');
    const materialSHA=await hash(new TextEncoder().encode(stable(material)));
    const png=await e.exportPNG(true);if(!png)throw Error('Whole export absent');
    const image=await createImageBitmap(png),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let alpha=0;for(let k=3;k<rgba.length;k+=4)alpha+=rgba[k]>0;if(!alpha&&input.kind!=='water')throw Error('Whole export empty');
    const whole={sha:await hash(rgba),alpha,width:canvas.width,height:canvas.height};canvas.width=canvas.height=0;
    const idle=async()=>{const deadline=performance.now()+60000;while(e._settle||e._rebuildJobs.size||e._unsettledLayers.size){if(performance.now()>deadline)throw Error('History timeout');await new Promise(r=>requestAnimationFrame(r))}};
    const layerHash=async()=>{const out=[];for(const tile of e._layers.get('L').allResident())out.push({x:tile.originX,y:tile.originY,sha:await hash(tile.buffer.readPixels())});return JSON.stringify(out)};
    const beforeUndo=await layerHash();e.undo();await idle();const afterUndo=await layerHash();e.redo();await idle();const afterRedo=await layerHash();const history={undoMeaningful:beforeUndo!==afterUndo,redoExact:beforeUndo===afterRedo};
    const gl=e.gl.getError();if(gl||e.gl.isContextLost())throw Error('GL/loss '+gl);
    if(!lazyCounts.captured||(input.lazy?lazyCounts.counts.units<=0:lazyCounts.counts.units!==0))throw Error("Captured metadata absent");
    return{lazyCounts,input,actor: e._userId,stages,timing,fields,material,materialSHA,journal,whole,history,gl,gpu:e.gpuInfo(),model:{deferred:e._wcJoinedFinishDeferred,joined:e._wcJoinedTouch,mixed:e._wcJoinedTouchMixed,async:e._wcAsyncFinish,material:e._wcMaterialPresentation,rebase:e._wcSourceFilmRebase,split:e._settlePlan.splitQuanta},scope:'Queue ON; deferred explicitly reported in model. No post-DOWN readback. Standalone actual-engine fixed400 water→pigment; ONE mixed flag; No physical pen/compositor/FPS proof; no Room, server, ACK or persistence gate; natural finish/fields gates separate'};
  }finally{e._paintStrokeDabs=original;e._completeSettle=originalComplete;e.destroy();window.__standaloneMixedEngine=null;}
}
