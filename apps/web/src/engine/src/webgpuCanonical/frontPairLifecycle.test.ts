import {afterEach,it,expect,vi} from 'vitest'
import {DiagnosticPassTimestamps} from './diagnosticPassTimestamps'
import {CanonicalWatercolorWebGpu} from './backend'
afterEach(()=>vi.unstubAllGlobals())
it('whole diagnostic replay lifecycle releases ACK, restores observer before map, and cleans failure stages',async()=>{
 const helperPath='../../../../../../../docs/qa/harness/728-room-native400/'
 const {installFirstMaterialTimestampWindow}=await import(helperPath+'timestamp-diagnostic.mjs')
 const {readNativeFrontMaterialRoles}=await import(helperPath+'front-material-roles.mjs')
 vi.stubGlobal('GPUBufferUsage',{QUERY_RESOLVE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8});vi.stubGlobal('GPUMapMode',{READ:1})
 for(const failure of ['none','ack','roles','map']){
  const events:string[]=[],queryDestroy=vi.fn(),buffers:Array<{destroy:ReturnType<typeof vi.fn>}>=[]
  const device={lost:new Promise(()=>{}),features:new Set(['timestamp-query']),createQuerySet:()=>({destroy:queryDestroy}),createBuffer:({size}:{size:number})=>{const b={destroy:vi.fn(),mapAsync:async()=>{events.push('map');if(failure==='map')throw Error('map failure')},getMappedRange:()=>new ArrayBuffer(size)};buffers.push(b);return b},createCommandEncoder:()=>({resolveQuerySet(){},copyBufferToBuffer(){},finish:()=>({})}),queue:{submit(){}}}
  const backend=Object.create(CanonicalWatercolorWebGpu.prototype) as CanonicalWatercolorWebGpu
  const recorder=new DiagnosticPassTimestamps(device as unknown as GPUDevice,4)
  Object.assign(backend,{device,pendingScopes:1,destroyed:false,diagnosticTimestamps:recorder,diagnosticTimestampWindow:true,retirementCleanupFailures:0})
  backend.whenIdle=async()=>{events.push('ack');if(failure==='ack')throw Error('ack failure');Object.assign(backend,{pendingScopes:0})}
  const f={width:1,height:1,format:'rgba8unorm'},field={field:f},owner={fields:{current:{pressure:field,mask:field,coverage:field}},scratch:{peek:()=>({inkLoad:field,inkColor:field})},target:{buffer:{}},adapter:{staticFrontCacheCounters:null}}
  backend.readField=async()=>{events.push('role');if(failure==='roles')throw Error('roles failure');return new Uint8Array([1,2,3,4])}
  const prior=vi.fn(),central={isIdle:true,diagnosticObserver:prior},runtime={owner,backend,central,setDiagnosticTimestampWindow:(v:boolean)=>backend.setDiagnosticTimestampWindow(v),discardDiagnosticTimestampCandidate:()=>backend.discardDiagnosticTimestampCandidate()}
  const target={addEventListener(){},removeEventListener:vi.fn()},hook=installFirstMaterialTimestampWindow(runtime,central,target,()=>10)
  let error:unknown
  try{
   hook.armReplay();central.diagnosticObserver({kind:'material',request:0,phase:'prepare:start',at:11})
   central.diagnosticObserver({kind:'material',request:0,phase:'step:start',at:12})
   const q=backend.diagnosticTimestampQuantum({beginComputePass:()=>({})} as unknown as GPUCommandEncoder)!
   q.encoder.beginComputePass({label:'Canonical waterFront'});q.commit()
   central.diagnosticObserver({kind:'material',request:0,phase:'finish:done',at:13})
   await readNativeFrontMaterialRoles({_wcNative:runtime,_wcCanonical:{pending:false},gl:{isContextLost:()=>false,getError:()=>0}},0)
   hook.restore();events.push('restore');expect(central.diagnosticObserver).toBe(prior)
   await backend.readDiagnosticTimestampsAfterInput()
  }catch(e){error=e}finally{hook.restore();hook.restore();recorder.destroy()}
  expect(queryDestroy).toHaveBeenCalledTimes(1);for(const b of buffers)expect(b.destroy).toHaveBeenCalledTimes(1)
  expect(central.diagnosticObserver).toBe(prior)
  if(failure==='none'){expect(error).toBeUndefined();expect(events.indexOf('ack')).toBeLessThan(events.indexOf('role'));expect(events.indexOf('restore')).toBeLessThan(events.indexOf('map'))}else expect(String(error)).toContain(failure+' failure')
 }
})
