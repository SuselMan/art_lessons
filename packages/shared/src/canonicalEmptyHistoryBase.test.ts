import {expect,it,vi} from 'vitest'
import {parseCanonicalEmptyHistoryBase,verifyCanonicalEmptyHistoryBase} from './canonicalEmptyHistoryBase.js'
const scope={roomId:'room',boardEpoch:2}
const base={kind:'empty-room-prefix-v1',...scope,throughSeq:0,operationCount:0}
it('captures closed immutable empty-prefix metadata and verifies an actual empty prepared tail',()=>{
 const captured=parseCanonicalEmptyHistoryBase(base)
 expect(captured).toEqual(base);expect(captured).not.toBe(base);expect(Object.isFrozen(captured)).toBe(true)
 expect(verifyCanonicalEmptyHistoryBase(captured,[],scope)).toEqual(base)
})
it.each(['room','epoch','count','cut','kind','negative','fraction','overBudget'] as const)('refuses invalid %s metadata before baseline readiness',kind=>{
 const b={...base}
 if(kind==='room')b.roomId='other'
 if(kind==='epoch')b.boardEpoch=3
 if(kind==='count')b.operationCount=1
 if(kind==='cut')b.throughSeq=1
 if(kind==='kind')Object.assign(b,{kind:'foreign'})
 if(kind==='negative')b.throughSeq=-1
 if(kind==='fraction')b.throughSeq=.5
 if(kind==='overBudget'){b.throughSeq=1025;b.operationCount=1025}
 expect(()=>verifyCanonicalEmptyHistoryBase(b,[],scope)).toThrow()
})
it('rejects accessors, symbol and hidden extra fields before reading their values',()=>{
 const getter=vi.fn(()=>0),accessor=Object.defineProperty({...base},'throughSeq',{get:getter})
 for(const b of [accessor,{...base,[Symbol('extra')]:1},Object.defineProperty({...base},'extra',{value:1}),Object.create(base)])expect(()=>parseCanonicalEmptyHistoryBase(b)).toThrow()
 expect(getter).not.toHaveBeenCalled()
})

import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import {canonicalDefaultAutoSourceBinding} from './canonicalDefaultAutoMaterial.js'
import {buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {prepareCanonicalRecordedAttachment,type CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import {CANONICAL_STROKE_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import type {BrushDescriptor} from './brushes.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
function fixture(rows:readonly {user:string;ordinal:number;ended?:boolean;primary?:boolean}[]){
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'same',boardEpoch:2,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const users=[...new Set(rows.map(r=>r.user))]
 const ops:CanonicalStrokeOperation[]=rows.map((r,i)=>({id:'op'+i,userId:r.user,timestamp:0,seq:i+1,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'same',frameOrdinal:r.ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:r.primary?{phase:'primary',group:0}:{phase:'between'},draws:[],fences:r.ended?[{kind:'gestureEnd',at:0}]:[]},material).packed}}))
 const attachment:CanonicalRecordedAttachmentV1={version:1,...scope,capabilities:users.map(originalUserId=>({originalUserId,snapshot})),bindings:ops.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:users.indexOf(op.userId)}))}
 return {atoms:prepareCanonicalRecordedAttachment(attachment,ops,scope),metadata:{...base,throughSeq:ops.length,operationCount:ops.length}}
}
it('verifies a whole interleaved same-ID different-author prefix and preserves open material state',()=>{
 const f=fixture([{user:'A',ordinal:0},{user:'B',ordinal:0,ended:true},{user:'A',ordinal:1}])
 expect(verifyCanonicalEmptyHistoryBase(f.metadata,f.atoms,scope)).toEqual(f.metadata)
 expect(f.atoms[0].read!.capability).toBe(f.atoms[2].read!.capability)
})
it.each(['gap','duplicateId','unsupported','missingRead','readSequence','ordinal','phase','afterEnd','sourceRebind'] as const)('refuses incomplete or incompatible %s prefix',kind=>{
 const f=fixture([{user:'A',ordinal:kind==='ordinal'?1:0,ended:kind==='afterEnd'},{user:'A',ordinal:kind==='ordinal'?2:1,primary:kind==='phase'}]),atoms=[...f.atoms]
 if(kind==='gap')atoms[1]={...atoms[1],operation:{...atoms[1].operation,seq:3}}
 if(kind==='duplicateId')atoms[1]={...atoms[1],operation:{...atoms[1].operation,id:atoms[0].operation.id}}
 if(kind==='unsupported')atoms[1]={operation:{id:'clear',userId:'A',timestamp:0,seq:2,type:'layer_clear',layerId:'L'}}
 if(kind==='missingRead')atoms[1]={operation:atoms[1].operation}
 if(kind==='readSequence')atoms[1]={...atoms[1],read:{...atoms[1].read!,sequence:3}}
 if(kind==='sourceRebind'){
  const read=atoms[1].read!,snapshot=read.capability.snapshot
  atoms[1]={...atoms[1],read:{...read,capability:Object.freeze({...read.capability,snapshot:Object.freeze({...snapshot,composition:{...snapshot.composition,outerResourceOpacity:.5}})})}}
 }
 expect(()=>verifyCanonicalEmptyHistoryBase(f.metadata,atoms,scope)).toThrow()
})
it('refuses independently prepared page concatenation as a substitute for one authoritative complete batch',()=>{
 const first=fixture([{user:'A',ordinal:0},{user:'A',ordinal:1}]),second=fixture([{user:'A',ordinal:0},{user:'A',ordinal:1}])
 expect(()=>verifyCanonicalEmptyHistoryBase(first.metadata,[first.atoms[0],second.atoms[1]],scope)).toThrow()
})
it('rejects oversized prepared arrays before looking at any atom',()=>{
 const get=vi.fn(),atoms=Array(1025);Object.defineProperty(atoms,0,{get})
 expect(()=>verifyCanonicalEmptyHistoryBase(base,atoms,scope)).toThrow();expect(get).not.toHaveBeenCalled()
})
