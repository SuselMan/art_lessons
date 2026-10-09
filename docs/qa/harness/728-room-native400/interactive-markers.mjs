/** Existing-method CPU markers only. Adds no GPU calls, awaits or Promise handlers. */
export function installInteractiveMarkers({engine,Runtime,Executor,BufferClass,eventTarget,now=()=>performance.now(),limit=512}){
 const rows=[],undo=[],requests=new Map(),scratchLabels=new WeakMap();let label=null,overflow=false,restored=false
 const record=(phase,rowLabel=label,strokeId=engine._strokeId)=>{if(!rowLabel||restored)return;if(rows.length>=limit){overflow=true;return}rows.push({label:rowLabel,strokeId,phase,at:now(),pending:!!engine._wcCanonical?.pending,settling:!!engine._settle})}
 const associate=()=>{const scratch=engine._ribbonStrokeScratch;if(scratch&&engine._strokeId){let gestures=scratchLabels.get(scratch);if(!gestures){gestures=new Map();scratchLabels.set(scratch,gestures)}gestures.set(scratch.gesture,{label,strokeId:engine._strokeId})}}
 const wrap=(prototype,key,phase)=>{const original=prototype[key];if(typeof original!=='function')throw Error('Required interactive original method absent: '+key);const wrapped=function(...args){
  let owner={label,strokeId:engine._strokeId}
  if(phase==='consume'&&args[2]==='live'&&args[0]?.input?.materialEnabled&&!args[0]?.auxiliary){associate();const scratch=args[0].scratch;owner=scratchLabels.get(scratch)?.get(scratch.gesture);if(Number.isInteger(this.ordinal)&&owner){if(requests.size>=limit)overflow=true;else requests.set(this.ordinal,owner)}}
  if(phase==='source')owner=requests.get(args[0]?.ordinal)
  const rowLabel=owner?.label??'unattributed',id=owner?.strokeId
  record(phase+':entry',rowLabel,id);try{return original.apply(this,args)}finally{record(phase+':return',rowLabel,id);if(phase==='source')requests.delete(args[0]?.ordinal)}
 };prototype[key]=wrapped;undo.push(()=>{if(prototype[key]===wrapped)prototype[key]=original})}
 const down=e=>{if(e.pointerType==='pen')record('pointerdown')},up=e=>{if(e.pointerType==='pen'){associate();record('pointerup')}}
 const removeListeners=()=>{eventTarget.removeEventListener('pointerdown',down,true);eventTarget.removeEventListener('pointerup',up,true)}
 try{wrap(Runtime.prototype,'consume','consume');wrap(Executor.prototype,'emitPrepared','source');wrap(BufferClass.prototype,'restoreCanvasPixels','canvasPublication');eventTarget.addEventListener('pointerdown',down,true);eventTarget.addEventListener('pointerup',up,true)}catch(error){removeListeners();for(const restore of undo.reverse())restore();throw error}
 return{rows,get overflow(){return overflow},setLabel(value){label=value},restore(){if(restored)return;restored=true;removeListeners();for(const restore of undo.reverse())restore();requests.clear()}}
}
export function assertInteractiveMarkers({rows,overflow,readyAt,labels}){
 if(overflow||!Array.isArray(rows)||labels?.length!==2)throw Error('Bounded two interactive labels required')
 return labels.map(label=>{const own=rows.filter(x=>x.label===label),down=own.filter(x=>x.phase==='pointerdown'),up=own.filter(x=>x.phase==='pointerup'),source=own.find(x=>x.phase==='source:entry'&&x.strokeId===up[0]?.strokeId),publication=own.find(x=>x.phase==='canvasPublication:entry'&&x.at>=(source?.at??Infinity));if(down.length!==1||up.length!==1||!up[0].strokeId||!source||!publication||!(readyAt<=down[0].at)||!(down[0].at<=source.at)||!(source.at<=publication.at)||!(down[0].at<=up[0].at))throw Error('Interactive original marker order/READY missing');return{label,downAt:down[0].at,nextPendingAtDown:down[0].pending,nextSettlingAtDown:down[0].settling,downToSourceEntryWallMs:source.at-down[0].at,downToCanvasPublicationEntryWallMs:publication.at-down[0].at,scope:'Own-stroke source JS entry; next canvas publication call may include prior work, not physical first pixel or GPU duration'}})
}
