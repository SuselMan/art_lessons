async function zeroNegatives(){
 const {PencilEngine}=await import('/src/engine/index.ts?qa=321d-zero-negative');
 const {RibbonStrokeScratch}=await import('/src/engine/src/buffers/RibbonStrokeScratch.ts');
 const {ribbonProfileFor}=await import('/src/engine/src/dabs/ribbonProfile.ts');
 const results=[];const water='normal:100:0:PB29:round';
 const dab=(x,y)=>({x,y,pressure:1,tiltX:0,tiltY:0,size:12,aspectRatio:1,angle:0,opacity:1,t:0});
 for(const mode of ['peer-same','peer-other','pending-undo','loaded']){
  const c=document.createElement('canvas');c.width=c.height=256;document.body.append(c);const e=new PencilEngine(c,{pageWidth:64,pageHeight:64,paper:'flat'});
  try{
   e.setBaseLayers(['L','other']);e.setActiveLayer('L');await e.paperReady();e._wcZeroPigmentContacts=true;
   let peer=null;
   if(mode.startsWith('peer')){e.appendPeerLiveDabs('peer',{strokeId:'unrecorded',layerId:mode==='peer-same'?'L':'other',packetSeq:0,tool:'pencil',preset:'HB',color:[0,0,0],dabs:[dab(20,20)]});peer=[...e._peerLiveStrokes.values()].map(x=>({painted:x.paintedTotal,committed:x.committedOffset}));if(!peer.some(x=>x.painted>x.committed))throw Error('actual peer paint guard');}
   if(mode==='pending-undo'||mode==='loaded'){e.appendOperation({id:'loaded',type:'stroke',userId:'qa',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],dabs:[dab(20,20)],timestamp:1,seq:1},'remote');if(mode==='pending-undo'){e.suspendDisplay();e.appendOperation({id:'undo',type:'operation_undo',userId:'qa',targetOpId:'loaded',timestamp:2,seq:2},'remote');if(!e._pendingRebuilds.has('L'))throw Error('real pending Undo absent');}}
   const target=e._layers.get('L'),scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true),preset=e._resolvePreset('watercolor',water),profile=ribbonProfileFor('watercolor',water);
   try{for(const op of e._ribbonPainter.paint(target,[dab(12,24),dab(40,24)],preset,water,profile,[.2,0,.6],scratch,undefined))void op;
    if(!scratch.pigmentInputsKnownZero||scratch.finishContext.target!==target)throw Error('owned zero scratch');
    const original=e._settlePlan.prepare;let skip=null;e._settlePlan.prepare=function(...a){skip=a[11];return null};try{e._diffuseWashOps(scratch,[],{minX:8,minY:8,maxX:48,maxY:48})}finally{e._settlePlan.prepare=original};const expected=mode==='peer-other';if(skip!==expected)throw Error('guard '+mode+' got '+skip);results.push({mode,skip,expected,peer,pendingUndo:e._pendingRebuilds.has('L'),gl:e.gl.getError(),lost:e.gl.isContextLost()});
   }finally{scratch.destroy()}
  }finally{e.destroy();c.remove()}
 }
 return results;
}
