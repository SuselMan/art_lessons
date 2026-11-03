import{softPressureTextureFixture}from'./canonicalSoftPressureTexture.testFixture'
import{pressureTextureFixture}from'./canonicalPressureTexture.testFixture'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {canonicalSourceMaterialContext,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as generic,canonicalPrimaryTexturePin,CANONICAL_STROKE_RASTER_PROFILE,canonicalSoftAutoSourcePin,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeSnapshotV3} from '@grafetto/shared'
import type {Socket} from 'socket.io-client'
import type {ServerToClientEvents,ClientToServerEvents} from '@grafetto/shared'
import {sendCanonicalStrokeBegin,type CanonicalBeginEmitter} from './sendCanonicalStrokeBegin'
// Compile-time assertion: the real Room socket satisfies the structural seam.
const acceptsSocket=(socket:Socket<ServerToClientEvents,ClientToServerEvents>):CanonicalBeginEmitter=>socket
void acceptsSocket
const input=():CanonicalStrokeBegin=>({emptyDiscardNonce:'attempt_nonce_1',layerId:'L',brush:'brush:soft@1',strokeId:'S',pigmentRgb8:[1,2,3],outerResourceOpacity:.7,alphaDarken:'hard'})
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

const genericOuterProfile='installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2' as const
it.each(['multiply','lighten','colorDodge','overlay'] as const)('captures explicit expected profile before accepting V2 %s ACK',async outerBlend=>{
 const s=socket(),result=answer();if(!result.ok||!('materialVersion'in result.snapshot))throw Error('Expected V2')
 Object.assign(result.snapshot,{rasterProfile:genericOuterProfile,composition:{...result.snapshot.composition,outerBlend}})
 const lifetime={boardEpoch:2,isCurrent:()=>true,rasterProfile:genericOuterProfile}
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),lifetime)
 Reflect.set(lifetime,'rasterProfile',CANONICAL_STROKE_RASTER_PROFILE);s.ack(result)
 await expect(pending).resolves.toMatchObject({ok:true,snapshot:{rasterProfile:genericOuterProfile,composition:{outerBlend}}})
 expect(s.listeners.size).toBe(0)
 const other=socket(),bad=sendCanonicalStrokeBegin(other.emitter,input(),{boardEpoch:2,isCurrent:()=>true});const rejected=expect(bad).rejects.toThrow();other.ack(result);await rejected
})
it.each(['foreign',null])('rejects captured profile %s before listener/timer/emission',async rasterProfile=>{
 const s=socket(),lifetime={boardEpoch:2,isCurrent:()=>true,rasterProfile:rasterProfile as never}
 await expect(sendCanonicalStrokeBegin(s.emitter,input(),lifetime)).rejects.toThrow('raster profile')
 expect(s.emitter.emit).not.toHaveBeenCalled();expect(s.listeners.size).toBe(0)
})
it('refuses old-profile ACK in an explicitly new-profile lifetime before cloning',async()=>{
 const s=socket(),result=answer(),clone=vi.spyOn(globalThis,'structuredClone')
 try{
  const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,rasterProfile:genericOuterProfile}),rejected=expect(pending).rejects.toThrow('resource mismatch')
  s.ack(result);await rejected;expect(clone).not.toHaveBeenCalled()
 }finally{clone.mockRestore()}
})
it('captures server author default separately from explicit old resume response profiles',async()=>{
 const s=socket(),profiles=[CANONICAL_STROKE_RASTER_PROFILE,genericOuterProfile]
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,authorRasterProfile:genericOuterProfile,responseRasterProfiles:profiles})
 profiles.splice(0,1);s.ack() // stored old-profile ACK remains the old law
 await expect(pending).resolves.toMatchObject({ok:true,snapshot:{rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}})
 const bad=socket()
 await expect(sendCanonicalStrokeBegin(bad.emitter,input(),{boardEpoch:2,isCurrent:()=>true,authorRasterProfile:genericOuterProfile,responseRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE]})).rejects.toThrow('raster profile')
 expect(bad.emitter.emit).not.toHaveBeenCalled()
 for(const responseRasterProfiles of [[],[genericOuterProfile,genericOuterProfile],null]){
  await expect(Reflect.apply(sendCanonicalStrokeBegin,null,[bad.emitter,input(),{boardEpoch:2,isCurrent:()=>true,responseRasterProfiles}])).rejects.toThrow()
 }
 await expect(sendCanonicalStrokeBegin(bad.emitter,input(),{boardEpoch:2,isCurrent:()=>true,rasterProfile:genericOuterProfile,responseRasterProfiles:[genericOuterProfile]})).rejects.toThrow()
})
it('accepts a closed primary image V2 snapshot with original crop/fractional scale and independent frozen assets',async()=>{
 const s=socket(),result=answer();if(!result.ok||!('materialVersion'in result.snapshot))throw Error('Expected V2')
 const asset={id:'asset:'+'c'.repeat(64),size:256,x:53,y:53,width:150,height:150}
 Object.assign(result.snapshot,{assets:[asset],material:{version:2,assets:[asset],primarySource:{kind:'image',asset:asset.id,brushScale:.05,brushAngle:0},budget:{workUnits:1000,outputBytes:4000,drawPixels:1000}}})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true});s.ack(result)
 const accepted=await pending;if(!accepted.ok)throw Error('Expected accepted image')
 asset.width=1;expect(accepted.snapshot.assets[0].width).toBe(150)
 expect(Object.isFrozen(accepted.snapshot.material.primarySource)).toBe(true)
})

function textureAnswer():Extract<CanonicalStrokeBeginResult,{ok:true}>&{readonly snapshot:CanonicalStrokeSnapshotV3} {
 const primary={id:'asset:'+'1'.repeat(64),size:4,x:0,y:0,width:4,height:4},pattern={id:'asset:'+'2'.repeat(64),size:8,x:0,y:0,width:4,height:4}
 const material={version:3 as const,assets:[primary,pattern],primarySource:{kind:'image' as const,asset:primary.id,brushScale:1,brushAngle:0},primaryTexture:canonicalPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},pattern),budget:{workUnits:10000,outputBytes:10000,drawPixels:10000}}
 const old=answer();if(!old.ok)throw Error('fixture')
 return{...old,snapshot:{...old.snapshot,rasterProfile:generic,materialVersion:3,assets:material.assets,material}}
}
it('accepts only explicitly descriptor-pinned V3 and freezes both original asset roles',async()=>{
 const s=socket(),lifetime={boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:'a'.repeat(64)},result=textureAnswer()
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),lifetime);lifetime.expectedDescriptorSha256='b'.repeat(64);s.ack(result)
 const accepted=await pending;if(!accepted.ok||accepted.snapshot.materialVersion!==3||!result.ok||result.snapshot.materialVersion!==3)throw Error('Expected actual3')
 expect(accepted.snapshot.material.primaryTexture.asset).toBe(accepted.snapshot.assets[1].id)
 expect(Object.isFrozen(accepted.snapshot.material.primaryTexture)).toBe(true);expect(Object.isFrozen(accepted.snapshot.assets[1])).toBe(true)
 expect(accepted.snapshot).not.toBe(result.snapshot);expect(s.sent[0]).toEqual(input());expect(s.listeners.size).toBe(0)
})
it.each(['missingSHA','wrongSHA','oldProfile','wrongVersion','wrongAsset','extraPin','selectorGetter'] as const)('refuses V3 %s without a historical material fallback',async mode=>{
 const s=socket(),result=textureAnswer();if(!result.ok||result.snapshot.materialVersion!==3)throw Error('fixture')
 let getterCalls=0
 const lifetime={boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:'a'.repeat(64)}
 if(mode==='missingSHA')Reflect.deleteProperty(lifetime,'expectedDescriptorSha256')
 if(mode==='wrongSHA')lifetime.expectedDescriptorSha256='b'.repeat(64)
 if(mode==='oldProfile')Reflect.set(lifetime,'authorRasterProfile',CANONICAL_STROKE_RASTER_PROFILE)
 if(mode==='wrongVersion')Reflect.set(result.snapshot.material,'version',2)
 if(mode==='wrongAsset')Reflect.set(result.snapshot.material,'primaryTexture',{...result.snapshot.material.primaryTexture,asset:result.snapshot.assets[0].id})
 if(mode==='extraPin')Reflect.set(result.snapshot.material,'primaryTexture',{...result.snapshot.material.primaryTexture,extra:true})
 if(mode==='selectorGetter')Object.defineProperty(result.snapshot,'materialVersion',{get(){getterCalls++;return 3}})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),lifetime),rejected=expect(pending).rejects.toThrow();s.ack(result);await rejected;expect(getterCalls).toBe(0);expect(s.listeners.size).toBe(0)
})
it('keeps stale or aborted V3 ACKs outside acceptance and clears the original attempt',async()=>{
 for(const mode of ['stale','abort'] as const){
  const s=socket(),controller=new AbortController();let current=true
  const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>current,authorRasterProfile:generic,expectedDescriptorSha256:'a'.repeat(64),signal:controller.signal}),rejected=expect(pending).rejects.toThrow()
  if(mode==='stale')current=false;else controller.abort()
  s.ack(textureAnswer());await rejected;expect(s.listeners.size).toBe(0)
 }
})
it('rejects V3 nested accessors without executing their payloads',async()=>{
 const s=socket(),result=textureAnswer();if(!result.ok||result.snapshot.materialVersion!==3)throw Error('fixture')
 let calls=0;const material=result.snapshot.material
 Object.defineProperty(result.snapshot,'material',{get(){calls++;return material}})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:'a'.repeat(64)}),rejected=expect(pending).rejects.toThrow()
 s.ack(result);await rejected;expect(calls).toBe(0)
})


it('captures genuine5 original permission and descriptor SHA before ACK; fixed4 flag cannot grant5',async()=>{
 const f=pressureTextureFixture(),s=socket(),lifetime={boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:f.sha,authorPressureTexturedSource:'pressure-default-auto-texture-v5' as const};const pending=sendCanonicalStrokeBegin(s.emitter,f.input,lifetime);Reflect.deleteProperty(lifetime,'authorPressureTexturedSource');lifetime.expectedDescriptorSha256='b'.repeat(64);s.ack({ok:true,snapshot:f.snapshot,recordedNext:0,liveNext:0,ended:false});const accepted=await pending;if(!accepted.ok||accepted.snapshot.materialVersion!==5)throw Error('Expected5');expect(accepted.snapshot.material.primaryTexture.strength).toBe('source-pressure-curve-v1');expect(accepted.snapshot.assets).toHaveLength(1);expect(Object.isFrozen(accepted.snapshot.material)).toBe(true);expect(s.sent[0]).toEqual(f.input)
 const off=socket(),rejected=sendCanonicalStrokeBegin(off.emitter,f.input,{boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:f.sha,authorTexturedSource:'fixed-default-auto-texture-v4'});const assertion=expect(rejected).rejects.toThrow('original author policy');off.ack({ok:true,snapshot:f.snapshot,recordedNext:0,liveNext:0,ended:false});await assertion
})
it.each(['missingSHA','wrongSHA','wrongContext','selectorGetter','policyGetter','stale'] as const)('refuses genuine5 %s without getter execution or fallback',async mode=>{
 const f=pressureTextureFixture(),s=socket();let calls=0,current=true;const snapshot=structuredClone(f.snapshot),lifetime={boardEpoch:2,isCurrent:()=>current,authorRasterProfile:generic,expectedDescriptorSha256:f.sha,authorPressureTexturedSource:'pressure-default-auto-texture-v5' as const}
 if(mode==='missingSHA')Reflect.deleteProperty(lifetime,'expectedDescriptorSha256');if(mode==='wrongSHA')lifetime.expectedDescriptorSha256='b'.repeat(64);if(mode==='wrongContext')Reflect.set(snapshot.material,'version',4);if(mode==='selectorGetter')Object.defineProperty(snapshot,'materialVersion',{get(){calls++;return 5}});if(mode==='policyGetter')Object.defineProperty(lifetime,'authorPressureTexturedSource',{get(){calls++;return'pressure-default-auto-texture-v5'}})
 const pending=sendCanonicalStrokeBegin(s.emitter,f.input,lifetime),assertion=expect(pending).rejects.toThrow();if(mode==='stale')current=false;if(s.sent.length)s.ack({ok:true,snapshot,recordedNext:0,liveNext:0,ended:false});await assertion;if(mode==='policyGetter')expect(s.emitter.emit).not.toHaveBeenCalled();expect(calls).toBe(0);expect(s.listeners.size).toBe(0)
})

it('captures genuine6 original permission and descriptor SHA before ACK; fixed4 flag cannot grant5',async()=>{
 const f=softPressureTextureFixture(),s=socket(),lifetime={boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:f.sha,authorSoftPressureTexturedSource:'pressure-soft-auto-texture-v6' as const};const pending=sendCanonicalStrokeBegin(s.emitter,f.input,lifetime);Reflect.deleteProperty(lifetime,'authorSoftPressureTexturedSource');lifetime.expectedDescriptorSha256='b'.repeat(64);s.ack({ok:true,snapshot:f.snapshot,recordedNext:0,liveNext:0,ended:false});const accepted=await pending;if(!accepted.ok||accepted.snapshot.materialVersion!==6)throw Error('Expected6');expect(accepted.snapshot.material.primaryTexture.strength).toBe('source-pressure-curve-v1');expect(accepted.snapshot.assets).toHaveLength(1);expect(Object.isFrozen(accepted.snapshot.material)).toBe(true);expect(s.sent[0]).toEqual(f.input)
 const off=socket(),rejected=sendCanonicalStrokeBegin(off.emitter,f.input,{boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,expectedDescriptorSha256:f.sha,authorPressureTexturedSource:'pressure-default-auto-texture-v5'});const assertion=expect(rejected).rejects.toThrow('original author policy');off.ack({ok:true,snapshot:f.snapshot,recordedNext:0,liveNext:0,ended:false});await assertion
})
it.each(['missingSHA','wrongSHA','wrongContext','selectorGetter','policyGetter','stale'] as const)('refuses genuine6 %s without getter execution or fallback',async mode=>{
 const f=softPressureTextureFixture(),s=socket();let calls=0,current=true;const snapshot=structuredClone(f.snapshot),lifetime={boardEpoch:2,isCurrent:()=>current,authorRasterProfile:generic,expectedDescriptorSha256:f.sha,authorSoftPressureTexturedSource:'pressure-soft-auto-texture-v6' as const}
 if(mode==='missingSHA')Reflect.deleteProperty(lifetime,'expectedDescriptorSha256');if(mode==='wrongSHA')lifetime.expectedDescriptorSha256='b'.repeat(64);if(mode==='wrongContext')Reflect.set(snapshot.material,'version',4);if(mode==='selectorGetter')Object.defineProperty(snapshot,'materialVersion',{get(){calls++;return 6}});if(mode==='policyGetter')Object.defineProperty(lifetime,'authorSoftPressureTexturedSource',{get(){calls++;return'pressure-soft-auto-texture-v6'}})
 const pending=sendCanonicalStrokeBegin(s.emitter,f.input,lifetime),assertion=expect(pending).rejects.toThrow();if(mode==='stale')current=false;if(s.sent.length)s.ack({ok:true,snapshot,recordedNext:0,liveNext:0,ended:false});await assertion;if(mode==='policyGetter')expect(s.emitter.emit).not.toHaveBeenCalled();expect(calls).toBe(0);expect(s.listeners.size).toBe(0)
})


it('captures prepared7 context and phase before emit, independently of later caller mutation',async()=>{
 const {texturedAuto7Fixture}=await import('./canonicalTexturedAuto7.testFixture')
 const f=texturedAuto7Fixture(),s=socket(),mutable=structuredClone(f.material),phase={...f.input.texturePhase}
 const lifetime={boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,authorTexturedAutoSource:'textured-auto-material-v7' as const,expectedDescriptorSha256:f.sha,expectedMaterialContext7:mutable}
 const pending=sendCanonicalStrokeBegin(s.emitter,{...f.input,texturePhase:phase},lifetime)
 Reflect.set(mutable.budget,'workUnits',1);Reflect.set(phase,'x',(phase.x+1)%f.material.primaryTexture.width)
 Reflect.set(lifetime,'authorTexturedAutoSource',undefined)
 expect(s.sent[0].texturePhase).toEqual(f.material.primaryTexture.phase)
 s.ack({ok:true,snapshot:f.snapshot,recordedNext:0,liveNext:0,ended:false})
 const accepted=await pending
 expect(accepted.ok&&accepted.snapshot.materialVersion).toBe(7)
 expect(s.listeners.size).toBe(0)
})
it.each(['policy','context','phase','phaseGetter','contextGetter'] as const)('rejects missing/foreign prepared7 %s before emitting',async kind=>{
 const {texturedAuto7Fixture}=await import('./canonicalTexturedAuto7.testFixture')
 const f=texturedAuto7Fixture(),s=socket(),request={...f.input},getter=vi.fn(()=>f.input.texturePhase)
 const lifetime={boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,authorTexturedAutoSource:'textured-auto-material-v7' as const,expectedDescriptorSha256:f.sha,expectedMaterialContext7:f.material}
 if(kind==='policy')Reflect.deleteProperty(lifetime,'authorTexturedAutoSource')
 if(kind==='context')Reflect.deleteProperty(lifetime,'expectedMaterialContext7')
 if(kind==='phase')request.texturePhase={...request.texturePhase,x:(request.texturePhase.x+1)%f.material.primaryTexture.width}
 if(kind==='phaseGetter')Object.defineProperty(request,'texturePhase',{get:getter})
 if(kind==='contextGetter')Object.defineProperty(lifetime,'expectedMaterialContext7',{get:getter})
 await expect(sendCanonicalStrokeBegin(s.emitter,request,lifetime)).rejects.toThrow()
 expect(getter).not.toHaveBeenCalled();expect(s.sent).toHaveLength(0);expect(s.listeners.size).toBe(0)
})
it.each(['phase','budget','source','downgrade','SHA'] as const)('rejects ACK7 %s mismatch against the captured original preparation',async kind=>{
 const {texturedAuto7Fixture}=await import('./canonicalTexturedAuto7.testFixture')
 const f=texturedAuto7Fixture(),s=socket(),snapshot=structuredClone(f.snapshot)
 if(kind==='phase')Reflect.set(snapshot.material.primaryTexture.phase,'x',(snapshot.material.primaryTexture.phase.x+1)%snapshot.material.primaryTexture.width)
 if(kind==='budget')Reflect.set(snapshot.material.budget,'workUnits',snapshot.material.budget.workUnits-1)
 if(kind==='source')Reflect.set(snapshot.material.primarySource,'brushScale',snapshot.material.primarySource.brushScale*2)
 if(kind==='SHA')Reflect.set(snapshot,'descriptorSha256','a'.repeat(64))
 const pending=sendCanonicalStrokeBegin(s.emitter,f.input,{boardEpoch:2,isCurrent:()=>true,authorRasterProfile:generic,authorTexturedAutoSource:'textured-auto-material-v7',authorSoftPressureTexturedSource:'pressure-soft-auto-texture-v6',expectedDescriptorSha256:f.sha,expectedMaterialContext7:f.material})
 const rejected=expect(pending).rejects.toThrow()
 if(kind==='downgrade')s.ack({ok:true,snapshot:softPressureTextureFixture().snapshot,recordedNext:0,liveNext:0,ended:false})
 else s.ack({ok:true,snapshot,recordedNext:0,liveNext:0,ended:false})
 await rejected;expect(s.listeners.size).toBe(0)
})
it('cancels a prepared7 BEGIN and ignores its late valid ACK',async()=>{
 const {texturedAuto7Fixture}=await import('./canonicalTexturedAuto7.testFixture')
 const f=texturedAuto7Fixture(),s=socket(),abort=new AbortController()
 const pending=sendCanonicalStrokeBegin(s.emitter,f.input,{boardEpoch:2,isCurrent:()=>true,signal:abort.signal,authorRasterProfile:generic,authorTexturedAutoSource:'textured-auto-material-v7',expectedDescriptorSha256:f.sha,expectedMaterialContext7:f.material})
 const rejected=expect(pending).rejects.toThrow('aborted');abort.abort();await rejected
 s.ack({ok:true,snapshot:f.snapshot,recordedNext:0,liveNext:0,ended:false})
 expect(s.listeners.size).toBe(0)
})

it.each(['abort','timeout']as const)('sends one owned empty discard before late ACK on %s',async kind=>{
 const s=socket(),controller=new AbortController(),discardEmpty=vi.fn(),pending=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,signal:controller.signal,timeoutMs:50,discardEmpty}),rejected=expect(pending).rejects.toThrow()
 if(kind==='abort')controller.abort();else vi.advanceTimersByTime(50)
 await rejected;s.ack();controller.abort();expect(discardEmpty).toHaveBeenCalledTimes(1);expect(s.listeners.size).toBe(0)
})
it('does not send empty cleanup before emission or on positive ACK; cleanup errors preserve primary',async()=>{
 const s=socket(),discardEmpty=vi.fn(()=>{throw Error('secondary')}),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 await expect(sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>false,discardEmpty})).rejects.toThrow('Stale');expect(discardEmpty).not.toHaveBeenCalled()
 const controller=new AbortController(),p=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,signal:controller.signal,discardEmpty});s.ack();await p;controller.abort();expect(discardEmpty).not.toHaveBeenCalled()
 const c=new AbortController(),q=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,signal:c.signal,discardEmpty}),rejected=expect(q).rejects.toThrow('aborted');c.abort();await rejected;expect(discardEmpty).toHaveBeenCalledTimes(1);expect(log).toHaveBeenCalledTimes(1);log.mockRestore()
})

it.each(['emit','onBeginAccepted']as const)('preserves %s primary and attempts empty cleanup once',async kind=>{
 const s=socket(),discardEmpty=vi.fn(),primary=Error('primary'),onBeginAccepted=()=>{if(kind==='onBeginAccepted')throw primary}
 if(kind==='emit')vi.mocked(s.emitter.emit).mockImplementation(()=>{throw primary})
 const p=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,discardEmpty,onBeginAccepted}),rejected=expect(p).rejects.toBe(primary)
 if(kind==='onBeginAccepted')s.ack();await rejected;expect(discardEmpty).toHaveBeenCalledTimes(1);expect(s.listeners.size).toBe(0)
})
it('announces validated BEGIN synchronously before FIFO continuation can consume the Promise',async()=>{
 const s=socket(),accepted=vi.fn(),p=sendCanonicalStrokeBegin(s.emitter,input(),{boardEpoch:2,isCurrent:()=>true,onBeginAccepted:accepted});s.ack();expect(accepted).toHaveBeenCalledTimes(1);await p
})

it('rejects caller-owned plainTilt AUTHOR accessor before getter or BEGIN emit',async()=>{
 const s=socket(),getter=vi.fn(()=>'plain-auto-tilt-v1'),lifetime={boardEpoch:2,authorRasterProfile:generic,isCurrent:()=>true}
 Object.defineProperty(lifetime,'authorPlainTiltSource',{get:getter})
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),lifetime)
 if(s.sent.length)s.ack({ok:false,reason:'invalid_operation'})
 await expect(pending).rejects.toThrow('policy');expect(getter).not.toHaveBeenCalled();expect(s.sent).toHaveLength(0)
})

function maskedAnswer(){
 const result=answer();if(!result.ok||result.snapshot.materialVersion!==2)throw Error('Source2 fixture required')
 const primary=result.snapshot.material.primarySource;if(primary.kind!=='softAuto')throw Error('Soft fixture required')
 const material=canonicalSourceMaterialContext({...result.snapshot.material,maskSource:{...primary,sourceSlot:1},maskingBlend:'multiply'})
 return{...result,snapshot:{...result.snapshot,rasterProfile:generic,material}}
}
it.each(['paired','changed-mask','no-masked-author'] as const)('validates real dual transport ACK against captured original (%s)',async mode=>{
 const s=socket(),result=maskedAnswer(),expected=result.snapshot.material
 const lifetime={boardEpoch:2,authorRasterProfile:generic,isCurrent:()=>true,expectedDescriptorSha256:'a'.repeat(64),expectedSourceMaterialContext2:expected,authorImageMaterialSource:'pixel-image-material-v1' as const,authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1' as const,authorPrimaryGrainSource:'primary-grain-image-v1' as const,...mode!=='no-masked-author'?{authorPixelMaskedSource:'pixel-masked-v1' as const}:{}}
 const pending=sendCanonicalStrokeBegin(s.emitter,input(),lifetime)
 if(mode==='no-masked-author'){await expect(pending).rejects.toThrow();expect(s.emitter.emit).not.toHaveBeenCalled();return}
 const response=mode==='changed-mask'?{...result,snapshot:{...result.snapshot,material:canonicalSourceMaterialContext({...expected,maskSource:{...expected.maskSource,brushAngle:1}})}}:result
 if(mode==='changed-mask'){const rejected=expect(pending).rejects.toThrow();s.ack(response);await rejected}
 else{s.ack(response);const accepted=await pending;expect(accepted.ok).toBe(true);if(accepted.ok){expect(accepted.snapshot.material.maskSource).toEqual(expected.maskSource);expect(Object.isFrozen(accepted.snapshot.material.maskSource)).toBe(true)}}
 expect(s.listeners.size).toBe(0)
})
