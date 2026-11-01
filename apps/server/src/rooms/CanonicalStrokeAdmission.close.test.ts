import {expect,it,vi} from 'vitest'
import {CANONICAL_MATERIAL_PROFILE,CANONICAL_STROKE_RASTER_PROFILE,packCanonicalMaterial,verifyCanonicalRecordedPrefix,verifyCanonicalRecordedClose,type CanonicalMaterialFrame,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
import {CanonicalStrokeAdmission,type TrustedCanonicalGesture} from './CanonicalStrokeAdmission.js'
const identity={roomId:'board',userId:'author'}
function fixture(){
 const asset={id:`asset:${'1'.repeat(64)}`,size:1,x:0,y:0,width:1,height:1}
 const grant:TrustedCanonicalGesture={...identity,layerId:'layer',boardEpoch:0,roomRasterVersion:'straight-rgba8-v1',rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,descriptorSha256:'2'.repeat(64),brush:'brush:fixture@1',strokeId:'gesture',pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},material:{assets:[asset],primaryAsset:asset.id,budget:{workUnits:100,outputBytes:100,drawPixels:100},preflightDefinition:()=>({workUnits:1,outputBytes:1})}}
 const resolve=vi.fn(()=>grant),admission=new CanonicalStrokeAdmission({resolve,maxGestures:1,retainedFrames:8})
 const frame=(n:number,end=false)=>{
  const material:CanonicalMaterialFrame={profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:end?[{kind:'gestureEnd',at:0}]:[]}
  if('version'in grant.material)throw Error('Legacy fixture requires material1')
  const envelope:CanonicalStrokeFrameEnvelope={version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:grant.brush,strokeId:grant.strokeId,frameOrdinal:n,pigmentRgb8:grant.pigmentRgb8,composition:grant.composition,materialPacked:packCanonicalMaterial(material,grant.material)}
  return {type:'canonical_stroke' as const,id:'frame-'+n,layerId:'layer',frame:envelope}
 }
 const live=(n:number,end=false)=>({type:'canonical_stroke_live' as const,layerId:'layer',frame:frame(n,end).frame})
 const seal=(count:number)=>verifyCanonicalRecordedClose(verifyCanonicalRecordedPrefix(Array.from({length:count},(_,n)=>({operationId:'frame-'+n,sequence:n+1,frameOrdinal:n,decoded:{entry:{phase:'between' as const},fences:[]}}))),{userId:'author',layerId:'layer',strokeId:'gesture'}, {type:'canonical_stroke_close',id:'close',userId:'owner',timestamp:5,seq:count+1,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial',recordedNext:count,firstFrameOpId:'frame-0',lastFrameOpId:'frame-'+(count-1)})
 return{admission,resolve,frame,live,seal}
}
it('closes only an existing recorded session and copies internal seal data without granting an author',()=>{
 const f=fixture();expect(()=>f.admission.prepareRecordedClose(identity,'gesture',f.seal(1))).toThrow()
 expect(f.admission.size).toBe(0);expect(f.resolve).not.toHaveBeenCalled()
 f.admission.prepare(identity,f.frame(0)).commit();const calls=f.resolve.mock.calls.length
 const data={...f.seal(1)},ticket=f.admission.prepareRecordedClose(identity,'gesture',data)
 data.recordedNext=2
 expect(f.admission.cursor(identity,'gesture').ended).toBe(false);expect(Object.isFrozen(ticket)).toBe(true);expect(Object.isFrozen(ticket.seal)).toBe(true)
 ticket.commit();ticket.commit()
 expect(f.admission.cursor(identity,'gesture')).toEqual({recordedNext:1,liveNext:0,ended:true});expect(f.resolve).toHaveBeenCalledTimes(calls)
 expect(f.admission.size).toBe(1)
})
it('rejects copied/detached/stale tickets before mutation and cannot resurrect a cleared session',()=>{
 const f=fixture();f.admission.prepare(identity,f.frame(0)).commit()
 const ticket=f.admission.prepareRecordedClose(identity,'gesture',f.seal(1)),copy={...ticket},detached=ticket.commit
 expect(()=>copy.commit()).toThrow('ticket');expect(()=>Reflect.apply(detached,undefined,[])).toThrow('ticket')
 expect(f.admission.cursor(identity,'gesture').ended).toBe(false)
 f.admission.prepare(identity,f.frame(1)).commit();expect(()=>ticket.commit()).toThrow('stale')
 expect(f.admission.cursor(identity,'gesture')).toEqual({recordedNext:2,liveNext:0,ended:false})
 const newer=f.admission.prepareRecordedClose(identity,'gesture',f.seal(2));f.admission.clearRoom('board')
 expect(()=>newer.commit()).toThrow('stale');expect(f.admission.size).toBe(0)
})
it('blocks ordinal N already accepted live while retaining old recorded and live duplicates',()=>{
 const f=fixture()
 f.admission.prepare(identity,f.live(0)).commit();f.admission.prepare(identity,f.frame(0)).commit()
 f.admission.prepare(identity,f.live(1,true)).commit()
 const oldPrepared=f.admission.prepare(identity,f.frame(1,true))
 f.admission.prepareRecordedClose(identity,'gesture',f.seal(1)).commit()
 expect(()=>oldPrepared.commit()).toThrow('stale')
 expect(()=>f.admission.prepare(identity,f.frame(1,true))).toThrow('sealed')
 expect(()=>f.admission.prepare(identity,{...f.frame(1,true),id:'new-id'})).toThrow('sealed')
 expect(()=>f.admission.prepare(identity,f.live(2))).toThrow('sealed')
 for(const candidate of [f.frame(0),f.live(0),f.live(1,true)]){
  const retry=f.admission.prepare(identity,candidate);expect(retry.duplicate).toBe(true);retry.commit()
 }
 expect(f.admission.cursor(identity,'gesture')).toEqual({recordedNext:1,liveNext:2,ended:true})
})
it('leaves retained recorded0..N-1 retry semantics unchanged and rejects mismatched/normal-ended seals',()=>{
 const f=fixture();f.admission.prepare(identity,f.frame(0)).commit();f.admission.prepare(identity,f.frame(1)).commit()
 for(const patch of [{recordedNext:1},{lastOperationId:'wrong'},{firstOperationId:'wrong'}])expect(()=>f.admission.prepareRecordedClose(identity,'gesture',{...f.seal(2),...patch})).toThrow()
 f.admission.prepareRecordedClose(identity,'gesture',f.seal(2)).commit()
 for(let i=0;i<2;i++){const retry=f.admission.prepare(identity,f.frame(i));expect(retry.duplicate).toBe(true);retry.commit()}
 expect(()=>f.admission.prepare(identity,f.live(0))).toThrow('sealed')
 expect(()=>f.admission.prepareRecordedClose(identity,'gesture',f.seal(2))).toThrow()
 const g=fixture();g.admission.prepare(identity,g.frame(0,true)).commit();expect(()=>g.admission.prepareRecordedClose(identity,'gesture',g.seal(1))).toThrow()
})
