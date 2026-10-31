import {buildCanonicalMaterial,decodeCanonicalStrokeFrame,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeRasterProfile,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2} from '@grafetto/shared'

/** Captured typed socket; disconnect invalidates this one request. */
export interface CanonicalBeginEmitter {
 emit(event:'canonical_stroke_begin',input:CanonicalStrokeBegin,ack:(result:CanonicalStrokeBeginResult)=>void):unknown
 on(event:'disconnect',listener:()=>void):unknown
 off(event:'disconnect',listener:()=>void):unknown
}
export interface CanonicalBeginLifetime {
 readonly boardEpoch:number
 /** Captured caller execution policy; never selected from received ACK data. */
 readonly rasterProfile?:CanonicalStrokeRasterProfile
 /** Caller compares captured socket/room/user/layer/context generations. */
 readonly isCurrent:()=>boolean
 readonly signal?:AbortSignal
 readonly timeoutMs?:number
}
export type AcceptedCanonicalBegin = {readonly ok:true;readonly snapshot:CanonicalStrokeSnapshotV2;readonly recordedNext:number;readonly liveNext:number;readonly ended:boolean}
export type CanonicalBeginOutcome = AcceptedCanonicalBegin | Extract<CanonicalStrokeBeginResult,{ok:false}>
const closed=(v:object,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<Number.MAX_SAFE_INTEGER
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.freeze(v);for(const c of Object.values(v))if(c&&typeof c==='object'&&!Object.isFrozen(c))freeze(c)}return v}
function validate(result:CanonicalStrokeBeginResult,input:CanonicalStrokeBegin,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalBeginOutcome {
 if(!result||typeof result!=='object')throw Error('Invalid canonical BEGIN verdict')
 if(result.ok===false){
  if(!closed(result,['ok','reason']))throw Error('Invalid canonical BEGIN verdict fields')
  if(!['invalid_operation','not_joined','server_error','canonical_repair_required'].includes(result.reason))throw Error('Invalid canonical BEGIN rejection')
  return Object.freeze({ok:false,reason:result.reason})
 }
 if(!closed(result,['ok','snapshot','recordedNext','liveNext','ended']))throw Error('Invalid canonical BEGIN verdict fields')
 // Admission retains at most eight speculative live frames; recorded-only
 // reconnect prefixes may legitimately be ahead of the live cursor.
 if(result.ok!==true||!integer(result.recordedNext)||!integer(result.liveNext)||result.liveNext>result.recordedNext+8||typeof result.ended!=='boolean')throw Error('Invalid canonical BEGIN cursor')
 const s=result.snapshot
 if(!s||!('materialVersion' in s)||s.materialVersion!==2)throw Error('Unsupported canonical BEGIN snapshot V1')
 if(!closed(s,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material']))throw Error('Invalid canonical BEGIN snapshot fields')
 if(s.layerId!==input.layerId||s.brush!==input.brush||s.strokeId!==input.strokeId||s.boardEpoch!==epoch||s.rasterProfile!==rasterProfile
  ||!Array.isArray(s.pigmentRgb8)||s.pigmentRgb8.length!==3||s.pigmentRgb8.some((v,i)=>v!==input.pigmentRgb8[i])
  ||s.composition?.outerResourceOpacity!==input.outerResourceOpacity||s.composition?.alphaDarken!==input.alphaDarken
  ||!s.material||s.material.version!==2||s.material.maskSource!==undefined||!Array.isArray(s.assets)||s.assets.length!==0||s.material.assets.length!==0)throw Error('Canonical BEGIN resource mismatch')
 const p=s.material.primarySource
 if(!p||p.kind==='image'||p.descriptorSha256!==s.descriptorSha256||s.brush!==`brush:${p.descriptorId}@${p.descriptorVersion}`||p.brushScale!==1||p.kind==='softAuto'&&p.sourceSlot!==0)throw Error('Canonical BEGIN descriptor mismatch')
 // One actual shared boundary validates the full closed material/source pin,
 // budget, profile, pigment and composition. No client-side schema substitute.
 const probe=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},s.material)
 decodeCanonicalStrokeFrame({version:rasterProfile===CANONICAL_STROKE_RASTER_PROFILE?1:2,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:probe.packed},
  {rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:s.material})
 const copy=structuredClone(s)
 return freeze({ok:true,snapshot:copy,recordedNext:result.recordedNext,liveNext:result.liveNext,ended:result.ended})
}
/** One BEGIN attempt. No retry, queue, outbox or author/session ownership. */
export function sendCanonicalStrokeBegin(socket:CanonicalBeginEmitter|null,input:CanonicalStrokeBegin,lifetime:CanonicalBeginLifetime):Promise<CanonicalBeginOutcome>{
 return new Promise((resolve,reject)=>{
  if(!socket){reject(Error('canonical BEGIN: no active socket'));return}
  const {boardEpoch,isCurrent,signal}=lifetime
  const rasterProfile=lifetime.rasterProfile===undefined?CANONICAL_STROKE_RASTER_PROFILE:lifetime.rasterProfile
  const timeout=lifetime.timeoutMs??5000
  if(rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE&&rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE){reject(Error('Invalid canonical BEGIN raster profile'));return}
  if(!integer(boardEpoch)||!Number.isSafeInteger(timeout)||timeout<=0||timeout>2147483647){reject(Error('Invalid canonical BEGIN lifetime'));return}
  const request=freeze({layerId:input.layerId,brush:input.brush,strokeId:input.strokeId,pigmentRgb8:[...input.pigmentRgb8] as [number,number,number],outerResourceOpacity:input.outerResourceOpacity,alphaDarken:input.alphaDarken})
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined,registered=false,abortRegistered=false
  const finish=(error?:unknown,value?:CanonicalBeginOutcome)=>{
   if(settled)return;settled=true
   if(timer!==undefined)clearTimeout(timer)
   let cleanupError:unknown
   try{if(registered)socket.off('disconnect',disconnected)}catch(e){cleanupError=e}
   try{if(abortRegistered)signal!.removeEventListener('abort',aborted)}catch(e){cleanupError??=e}
   if(error!==undefined||cleanupError!==undefined)reject(error??cleanupError);else resolve(value!)
  }
  const disconnected=()=>finish(Error('Canonical BEGIN socket disconnected'))
  const aborted=()=>finish(Error('Canonical BEGIN aborted'))
  try{
   if(signal?.aborted||!isCurrent()){finish(Error('Stale canonical BEGIN lifetime'));return}
   registered=true;socket.on('disconnect',disconnected)
   if(settled)return
   if(signal){abortRegistered=true;signal.addEventListener('abort',aborted,{once:true})}
   if(settled)return
   if(signal?.aborted){aborted();return}
   timer=setTimeout(()=>finish(Error('Canonical BEGIN timed out')),timeout)
   socket.emit('canonical_stroke_begin',request,result=>{
    if(settled)return
    try{if(signal?.aborted||!isCurrent())throw Error('Stale canonical BEGIN lifetime');finish(undefined,validate(result,request,boardEpoch,rasterProfile))}catch(e){finish(e)}
   })
  }catch(e){finish(e)}
 })
}
