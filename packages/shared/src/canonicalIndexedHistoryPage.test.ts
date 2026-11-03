import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G} from './canonicalStrokeFrame.js'
import type {CanonicalStrokeSnapshotV3} from './canonicalStrokeOperation.js'
import {expect,it,vi} from 'vitest'
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import type {BrushDescriptor} from './brushes.js'
import {canonicalDefaultAutoSourceBinding} from './canonicalDefaultAutoMaterial.js'
import {buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {CANONICAL_STROKE_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
import type {CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import type {CanonicalIndexedOperation} from './canonicalIndexedHistory.js'
import {parseCanonicalIndexedHistoryBegin} from './canonicalIndexedHistory.js'
import {prepareCanonicalIndexedHistoryPage,prepareCanonicalIndexedRootEvidence} from './canonicalIndexedHistoryPage.js'
const scope={roomId:'room',boardEpoch:2,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE]}
const begin=(cut=4)=>parseCanonicalIndexedHistoryBegin({kind:'canonical-indexed-history-begin-v1',streamId:'read',offerId:'offer',scope,roomGeometry:{width:512,height:512,infinite:false},authorRasterProfile:CANONICAL_STROKE_RASTER_PROFILE,floor:0,throughSeq:cut,operationCount:cut})
const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'stroke',boardEpoch:2,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
function frame(seq=1,strokeId='stroke',ended=true,ordinal=0):CanonicalStrokeOperation{
 return {id:'frame'+seq,userId:'actor',timestamp:0,seq,type:'canonical_stroke',layerId:'layer-1',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId,frameOrdinal:ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:ended?[{kind:'gestureEnd',at:0}]:[]},material).packed}}
}
const undo=(seq:number)=>({id:'undo'+seq,userId:'actor',timestamp:0,seq,type:'operation_undo' as const,targetOpId:'frame1'})
function attachment(rows:readonly CanonicalIndexedOperation[]):CanonicalRecordedAttachmentV1{
 const capabilities:CanonicalRecordedAttachmentV1['capabilities'][number][]=[],bindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[]
 for(const op of rows){if(op.type!=='canonical_stroke')continue
  let i=capabilities.findIndex(c=>c.snapshot.strokeId===op.frame.strokeId)
  if(i<0){i=capabilities.length;capabilities.push({originalUserId:'actor',snapshot:{...snapshot,strokeId:op.frame.strokeId}})}
  bindings.push({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:i})
 }
 return {version:1,roomId:'room',boardEpoch:2,capabilities,bindings}
}
const page=(rows:readonly CanonicalIndexedOperation[],afterSeq=0,terminal=false,cut=4)=>({kind:'canonical-indexed-history-page-v1',streamId:'read',throughSeq:cut,afterSeq,nextAfterSeq:afterSeq+rows.length,operations:rows,canonicalCapabilities:attachment(rows),terminal,...terminal?{finish:{kind:'canonical-indexed-history-finish-v1',streamId:'read',throughSeq:cut,operationCount:cut,lastSeq:cut}}:{}})
const root={originalUserId:'actor',strokeId:'stroke',layerId:'layer-1',firstOperationId:'frame1',firstSequence:1}
function evidence(rows:readonly CanonicalIndexedOperation[]=[frame()]){
 return {kind:'canonical-indexed-history-root-evidence-v1',streamId:'read',throughSeq:4,root,rows,canonicalCapabilities:attachment(rows),first:0,terminal:0,lastMetadata:null as number|null,latestRedo:null as number|null,firstUndoAfterLatestRedo:null as number|null,ownBranchAfterUndo:null as number|null}
}
it('preserves an OPEN frame at a page boundary and grants no original delivery',()=>{
 const original=frame(1,'stroke',false),p=prepareCanonicalIndexedHistoryPage(page([original]),begin(),0)
 expect(p.page.terminal).toBe(false);expect(p.page.nextAfterSeq).toBe(1)
 expect(p.page.operations[0]).toEqual(original)
 expect(p.atoms[0]).not.toHaveProperty('delivery')
 expect(p.page.canonicalCapabilities).not.toBe(attachment([original]))
})
it('accepts bounded pages deep into a long cut without keeping its prefix',()=>{
 const rows=[undo(2048),undo(2049)]
 expect(prepareCanonicalIndexedHistoryPage(page(rows,2047,false,10000),begin(10000),2047).page.nextAfterSeq).toBe(2049)
})
it('requires a genuine empty terminal range at C and exact finish count',()=>{
 expect(prepareCanonicalIndexedHistoryPage(page([],4,true),begin(),4).page).toMatchObject({terminal:true,nextAfterSeq:4,operations:[],finish:{lastSeq:4,operationCount:4}})
 for(const v of [page([],0,true),page([],4,false),page([undo(4)],3,true),{...page([],4,true),finish:{...page([],4,true).finish,lastSeq:3}}])expect(()=>prepareCanonicalIndexedHistoryPage(v,begin(),v.afterSeq)).toThrow()
 expect(prepareCanonicalIndexedHistoryPage(page([],0,true,0),begin(0),0).page.terminal).toBe(true)
})
it('rejects a sequence hole, cursor substitution, wrong cut and false completion',()=>{
 for(const v of [page([undo(2)]),{...page([undo(1)]),nextAfterSeq:3},{...page([undo(1)]),streamId:'foreign'},{...page([undo(1)]),throughSeq:3},{...page([undo(1)]),finish:{}}])expect(()=>prepareCanonicalIndexedHistoryPage(v,begin(),0)).toThrow()
})
it('rejects packed-byte excess before decode and row accessors before invoking them',()=>{
 const op=frame();op.frame={...op.frame,materialPacked:'x'.repeat(4*1024*1024+1)}
 expect(()=>prepareCanonicalIndexedHistoryPage(page([op]),begin(),0)).toThrow()
 const get=vi.fn(()=>frame()),rows=[frame()];Object.defineProperty(rows,'0',{get})
 expect(()=>prepareCanonicalIndexedHistoryPage({...page([]),operations:rows},begin(),0)).toThrow()
 expect(get).not.toHaveBeenCalled()
})
it('captures a single ended original as both first and terminal witness',()=>{
 const result=prepareCanonicalIndexedRootEvidence(evidence(),begin(),root)
 expect(result.evidence.rows).toHaveLength(1)
 expect(result.evidence.first).toBe(result.evidence.terminal)
 expect(result).not.toHaveProperty('visible')
})
it('keeps FIRST undo and genuine new own frame distinct from later repeated undo',()=>{
 const v={...evidence([frame(),undo(2),frame(3,'branch'),undo(4)]),lastMetadata:3,firstUndoAfterLatestRedo:1,ownBranchAfterUndo:2}
 const result=prepareCanonicalIndexedRootEvidence(v,begin(),root).evidence
 expect(result.rows[result.firstUndoAfterLatestRedo!].seq).toBe(2)
 expect(result.rows[result.lastMetadata!].seq).toBe(4)
 expect(result.rows[result.ownBranchAfterUndo!].seq).toBe(3)
})
it('rejects missing roles, unused witnesses, fake terminal and foreign root',()=>{
 for(const v of [{...evidence(),first:null},{...evidence([frame(),undo(2)]),lastMetadata:1},{...evidence([frame(),undo(2)]),firstUndoAfterLatestRedo:1},{...evidence(),terminal:6},{...evidence([frame(1,'stroke',false)])},{...evidence(),root:{...root,originalUserId:'other'}}])expect(()=>prepareCanonicalIndexedRootEvidence(v,begin(),root)).toThrow()
})
it('rejects more than six witnesses and an own-branch frame before first undo',()=>{
 expect(()=>prepareCanonicalIndexedRootEvidence(evidence(Array.from({length:7},(_,i)=>frame(i+1,'stroke'+i))),begin(10),root)).toThrow()
 const v={...evidence([frame(),frame(2,'branch'),undo(3)]),lastMetadata:2,firstUndoAfterLatestRedo:2,ownBranchAfterUndo:1}
 expect(()=>prepareCanonicalIndexedRootEvidence(v,begin(),root)).toThrow()
})

it('normalizes actual3 page and ended root evidence with explicit snapshot dispatch and original role identity',()=>{
 const primary={id:'asset:'+'1'.repeat(64),size:1,x:0,y:0,width:1,height:1},pattern={id:'asset:'+'2'.repeat(64),size:2,x:0,y:0,width:2,height:2}
 const s:CanonicalStrokeSnapshotV3={...snapshot,rasterProfile:G,materialVersion:3,assets:[primary,pattern],material:{version:3,assets:[primary,pattern],primarySource:{kind:'image',asset:primary.id,brushScale:1,brushAngle:0},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:2,height:2,periodX:2,periodY:2,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},budget:{workUnits:1000,outputBytes:1000,drawPixels:1000}}}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:{kind:'image',asset:primary.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:1,height:1,mirrorH:false,mirrorV:false},role:'primary',x:0,y:0,opacity:1,flow:1,grainDepth:.5}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},s.material).packed
 const op:CanonicalStrokeOperation={...frame(),frame:{version:2,rasterProfile:G,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:packed}}
 const cap:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'actor',snapshot:s}],bindings:[{operationId:op.id,sequence:1,originalUserId:'actor',capability:0}]}
 const current=parseCanonicalIndexedHistoryBegin({...begin(),scope:{...scope,allowedRasterProfiles:[G]},authorRasterProfile:G})
 const result=prepareCanonicalIndexedRootEvidence({...evidence([op]),canonicalCapabilities:cap},current,root)
 expect(result.atoms[0].read!.capability.snapshot.materialVersion).toBe(3)
 expect(result.evidence.rows[0]).toEqual(op)
 expect(prepareCanonicalIndexedHistoryPage({...page([op]),canonicalCapabilities:cap},current,0).atoms[0].read!.capability.snapshot.materialVersion).toBe(3)
 const noEnd={...op,frame:{...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},s.material).packed}}
 expect(()=>prepareCanonicalIndexedRootEvidence({...evidence([noEnd]),canonicalCapabilities:cap},current,root)).toThrow()
})

it('roundtrips actual browser scaled SOURCE2 originals through page and root evidence before validating exact envelope metadata',()=>{
 const B='browser-highp-rgba8-v1' as const
 const source={...pin,coverageProfile:'browser-number-coverage-v1' as const}
 const context={...material,primarySource:source,scaledSource:'source-scale-v1' as const}
 const original={...snapshot,rasterProfile:B,material:context,composition:{...snapshot.composition,mode:'buildup' as const}}
 const op={...frame(),frame:{...frame().frame,version:2 as const,rasterProfile:B,composition:original.composition,sourceScale:source.brushScale,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{kind:'gestureEnd',at:0}]},context).packed}}
 const start=parseCanonicalIndexedHistoryBegin({kind:'canonical-indexed-history-begin-v1',streamId:'read',offerId:'offer',scope:{...scope,allowedRasterProfiles:[B]},roomGeometry:{width:512,height:512,infinite:false},authorRasterProfile:B,plainAutoGeometrySource:'dynamic-auto-geometry-v1',floor:0,throughSeq:1,operationCount:1})
 const capabilities={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'actor',snapshot:original}],bindings:[{operationId:op.id,sequence:1,originalUserId:'actor',capability:0}]}
 const wire={...page([op],0,false,1),canonicalCapabilities:capabilities}
 expect(prepareCanonicalIndexedHistoryPage(wire,start,0).page.operations[0]).toEqual(op)
 const witness={...evidence([op]),throughSeq:1,canonicalCapabilities:capabilities}
 expect(prepareCanonicalIndexedRootEvidence(witness,start,root).evidence.rows[0]).toEqual(op)
 const {sourceScale:_,...missing}=op.frame
 for(const f of [missing,{...op.frame,sourceScale:source.brushScale+1},{...op.frame,sourceTipGradient:{kind:'captured-tip-gradient-rgba8-v1',rgba:Array(1024).fill(0)}},{...op.frame,unknown:true}])expect(()=>prepareCanonicalIndexedHistoryPage({...wire,operations:[{...op,frame:f}]},start,0)).toThrow()
 const get=vi.fn(()=>source.brushScale),accessor={...op.frame};Object.defineProperty(accessor,'sourceScale',{get})
 expect(()=>prepareCanonicalIndexedHistoryPage({...wire,operations:[{...op,frame:accessor}]},start,0)).toThrow()
 expect(get).not.toHaveBeenCalled()
})
