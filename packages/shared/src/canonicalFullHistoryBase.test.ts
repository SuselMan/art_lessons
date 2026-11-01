import {expect,it} from 'vitest'
import {parseCanonicalFullHistoryBase,verifyCanonicalFullHistoryBase} from './canonicalFullHistoryBase.js'
import {parseCanonicalEmptyHistoryBase} from './canonicalEmptyHistoryBase.js'
import type {Operation} from './operations.js'
const scope={roomId:'room',boardEpoch:2}
const base={kind:'empty-room-prefix-v1',...scope,throughSeq:0,operationCount:0}
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import {canonicalDefaultAutoSourceBinding} from './canonicalDefaultAutoMaterial.js'
import {buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {prepareCanonicalRecordedAttachment,type CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import {CANONICAL_STROKE_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import type {BrushDescriptor} from './brushes.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
function fixture(rows:readonly {user:string;ordinal:number;ended?:boolean;primary?:boolean;stroke?:string;seq?:number}[]){
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'same',boardEpoch:2,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const groups=[...new Map(rows.map(r=>[JSON.stringify([r.user,r.stroke??'same']),{originalUserId:r.user,snapshot:{...snapshot,strokeId:r.stroke??'same'}}])).entries()]
 const ops:CanonicalStrokeOperation[]=rows.map((r,i)=>({id:'op'+i,userId:r.user,timestamp:0,seq:r.seq??i+1,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:r.stroke??'same',frameOrdinal:r.ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:r.primary?{phase:'primary',group:0}:{phase:'between'},draws:[],fences:r.ended?[{kind:'gestureEnd',at:0}]:[]},material).packed}}))
 const attachment:CanonicalRecordedAttachmentV1={version:1,...scope,capabilities:groups.map(([,group])=>group),bindings:ops.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:groups.findIndex(([key])=>key===JSON.stringify([op.userId,op.frame.strokeId]))}))}
 return {atoms:prepareCanonicalRecordedAttachment(attachment,ops,scope),metadata:{...base,throughSeq:ops.length,operationCount:ops.length}}
}

const verify=(atoms:readonly import('./canonicalRecordedAttachment.js').CanonicalPreparedRecordedOperation[])=>verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',...scope,throughSeq:atoms.length,operationCount:atoms.length},atoms,scope)
const meta=(seq:number,type:'operation_undo'|'operation_redo',targetOpId:string,userId='A')=>({operation:{id:'meta'+seq,userId,timestamp:seq,seq,type,targetOpId}})
it('keeps explicit full history metadata separate from the old frame-only contract',()=>{
 expect(()=>parseCanonicalFullHistoryBase(base)).toThrow()
 expect(()=>parseCanonicalEmptyHistoryBase({...base,kind:'full-room-prefix-v2'})).toThrow()
 expect(verify([])).toEqual({base:{...base,kind:'full-room-prefix-v2'},gestures:[]})
})
it('folds completed gestures and prior metadata targets in global order without rewriting frame atoms',()=>{
 const f=fixture([{user:'A',ordinal:0,ended:true},{user:'B',ordinal:0,ended:true}]),before=f.atoms.map(a=>a.operation)
 const undone=verify([...f.atoms,meta(3,'operation_undo','op0')])
 expect(undone.gestures.map(g=>g.visible)).toEqual([false,true])
 const restored=verify([...f.atoms,meta(3,'operation_undo','op0'),meta(4,'operation_redo','meta3')])
 expect(restored.gestures.map(g=>g.visible)).toEqual([true,true]);expect(f.atoms.map(a=>a.operation)).toEqual(before)
 expect(verify([...f.atoms,meta(3,'operation_undo','op0'),meta(4,'operation_undo','op0')]).gestures[0].visible).toBe(false)
})
it('verifies a partial close over its real prefix and undoes the gesture without inventing a terminal material frame',()=>{
 const f=fixture([{user:'A',ordinal:0},{user:'A',ordinal:1}])
 const close:Operation={type:'canonical_stroke_close',id:'close',userId:'A',timestamp:3,seq:3,layerId:'L',targetUserId:'A',strokeId:'same',disposition:'commitPartial',recordedNext:2,firstFrameOpId:'op0',lastFrameOpId:'op1'}
 const atoms=[...f.atoms,{operation:close},meta(4,'operation_undo','op1')],result=verify(atoms)
 expect(result.gestures).toEqual([{userId:'A',layerId:'L',strokeId:'same',frameOperationIds:['op0','op1'],ended:false,sealed:true,visible:false,redoable:true}])
 expect(Object.isFrozen(result.gestures[0].frameOperationIds)).toBe(true)
 expect(verify([...atoms,meta(5,'operation_redo','meta4')]).gestures[0].visible).toBe(true)
 expect(()=>verify([...f.atoms,{operation:{...close,recordedNext:1}}])).toThrow()
 expect(()=>verify([...f.atoms,{operation:close},meta(4,'operation_undo','close')])).toThrow()
})
it('invalidates only future redo choices after a new own gesture, while accepted historical redo still restores the original branch',()=>{
 const f=fixture([{user:'A',stroke:'a',ordinal:0,ended:true},{user:'A',stroke:'b',ordinal:0,ended:true},{user:'A',stroke:'c',ordinal:0,seq:4}])
 const branched=[...f.atoms.slice(0,2),meta(3,'operation_undo','op1'),f.atoms[2]]
 expect(verify(branched).gestures.map(g=>({visible:g.visible,redoable:g.redoable}))).toEqual([{visible:true,redoable:true},{visible:false,redoable:false},{visible:true,redoable:true}])
 const repeated=[...branched,meta(5,'operation_undo','meta3')]
 expect(verify(repeated).gestures[1]).toMatchObject({visible:false,redoable:false})
 const historicallyRestored=[...repeated,meta(6,'operation_redo','meta5')]
 expect(verify(historicallyRestored).gestures[1]).toMatchObject({visible:true,redoable:true})
 expect(verify([...historicallyRestored,meta(7,'operation_undo','meta6')]).gestures[1]).toMatchObject({visible:false,redoable:true})
})
it('keeps redo eligible across another author and continuation of an already-open own gesture',()=>{
 for(const peer of [false,true]){
  const f=fixture(peer?[{user:'A',stroke:'b',ordinal:0,ended:true},{user:'B',stroke:'c',ordinal:0,seq:3}]:[{user:'A',stroke:'open',ordinal:0},{user:'A',stroke:'b',ordinal:0,ended:true},{user:'A',stroke:'open',ordinal:1,ended:true,seq:4}])
  const atoms=peer?[f.atoms[0],meta(2,'operation_undo','op0'),f.atoms[1]]:[...f.atoms.slice(0,2),meta(3,'operation_undo','op1'),f.atoms[2]]
  expect(verify(atoms).gestures.find(g=>g.strokeId==='b')).toMatchObject({visible:false,redoable:true})
 }
})
it('rejects open undo, foreign-author targets, future targets, gaps and independently rebound source pages',()=>{
 const open=fixture([{user:'A',ordinal:0}]),closed=fixture([{user:'A',ordinal:0,ended:true}])
 expect(()=>verify([...open.atoms,meta(2,'operation_undo','op0')])).toThrow()
 expect(()=>verify([...closed.atoms,meta(2,'operation_undo','op0','B')])).toThrow()
 expect(()=>verify([...closed.atoms,meta(2,'operation_undo','future')])).toThrow()
 expect(()=>verify([...closed.atoms,meta(3,'operation_undo','op0')])).toThrow()
 const a=fixture([{user:'A',ordinal:0},{user:'A',ordinal:1}]),b=fixture([{user:'A',ordinal:0},{user:'A',ordinal:1}])
 expect(()=>verify([a.atoms[0],b.atoms[1]])).toThrow()
})
