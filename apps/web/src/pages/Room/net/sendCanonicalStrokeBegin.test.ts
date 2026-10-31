import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalSoftAutoSourcePin,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2} from '@grafetto/shared'
import type {Socket} from 'socket.io-client'
import type {ServerToClientEvents,ClientToServerEvents} from '@grafetto/shared'
import {sendCanonicalStrokeBegin,type CanonicalBeginEmitter} from './sendCanonicalStrokeBegin'
// Compile-time assertion: the real Room socket satisfies the structural seam.
const acceptsSocket=(socket:Socket<ServerToClientEvents,ClientToServerEvents>):CanonicalBeginEmitter=>socket
void acceptsSocket
const input=():CanonicalStrokeBegin=>({layerId:'L',brush:'brush:soft@1',strokeId:'S',pigmentRgb8:[1,2,3],outerResourceOpacity:.7,alphaDarken:'hard'})
function answer():CanonicalStrokeBeginResult{
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.7,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource,budget:{workUnits:1000,outputBytes:4000,drawPixels:1000}}}
 return {ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
}
function socket(){
 let ack!:(result:CanonicalStrokeBeginResult)=>void
 const listeners=new Set<()=>void>(),sent:CanonicalStrokeBegin[]=[]
 const emitter:CanonicalBeginEmitter={emit:vi.fn((_e,data,callback)=>{sent.push(data);ack=callback}),on:(_e,listener)=>{listeners.add(listener)},off:(_e,listener)=>{listeners.delete(listener)}}
 return {emitter,sent,listeners,ack:(result=answer())=>ack(result),disconnect:()=>{for(const fn of [...listeners])fn()}}
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{expect(vi.getTimerCount()).toBe(0);vi.useRealTimers()})
it('copies request before ACK and deep-freezes the validated server soft pin',async()=>{
 const rgb:[number,number,number]=[1,2,3]
 const s=socket(),request={...input(),pigmentRgb8:rgb},result=answer(),pending=sendCanonicalStrokeBegin(s.emitter,request,{boardEpoch:2,isCurrent:()=>true})
 rgb[0]=99
 expect(s.sent[0].pigmentRgb8).toEqual([1,2,3]);s.ack(result)
 const accepted=await pending;if(!accepted.ok||!result.ok)throw Error('Expected success')
 expect(accepted.snapshot).not.toBe(result.snapshot);const pin=accepted.snapshot.material.primarySource
 if(pin.kind!=='softAuto')throw Error('Expected soft')
 expect(Object.isFrozen(pin.radialCurve.coefficients[0])).toBe(true);expect(s.listeners.size).toBe(0)
})
it.each(['timeout','abort','disconnect','stale','throw'] as const)('rejects %s and ignores a late ACK with no listener/timer leak',async kind=>{
 const s=socket(),controller=new AbortController();let current=true
 if(kind==='throw')vi.mocked(s.emitter.emit).mockImplementation(()=>{throw Error('emit failed')})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>current,signal:controller.signal,timeoutMs:50}),rejected=expect(pending).rejects.toThrow()
 if(kind==='timeout')vi.advanceTimersByTime(50)
 if(kind==='abort')controller.abort()
 if(kind==='disconnect')s.disconnect()
 if(kind==='stale'){current=false;s.ack()}
 await rejected;if(kind!=='throw')s.ack();expect(s.listeners.size).toBe(0)
})
it('does not emit on an already expired captured lifetime and returns a server refusal',async()=>{
 const s=socket();await expect(sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>false})).rejects.toThrow('Stale')
 expect(s.emitter.emit).not.toHaveBeenCalled()
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true});s.ack({ok:false,reason:'canonical_repair_required'})
 await expect(pending).resolves.toEqual({ok:false,reason:'canonical_repair_required'});expect(s.listeners.size).toBe(0)
})
it.each(['layer','brush','stroke','RGB','opacity','alpha','epoch','SHA','profile','radial','mask','V1','cursor'] as const)('rejects a mismatched %s server capability',async field=>{
 const s=socket(),result=structuredClone(answer());if(!result.ok||!('materialVersion' in result.snapshot))throw Error('Expected V2')
 const snapshot=result.snapshot,pin=snapshot.material.primarySource
 if(field==='layer')Object.assign(snapshot,{layerId:'other'})
 if(field==='brush')Object.assign(snapshot,{brush:'brush:other@1'})
 if(field==='stroke')Object.assign(snapshot,{strokeId:'other'})
 if(field==='RGB')Object.assign(snapshot,{pigmentRgb8:[9,2,3]})
 if(field==='opacity')Object.assign(snapshot.composition,{outerResourceOpacity:.8})
 if(field==='alpha')Object.assign(snapshot.composition,{alphaDarken:'creamy'})
 if(field==='epoch')Object.assign(snapshot,{boardEpoch:3})
 if(field==='SHA')Object.assign(snapshot,{descriptorSha256:'c'.repeat(64)})
 if(field==='profile')Object.assign(snapshot,{rasterProfile:'foreign'})
 if(field==='radial'&&pin.kind==='softAuto')Object.assign(pin.radialCurve,{coefficients:[]})
 if(field==='mask')Object.assign(snapshot.material,{maskSource:pin})
 if(field==='V1')Reflect.deleteProperty(snapshot,'materialVersion')
 if(field==='cursor')Object.assign(result,{recordedNext:-1})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true});const rejected=expect(pending).rejects.toThrow();s.ack(result);await rejected;expect(s.listeners.size).toBe(0)
})
it.each(['disconnect','abort'] as const)('stops registration after synchronous %s reentry',async kind=>{
 const s=socket(),controller=new AbortController(),remove=vi.spyOn(controller.signal,'removeEventListener')
 if(kind==='disconnect')s.emitter.on=(_event,listener)=>{s.listeners.add(listener);listener()}
 else {
  const add=controller.signal.addEventListener.bind(controller.signal)
  vi.spyOn(controller.signal,'addEventListener').mockImplementation((...args)=>{add(...args);controller.abort()})
 }
 await expect(sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,signal:controller.signal})).rejects.toThrow()
 expect(s.emitter.emit).not.toHaveBeenCalled();expect(s.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0)
 if(kind==='abort')expect(remove).toHaveBeenCalled()
})
it.each([0,-1,.5,Infinity,2147483648,Number.MAX_SAFE_INTEGER])('rejects invalid timeout %s before registration or emission',async timeoutMs=>{
 const s=socket();await expect(sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,timeoutMs})).rejects.toThrow('lifetime')
 expect(s.emitter.emit).not.toHaveBeenCalled();expect(s.listeners.size).toBe(0)
})
it.each(['coefficients','extraSnapshot','extraResult'] as const)('rejects invalid %s before cloning ACK data',async kind=>{
 const s=socket(),result=structuredClone(answer());if(!result.ok||!('materialVersion' in result.snapshot))throw Error('Expected V2')
 if(kind==='coefficients'){
  const pin=result.snapshot.material.primarySource;if(pin.kind!=='softAuto')throw Error('Expected soft')
  Object.assign(pin.radialCurve,{coefficients:Array.from({length:10000},()=>[0,0,0,0])})
 }else if(kind==='extraSnapshot')Object.assign(result.snapshot,{foo:new Uint8Array(10000)})
 else Object.assign(result,{foo:new Uint8Array(10000)})
 const clone=vi.spyOn(globalThis,'structuredClone')
 try{
  const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true}),rejected=expect(pending).rejects.toThrow()
  s.ack(result);await rejected;expect(clone).not.toHaveBeenCalled();expect(s.listeners.size).toBe(0)
 }finally{clone.mockRestore()}
})
it('accepts a recorded-only resumed prefix with recorded cursor ahead of live',async()=>{
 const s=socket(),result=answer();if(!result.ok)throw Error('Expected success')
 Object.assign(result,{recordedNext:12,liveNext:0,ended:true})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true});s.ack(result)
 await expect(pending).resolves.toMatchObject({ok:true,recordedNext:12,liveNext:0,ended:true})
})
