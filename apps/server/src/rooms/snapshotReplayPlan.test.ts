import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { planSnapshotReplay } from './snapshotReplayPlan.js'

const stroke = (id: string, seq: number, layerId = 'L'): Operation => ({
  id, seq, layerId, type: 'stroke', userId: 'A', timestamp: seq, tool: 'pencil',
  preset: 'HB', color: [0, 0, 0], dabs: [],
})
const change = (id: string, seq: number, targetOpId: string, type: 'operation_undo' | 'operation_redo' | 'operation_revoke' = 'operation_undo'): Operation => ({ id, seq, targetOpId, type, userId: 'A', timestamp: seq })
const snapshot = (seq: number, layerId = 'L') => ({ layerId, seq, hash: 'hash-' + seq })

describe('snapshot history dependency selection', () => {
  it('keeps normal room snapshots and does not request unrelated history', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(4, 'other')], [stroke('s', 3)])
    expect(p.coverage).toEqual(new Map([['L', 5], ['other', 4]]))
    expect(p.historyLayers.size).toBe(0)
  })
  it('rejects actual undo5 snapshot after redo6 of stroke3, without changing other layer', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(10, 'other')], [stroke('s', 3), change('u', 5, 's'), change('r', 6, 's', 'operation_redo')])
    expect(p.snapshots).toEqual([snapshot(10, 'other')])
    expect(p.historyLayers).toEqual(new Set(['L']))
  })
  it('includes the boundary mutation in snapshot state and uses it until a later change', () => {
    expect(planSnapshotReplay([snapshot(5)], [stroke('s', 3), change('u', 5, 's')]).coverage.get('L')).toBe(5)
  })
  it('selects a retained snapshot before target instead of discarding all acceleration', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(2)], [stroke('s', 3), change('u', 6, 's')])
    expect(p.coverage.get('L')).toBe(2)
    expect(p.historyLayers.size).toBe(0)
  })
  it('rejects equality target watermark and takes earliest target for multiple changes', () => {
    const p = planSnapshotReplay([snapshot(5), snapshot(2)], [stroke('s', 5), stroke('early', 2), change('u', 6, 's'), change('r', 7, 'early', 'operation_revoke')])
    expect(p.coverage.has('L')).toBe(false)
  })
  it('conservatively invalidates undo/redo net-done and recursive meta targets', () => {
    const p = planSnapshotReplay([snapshot(5)], [stroke('s', 3), change('u', 6, 's'), change('r', 7, 'u', 'operation_redo')])
    expect(p.historyLayers.has('L')).toBe(true)
  })
  it('fails closed when a cold-load target has not been resolved', () => {
    expect(planSnapshotReplay([snapshot(5)], [change('u', 6, 'missing')]).unresolvedTargets).toEqual(new Set(['missing']))
  })
  it('loads duplicate source and nested merge sources when result must replay', () => {
    const merge: Operation = { id: 'm', seq: 4, timestamp: 4, userId: 'A', type: 'layer_merge', layerId: 'M', name: 'M', sources: [{ id: 'S', opacity: 1 }], parentId: null, index: 0 }
    const copy: Operation = { id: 'd', seq: 5, timestamp: 5, userId: 'A', type: 'layer_duplicate', layerId: 'D', sourceId: 'M', name: 'D', sourceOpacity: 1, sourceVisible: true, parentId: null, index: 0 }
    const p = planSnapshotReplay([snapshot(6, 'D'), snapshot(4, 'M'), snapshot(3, 'S')], [merge, copy, change('u', 7, 'd')])
    expect(p.historyLayers).toEqual(new Set(['M', 'S', 'D']))
    expect(p.snapshots).toEqual([])
  })
})


describe('structural coverage independently from pixel candidates', () => {
  it('requires original structure and deleted source history even with no source blob', () => {
    const target: Operation = { id: 'delete3', seq: 3, timestamp: 3, userId: 'A', type: 'layer_delete', layerIds: ['S'] }
    const plan = planSnapshotReplay([snapshot(5, 'unrelated')], [target, change('undo6', 6, target.id)], undefined, 5)
    expect(plan.replayStructure).toBe(true)
    expect(plan.historyLayers).toContain('S')
    expect(plan.snapshots).toEqual([snapshot(5, 'unrelated')])
  })
  it('does not rebuild an uploaded tree for a mutation already included at its boundary', () => {
    const target: Operation = { id: 'delete3', seq: 3, timestamp: 3, userId: 'A', type: 'layer_delete', layerIds: ['S'] }
    expect(planSnapshotReplay([snapshot(5)], [target, change('undo5', 5, target.id)], undefined, 5).replayStructure).toBeUndefined()
  })
  it('does not substitute structural replay for ordinary covered pigment undo', () => {
    expect(planSnapshotReplay([snapshot(5)], [stroke('s', 3), change('undo6', 6, 's')], undefined, 5).replayStructure).toBeUndefined()
  })
})

function canonicalChunk(id:string,seq:number,ordinal:number):Extract<Operation,{type:'canonical_stroke'}>{return{id,seq,userId:'A',timestamp:seq,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:source@1',strokeId:'S',frameOrdinal:ordinal,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'2|already verified by loader'}}}
it.each(['first','last'] as const)('invalidates snapshot covering any earlier canonical group chunk when undo addresses %s',which=>{
 const first=canonicalChunk('first',1,0),last=canonicalChunk('last',4,1)
 const plan=planSnapshotReplay([snapshot(2),snapshot(5,'safe')],[first,last,change('undo',6,which)])
 expect(plan.coverage.has('L')).toBe(false);expect(plan.historyLayers.has('L')).toBe(true)
 expect(plan.snapshots).toEqual([snapshot(5,'safe')]);expect(plan.unresolvedTargets.size).toBe(0)
})
it.each(['missing','duplicate','brush','layer','pigment','composition','materialVersion'] as const)('refuses missing or conflicting canonical group first context: %s',kind=>{
 let first=canonicalChunk('first',1,0);const last=canonicalChunk('last',4,1)
 if(kind==='materialVersion')first={...first,frame:{...first.frame,materialPacked:'1|old PNG'}}
 if(kind==='brush')first={...first,frame:{...first.frame,brush:'brush:other@1'}}
 if(kind==='layer')first={...first,layerId:'other'}
 if(kind==='pigment')first={...first,frame:{...first.frame,pigmentRgb8:[9,9,9]}}
 if(kind==='composition')first={...first,frame:{...first.frame,composition:{...first.frame.composition,outerResourceOpacity:.5}}}
 const ops:Operation[]=[...kind==='missing'?[]:[first],last,change('undo',6,'last')]
 if(kind==='duplicate')ops.push({...first,id:'duplicate-first'})
 expect(planSnapshotReplay([snapshot(2)],ops).unresolvedTargets.has('last')).toBe(true)
})

it('preserves the historical PNG materialV1 target-chunk lane without granting it new V2 prefix readiness',()=>{
 const target=canonicalChunk('old-png-last',4,1),v1={...target,frame:{...target.frame,materialPacked:'1|historical PNG payload'}}
 const old=planSnapshotReplay([snapshot(2)],[v1,change('undo',6,v1.id)])
 expect(old.coverage.get('L')).toBe(2);expect(old.unresolvedTargets.size).toBe(0)
 for(const packed of ['2|new source','unknown malformed tag']){
  const current={...target,frame:{...target.frame,materialPacked:packed}}
  expect(planSnapshotReplay([snapshot(2)],[current,change('undo',6,current.id)]).unresolvedTargets.has(current.id)).toBe(true)
 }
})


it.each(['sourceScale','sourceColorFields','sourceRoleTextures','sourceTipGradient','textureGradient','texturePhase'] as const)('refuses an ordinal0 anchor with a different immutable canonical resource context (%s)',key=>{
 const phase={kind:'resolved-stroke-phase-v1' as const,x:1,y:2}
 const texture={kind:'canvasTexture' as const,asset:'asset:'+ 'a'.repeat(64),law:'pixel-texture-u8-v1' as const,mode:'multiply' as const,soft:false,width:8,height:8,periodX:8,periodY:8,phase,strength:'recorded-grain-v1' as const}
 const contexts={sourceScale:.375,sourceColorFields:{primary:{kind:'total-random-rgb8-hash-v1' as const}},sourceRoleTextures:{primary:texture},sourceTipGradient:{kind:'captured-tip-gradient-rgba8-v1' as const,rgba:Array.from({length:1024},(_,i)=>i%256)},textureGradient:{kind:'captured-texture-gradient-rgba8-v1' as const,rgba:Array.from({length:1024},(_,i)=>(i+1)%256)},texturePhase:phase}
 const changed={sourceScale:.5,sourceColorFields:{primary:null},sourceRoleTextures:{primary:{...texture,phase:{...phase,x:3}}},sourceTipGradient:{...contexts.sourceTipGradient,rgba:contexts.sourceTipGradient.rgba.map((v,i)=>i===0?255:v)},textureGradient:{...contexts.textureGradient,rgba:contexts.textureGradient.rgba.map((v,i)=>i===0?255:v)},texturePhase:{...phase,x:3}}
 const first=canonicalChunk('resource-first',1,0),last=canonicalChunk('resource-last',4,1)
 // The loader owns frame/prefix decoding. This pure dependency selector gets
 // decoded DATA and must not substitute another resource context as ordinal0.
 Object.assign(first.frame,{version:2,rasterProfile:'browser-highp-rgba8-v1',[key]:contexts[key]})
 Object.assign(last.frame,{version:2,rasterProfile:'browser-highp-rgba8-v1',materialPacked:'2|different verified per-frame DRAW payload',[key]:structuredClone(contexts[key])})
 const valid=planSnapshotReplay([snapshot(2)],[first,last,change('undo',6,last.id)])
 expect(valid.unresolvedTargets.size).toBe(0);expect(valid.coverage.has('L')).toBe(false)
 // Resource objects are structurally equal copies, while frame payloads and
 // ordinals may differ. Only the captured per-stroke envelope is immutable.
 const { [key]:missing,...withoutResource}=first.frame
 expect(missing).toBeDefined()
 const missingFirst={...first,frame:withoutResource}
 const rejected=planSnapshotReplay([snapshot(2)],[missingFirst,last,change('undo',6,last.id)])
 expect(rejected.unresolvedTargets.has(last.id)).toBe(true)
 const changedFirst={...first,frame:{...first.frame,[key]:changed[key]}}
 expect(planSnapshotReplay([snapshot(2)],[changedFirst,last,change('undo',6,last.id)]).unresolvedTargets.has(last.id)).toBe(true)
})
it('refuses changed sourceScale values while keeping per-frame material and ordinal changes independent',()=>{
 const first=canonicalChunk('scale-first',1,0),last=canonicalChunk('scale-last',4,1)
 Object.assign(first.frame,{sourceScale:.5});Object.assign(last.frame,{sourceScale:.75,materialPacked:'2|different verified per-frame DRAW payload'})
 expect(planSnapshotReplay([snapshot(2)],[first,last,change('undo',6,last.id)]).unresolvedTargets.has(last.id)).toBe(true)
})
