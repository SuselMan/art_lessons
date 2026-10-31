import {expect,it,vi} from 'vitest'
import {canonicalImageMaterialPin} from './canonicalImageMaterial.js'
const source={kind:'image' as const,asset:'asset:'+'a'.repeat(64),brushScale:.05,brushAngle:0}
const asset={id:source.asset,size:256,x:53,y:53,width:150,height:150}
it('preserves original150 crop, fractional scale and angle in immutable V2 image data',()=>{
 const p=canonicalImageMaterialPin(source,[asset])
 expect(p).toEqual({primarySource:source,assets:[asset]});expect(p.assets[0]).not.toBe(asset)
 expect(Object.is(p.primarySource.brushAngle,0)).toBe(true)
 expect(Object.isFrozen(p.primarySource)&&Object.isFrozen(p.assets)&&Object.isFrozen(p.assets[0])).toBe(true)
})
it('rejects extras/accessors and oversized arrays before traversing their contents',()=>{
 const get=vi.fn(()=>source.asset),hidden=Object.defineProperty({...source},'extra',{value:0})
 const accessor=Object.defineProperty({...source},'asset',{get})
 for(const s of [hidden,{...source,[Symbol('extra')]:0},accessor])expect(()=>canonicalImageMaterialPin(s,[asset])).toThrow()
 const tooMany=Array(1000000);Object.defineProperty(tooMany,0,{get})
 expect(()=>canonicalImageMaterialPin(source,tooMany)).toThrow();expect(get).not.toHaveBeenCalled()
})
it.each([{...asset,x:107},{...asset,id:'asset:'+'b'.repeat(64)},{...asset,width:0}])('uses the existing material codec to reject invalid crop/source binding',a=>{
 expect(()=>canonicalImageMaterialPin(source,[a])).toThrow()
})

import {canonicalStrokeSnapshotV2,prepareCanonicalRecordedAttachment} from './canonicalRecordedAttachment.js'
import {buildCanonicalMaterial,CANONICAL_MATERIAL_LIMITS} from './canonicalMaterialCodec.js'
import {CANONICAL_STROKE_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import {verifyCanonicalEmptyHistoryBase} from './canonicalEmptyHistoryBase.js'
import {verifyCanonicalFullHistoryBase} from './canonicalFullHistoryBase.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
function delivery(){
 const material={version:2 as const,...canonicalImageMaterialPin(source,[asset]),budget:{workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:original@1',strokeId:'S',boardEpoch:2,descriptorSha256:'b'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed
 const operation:CanonicalStrokeOperation={id:'op',seq:1,userId:'author',timestamp:0,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment={version:1,roomId:'R',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}
 return {snapshot,operation,attachment,scope:{roomId:'R',boardEpoch:2}}
}
it('prepares bounded immutable image capability and checks complete prefix via the same snapshot context',()=>{
 const f=delivery(),atoms=prepareCanonicalRecordedAttachment(JSON.parse(JSON.stringify(f.attachment)),[JSON.parse(JSON.stringify(f.operation))],f.scope),snapshot=atoms[0].read!.capability.snapshot
 expect(snapshot.material.primarySource).toEqual(source);expect(snapshot.material.primarySource).not.toBe(source)
 const base={roomId:'R',boardEpoch:2,throughSeq:1,operationCount:1}
 expect(verifyCanonicalEmptyHistoryBase({kind:'empty-room-prefix-v1',...base},atoms,f.scope).throughSeq).toBe(1)
 expect(verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',...base},atoms,f.scope).gestures).toHaveLength(1)
})
it('rejects inconsistent outer asset snapshot, extra material metadata and malformed identity before normalization',()=>{
 const f=delivery()
 for(const snapshot of [{...f.snapshot,brush:'brush:original@999999999999999999999'},{...f.snapshot,assets:[{...asset,x:1}]},{...f.snapshot,descriptorSha256:'bad'},{...f.snapshot,material:{...f.snapshot.material,extra:1}}])expect(()=>canonicalStrokeSnapshotV2(snapshot,2,CANONICAL_STROKE_RASTER_PROFILE)).toThrow()
})

import {canonicalDefaultAutoSourcePin} from './canonicalDefaultAutoMaterial.js'
it.each(['old.name','Old_Name'])('does not narrow historical procedural pin descriptor ID grammar: %s',descriptorId=>{
 const f=delivery(),primarySource=canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId,descriptorVersion:1,descriptorSha256:'b'.repeat(64),brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',source:{kind:'defaultAuto',generator:'default',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1}})
 const snapshot={...f.snapshot,brush:`brush:${descriptorId}@1`,assets:[],material:{version:2 as const,assets:[],primarySource,budget:f.snapshot.material.budget}}
 expect(canonicalStrokeSnapshotV2(snapshot,2,CANONICAL_STROKE_RASTER_PROFILE).brush).toBe(snapshot.brush)
})

it.each(['brushAngle','brushScale','x','y','size','width','height'])('refuses negative-zero %s at the new image boundary instead of changing wire identity',field=>{
 const s={...source},a={...asset}
 if(field==='brushAngle'||field==='brushScale')Object.assign(s,{[field]:-0});else Object.assign(a,{[field]:-0})
 expect(()=>canonicalImageMaterialPin(s,[a])).toThrow()
})
it('captures an ordered repeated V2 frame pin with exact unique metadata and freezes independent copies',()=>{
 const second={...asset,id:'asset:'+'c'.repeat(64)},frames=[source.asset,second.id,source.asset]
 const pin=canonicalImageMaterialPin({...source,frames},[asset,second])
 expect(pin.primarySource).toEqual({...source,frames});expect(pin.assets).toEqual([asset,second])
 frames[1]=source.asset;expect(pin.primarySource).toEqual({...source,frames:[source.asset,second.id,source.asset]})
 expect(Object.isFrozen(pin.primarySource.frames)).toBe(true)
})
it('rejects holes/getters/symbols/extras and incomplete or ambiguous frame metadata without invoking accessors',()=>{
 const second={...asset,id:'asset:'+'c'.repeat(64)},get=vi.fn(()=>second.id)
 const accessor=[source.asset,second.id];Object.defineProperty(accessor,'1',{get})
 const extra=Object.assign([source.asset,second.id],{extra:0}),symbol=Object.assign([source.asset,second.id],{[Symbol('x')]:0})
 for(const frames of [[source.asset],[source.asset,,second.id],accessor,extra,symbol,[second.id,source.asset]])expect(()=>canonicalImageMaterialPin({...source,frames},[asset,second])).toThrow()
 expect(get).not.toHaveBeenCalled()
 for(const assets of [[asset],[asset,second,{...second,x:1}],[asset,second,{...asset,id:'asset:'+'d'.repeat(64)}]])expect(()=>canonicalImageMaterialPin({...source,frames:[source.asset,second.id]},assets)).toThrow()
})
it('rejects accessor/hidden metadata array fields and allows the same asset identity in separate crop contexts',()=>{
 const get=vi.fn(()=>asset),accessor=[asset];Object.defineProperty(accessor,'0',{get})
 const hidden=Object.defineProperty([asset],'extra',{value:1})
 for(const values of [accessor,hidden,Object.assign([asset],{[Symbol('x')]:0}),Array(1)])expect(()=>canonicalImageMaterialPin(source,values)).toThrow()
 expect(get).not.toHaveBeenCalled()
 expect(canonicalImageMaterialPin(source,[asset]).assets[0].x).toBe(53)
 expect(canonicalImageMaterialPin(source,[{...asset,x:54}]).assets[0].x).toBe(54)
})
