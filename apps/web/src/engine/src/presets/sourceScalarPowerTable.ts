import type {BrushMipCache} from '../dabs/BrushMipCache'
import {SOURCE_SCALAR_POWER_ASSETS} from './sourceScalarPowerAssets'
export const SOURCE_SCALAR_POWER_MODES=Object.freeze(['easyDodge','easyBurn','pNormA','superLight','softLightIfs'] as const)
export type SourceScalarPowerMode=typeof SOURCE_SCALAR_POWER_MODES[number]
export const SOURCE_SCALAR_POWER_LAW='defined-scalar23-power-u8-v1' as const
export const SOURCE_SCALAR_POWER_BYTES=65536
export const SOURCE_SCALAR_POWER_CPU_BYTES=65536+512
export const SOURCE_SCALAR_POWER_STAGING_BYTES=2*65536+1024
/** An issued view, not a structural byte/provider grant. No array/callback is exposed. */
export type {SourceScalarPowerTableView} from './sourceRgba8ExecutionContext'
import type {SourceScalarPowerTableView} from './sourceRgba8ExecutionContext'
interface Data{readonly mode:SourceScalarPowerMode;readonly owner:object;readonly cpu:BrushMipCache;bytes:Uint8Array|undefined;refs:number;accepting:boolean;releaseCpu:()=>void}
const issued=new WeakMap<SourceScalarPowerTableView,Data>()
export interface SourceScalarPowerTableOwner{
 readonly mode:SourceScalarPowerMode
 readonly view:SourceScalarPowerTableView
 readonly sha256:string
 readonly byteLength:65536
 retain():()=>void
 assertCurrent(owner:object,cpu:BrushMipCache):void
 /** Copies into caller-owned, separately charged staging; the retained array never escapes. */
 copyInto(staging:Uint8Array,owner:object,cpu:BrushMipCache):void
 release():void
}
export function isSourceScalarPowerMode(mode:unknown):mode is SourceScalarPowerMode{return typeof mode==='string'&&SOURCE_SCALAR_POWER_MODES.some(value=>value===mode)}
function data(view:SourceScalarPowerTableView|undefined,mode?:SourceScalarPowerMode):Data{
 const record=view&&issued.get(view)
 if(!record||!record.bytes||record.refs<1||mode!==undefined&&record.mode!==mode)throw new TypeError('Current issued scalar power table required')
 return record
}
export function readSourceScalarPowerByte(view:SourceScalarPowerTableView|undefined,mode:SourceScalarPowerMode,source:number,destination:number):number{
 if(!Number.isInteger(source)||source<0||source>255||!Number.isInteger(destination)||destination<0||destination>255)throw new RangeError('Invalid scalar table byte coordinates')
 const bytes=data(view,mode).bytes!
 return bytes[destination*256+source]!
}
function abort(signal:AbortSignal|undefined):void{if(signal?.aborted)throw new DOMException('Scalar table preparation cancelled','AbortError')}
/** Same-origin fixed artifact only. All live arrays/staging are charged before fetch. */
export async function prepareSourceScalarPowerTable(mode:SourceScalarPowerMode,cpu:BrushMipCache,owner:object,signal?:AbortSignal):Promise<SourceScalarPowerTableOwner>{
 if(!isSourceScalarPowerMode(mode)||!owner||typeof owner!=='object')throw new TypeError('Invalid scalar table owner/mode')
 const asset=SOURCE_SCALAR_POWER_ASSETS[mode]
 if(!asset||asset.mode!==mode||asset.bytes!==65536||!/^[a-f0-9]{64}$/.test(asset.sha256)||asset.url!=='/brush-math/'+mode+'-'+asset.sha256+'.rgba')throw new TypeError('Canonical scalar artifact unavailable')
 abort(signal)
 let releasePage=cpu.reserve(SOURCE_SCALAR_POWER_CPU_BYTES),releaseStaging:undefined|(()=>void),bytes:Uint8Array<ArrayBuffer>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined
 let failed=false,primary:unknown,result:SourceScalarPowerTableOwner|undefined,transferred=false
 const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
 try{
  releaseStaging=cpu.reserve(SOURCE_SCALAR_POWER_STAGING_BYTES)
  bytes=new Uint8Array(65536)
  const response=await fetch(asset.url,{signal,cache:'no-store',credentials:'same-origin',redirect:'error'})
  abort(signal)
  if(!response.ok||!response.body)throw new Error('Canonical scalar artifact fetch failed')
  const length=response.headers.get('content-length');if(length!==null&&!response.headers.get('content-encoding')&&length!=='65536')throw new RangeError('Scalar artifact length changed')
  reader=response.body.getReader();let offset=0
  for(;;){
   abort(signal)
   const next=await reader.read()
   if(next.done)break
   if(!(next.value instanceof Uint8Array)||next.value.byteLength>65536-offset)throw new RangeError('Scalar artifact exceeds exact byte bound')
   bytes.set(next.value,offset);offset+=next.value.byteLength
  }
  if(offset!==65536)throw new RangeError('Scalar artifact is incomplete')
  reader.releaseLock();reader=undefined
  abort(signal)
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')
  if(hash!==asset.sha256)throw new TypeError('Canonical scalar artifact hash changed')
  abort(signal)
  const view:SourceScalarPowerTableView=Object.freeze({kind:'source-scalar-power-table-view-v1'})
  const record:Data={mode,owner,cpu,bytes,refs:1,accepting:true,releaseCpu:releasePage}
  issued.set(view,record)
  const drop=()=>{
   if(record.refs<1)throw new Error('Scalar table reference underflow')
   record.refs--
   if(record.refs===0){record.bytes=undefined;issued.delete(view);const release=record.releaseCpu;record.releaseCpu=()=>{};release()}
  }
  const assert=(receiver:unknown,expectedOwner:object,expectedCpu:BrushMipCache)=>{
   if(receiver!==result||expectedOwner!==owner||expectedCpu!==cpu||data(view)!==record)throw new Error('Scalar table ownership changed')
  }
  result=Object.freeze({mode,view,sha256:asset.sha256,byteLength:65536 as const,
   retain(){assert(this,owner,cpu);if(!record.accepting)throw new Error('Scalar table owner retired');record.refs++;let held=true;return()=>{if(!held)return;held=false;drop()}},
   assertCurrent(expectedOwner:object,expectedCpu:BrushMipCache){assert(this,expectedOwner,expectedCpu)},
   copyInto(staging:Uint8Array,expectedOwner:object,expectedCpu:BrushMipCache){assert(this,expectedOwner,expectedCpu);if(!(staging instanceof Uint8Array)||staging.byteLength!==65536)throw new TypeError('Exact owned scalar upload staging required');staging.set(record.bytes!)},
   release(){if(this!==result)throw new Error('Scalar table receiver changed');if(!record.accepting)return;record.accepting=false;drop()},
  })
  transferred=true;bytes=undefined
 }catch(error){failed=true;primary=error}
 finally{
  if(reader){try{await reader.cancel()}catch(error){if(!failed){failed=true;primary=error}}attempt(()=>reader!.releaseLock());reader=undefined}
  if(releaseStaging)attempt(releaseStaging)
  if(!transferred){bytes=undefined;attempt(releasePage)}
  if(failed&&result)attempt(()=>result!.release())
 }
 if(failed)throw primary
 return result!
}
