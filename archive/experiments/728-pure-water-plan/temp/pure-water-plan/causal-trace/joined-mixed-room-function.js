async function joinedMixedRoom(input) {
  const e=window.__engine,s=window.__roomStore?.getState();
  if(!e||!s||!s.userId||s.userId==='local'||e._userId!==s.userId)throw Error('Actual Room actor mismatch');
  if(e._strokeLayerId||e._settle||e._wcCanonical.pending||e._contextLost||e.gl.isContextLost())throw Error('Initial Room not idle');
  if(e._wcAsyncFinish||e._wcMaterialPresentation||!e._wcSourceFilmRebase||e._settlePlan.splitQuanta)throw Error('Immutable physical flags mismatch');
  if(!('_wcJoinedTouchMixed' in e))throw Error('Mixed candidate missing');
  await e.paperReady();
  const original=e._paintStrokeDabs,previous=[e._wcJoinedTouch,e._wcJoinedTouchMixed],tape=[[[220,300],[500,300],[720,320]],[[430,310],[650,330],[840,340]]];
  const beforeIDs=new Set(e.getOperations().map(x=>x.id));let gesture=0,seeded=false,scratch;
  const stages=[];e._wcJoinedTouch=input.on;e._wcJoinedTouchMixed=input.on;
  e._paintStrokeDabs=function(...args){if(!seeded){this._strokeId='mixed-fixed-'+gesture;if(!gesture){this._washId='mixed-fixed-wash';if(this._wash)this._wash.id=this._washId}seeded=true}return original.apply(this,args)};
  const sample=(p,n)=>({x:p[0],y:p[1],pressure:.8,tiltX:0,tiltY:0,twist:0,speed:0,timeStamp:1000+n*16,pointerType:'pen'});
  const stable=value=>JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
  const withoutSeq=op=>{const result={...op};delete result.seq;return result};
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  try{
    for(gesture=0;gesture<2;gesture++){
      seeded=false;e.setTool('watercolor');e.setSize(32);
      e.setPencil(gesture===0&&input.kind==='water'?'normal:100:0:PB29:round':'normal:100:100:PB29:round');
      e.setColor(gesture===0?[.22,0,.6]:[.8,.05,.02]);
      if(gesture&&input.noOverlap)e._completeSettle();
      const old=e._settle,p=tape[gesture],at=performance.now();e._onStart(sample(p[0],gesture*10));
      if(!e._strokeLayerId||!e._ribbonStrokeScratch)throw Error('Native input refused');
      scratch=e._ribbonStrokeScratch;
      if(gesture&&!input.noOverlap){
        if(input.on&&(!old||e._settle!==old||e._wcJoinedTouchLease!==old))throw Error('Mandatory mixed overlap absent');
        if(!input.on&&e._settle)throw Error('OFF did not drain');
      }
      e._onMove(sample(p[1],gesture*10+1));e._onMove(sample(p[2],gesture*10+2));
      const commands=scratch.runningSourceCommands.length;if(gesture&&!input.noOverlap&&input.on&&!commands)throw Error('Mandatory mixed source commands absent');const up=performance.now();e._onEnd(sample(p[2],gesture*10+3));
      stages.push({gesture,downAndMoveMs:up-at,upMs:performance.now()-up,oldOps:old?.ops.length??0,oldNext:old?.next??0,commands});
    }
    e._completeSettle();
    if(!scratch)throw Error('Retained native scratch absent');
    const fields=[];
    const inspect=async(label,b)=>{if(!b){fields.push({label,absent:true});return}const bytes=b.readPixels();let nonzero=0;for(const x of bytes)nonzero+=x!==0;fields.push({label,bytes:bytes.length,sha:await hash(bytes),nonzero})};
    const scratchKeys=['original','coverage','inkLoad','inkColor','inkDry','colorDry','solventLoad','solventBase','inkBase','colorBase','strokeInk','strokeColor','inkSettled','colorSettled'];
    let tile=0;for(const [,entry]of scratch.tileEntries()){for(const key of scratchKeys)await inspect('tile'+tile+':'+key,entry[key]);tile++}
    for(let i=0;i<e._fieldCache.length;i++)for(const key of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'])await inspect('field'+i+':'+key,e._fieldCache[i][key]);
    if(!tile||!e._fieldCache.length||fields.length<24)throw Error('Mandatory 24 field roles absent');
    for(const key of ['inkLoad','inkColor','coverage','solventLoad'])if(!fields.some(x=>x.label.endsWith(':'+key)&&x.nonzero>0))throw Error('Mandatory nonzero '+key);
    const deadline=performance.now()+30000;while(e._log.entries.some(x=>x.pending)){if(performance.now()>deadline)throw Error('Authoritative ACK deadline');await new Promise(r=>setTimeout(r,50))}
    const journal=e.getOperations().filter(x=>!beforeIDs.has(x.id)),material=journal.map(op=>{const result={...op};for(const key of ['id','userId','layerId','timestamp','seq'])delete result[key];return result});
    if(journal.filter(x=>x.type==='stroke').length!==2)throw Error('Mandatory two accepted strokes');
    const expected=e.getOperations(),expectedIDs=expected.map(x=>x.id),roomId=s.room.id;
    window.__joinedMixedPartial={input,stages,fields,material,journal,expectedIDs,roomId};
    const beforeSeq=Math.max(...e._log.entries.map(x=>x.serverSeq??0))+1;if(!Number.isInteger(beforeSeq)||beforeSeq<3)throw Error('Authoritative seq missing');
    const {api}=await import('/src/lib/api/api.ts');let persisted=[];const storageDeadline=performance.now()+30000;
    while(true){persisted=await api('GET /api/rooms/:roomId/operations',{params:{roomId},query:{beforeSeq,limit:500}});
      if(expectedIDs.every(id=>persisted.some(x=>x.id===id)))break;
      if(performance.now()>storageDeadline)throw Error('Room-specific durable storage missing IDs '+JSON.stringify(expectedIDs.filter(id=>!persisted.some(x=>x.id===id))));await new Promise(r=>setTimeout(r,250))}
    for(const actual of expected){const stored=persisted.find(x=>x.id===actual.id);if(stable(withoutSeq(actual))!==stable(withoutSeq(stored)))throw Error('Stored payload differs from accepted '+actual.id)}
    const durability={roomId,expectedIDs,storedIDs:persisted.map(x=>x.id),storedOperations:persisted,strokeCount:persisted.filter(x=>x.type==='stroke').length,allExpectedPersisted:true,fullPayloadEqual:true};
    const materialSHA=await hash(new TextEncoder().encode(stable(material)));
    const png=await e.exportPNG(true);if(!png)throw Error('Whole export absent');
    const image=await createImageBitmap(png),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let alpha=0;for(let k=3;k<rgba.length;k+=4)alpha+=rgba[k]>0;if(!alpha)throw Error('Whole export empty');
    const whole={sha:await hash(rgba),alpha,width:canvas.width,height:canvas.height};canvas.width=canvas.height=0;
    const pngData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(png)});
    const gl=e.gl.getError();if(gl||e.gl.isContextLost())throw Error('GL/loss '+gl);
    return{input,actor:s.userId,room:s.room,stages,fields,material,materialSHA,journal,durability,whole,pngData,gl,gpu:e.gpuInfo(),model:{async:e._wcAsyncFinish,material:e._wcMaterialPresentation,rebase:e._wcSourceFilmRebase,split:e._settlePlan.splitQuanta},scope:'Native mixed fixed tape; full 14 scratch +10 solver roles per tile/field, absent roles explicit; no-overlap separate; realtime packed wet/time retained; CPU submit times not GPU latency'};
  }finally{e._paintStrokeDabs=original;[e._wcJoinedTouch,e._wcJoinedTouchMixed]=previous}
}
