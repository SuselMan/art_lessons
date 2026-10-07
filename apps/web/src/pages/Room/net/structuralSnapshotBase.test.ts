import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { doneOperationsFromHistory } from '../../../engine'
import { replayLayerState } from '../../../lib/layers/layers'
import { makeInitialLayerState } from '../../../stores/slices/layerSlice'
import { assertStructuralSnapshotBase } from './structuralSnapshotBase'

const add: Operation = {id:'add1',seq:1,timestamp:1,userId:'A',type:'layer_add',layerId:'S',name:'Source',parentId:null,index:0}
const move: Operation = {id:'move2',seq:2,timestamp:2,userId:'A',type:'layer_move',layerIds:['S'],parentId:null,index:2}
const opacity: Operation = {id:'opacity3',seq:3,timestamp:3,userId:'A',type:'layer_opacity',layerIds:['S'],opacity:.3}
const visibility: Operation = {id:'visibility4',seq:4,timestamp:4,userId:'A',type:'layer_visibility',layerIds:['S'],visible:false}
const state=(ops:Operation[])=>replayLayerState(makeInitialLayerState(),doneOperationsFromHistory(ops))

describe('original structural snapshot base',()=>{
 it('accepts complete original shared topology/style and boundary undo state',()=>{
  const undo:Operation={id:'undo5',seq:5,timestamp:5,userId:'A',type:'operation_undo',targetOpId:opacity.id}
  const ops=[add,move,opacity,visibility,undo]
  expect(()=>assertStructuralSnapshotBase(state(ops),ops)).not.toThrow()
  expect(state(ops).items.S.opacity).toBe(1)
  expect(()=>assertStructuralSnapshotBase(state(ops),[add,move,opacity,visibility])).toThrow('original prefix')
 })
 it.each([move,opacity,visibility])('refuses an incomplete legacy-like prefix missing $type',missing=>{
  const ops=[add,move,opacity,visibility]
  expect(()=>assertStructuralSnapshotBase(state(ops),ops.filter(op=>op.id!==missing.id))).toThrow('original prefix')
 })
 it('does not infer unknown snapshot-only roots from currently alive ids',()=>{
  const uploaded=state([add])
  expect(()=>assertStructuralSnapshotBase(uploaded,[])).toThrow('original prefix')
 })
 it('ignores localized implicit names and local selection/collapse',()=>{
  const folder:Operation={id:'folder2',seq:2,timestamp:2,userId:'A',type:'folder_add',layerId:'F',name:'Folder'}
  const ops=[add,folder],uploaded=state(ops)
  uploaded.items.background={...uploaded.items.background,name:'Бумага'}
  uploaded.items['layer-1']={...uploaded.items['layer-1'],name:'Слой 1'}
  if(uploaded.items.F.kind==='folder')uploaded.items.F.collapsed=true
  uploaded.activeId='S';uploaded.selectedIds=['S']
  expect(()=>assertStructuralSnapshotBase(uploaded,ops)).not.toThrow()
 })
 it('does not treat explicit shared initial-layer rename as a localized default',()=>{
  const rename:Operation={id:'rename2',seq:2,timestamp:2,userId:'A',type:'layer_rename',layerId:'layer-1',name:'Shared caption'}
  const uploaded=state([rename]);uploaded.items['layer-1']={...uploaded.items['layer-1'],name:'Wrong shared caption'}
  expect(()=>assertStructuralSnapshotBase(uploaded,[rename])).toThrow('original prefix')
 })
})
