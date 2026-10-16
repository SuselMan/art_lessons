import {describe,expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
import {closedWatercolorCheckpoint} from './closedWatercolorCheckpoint'
import {CheckpointStore,type Checkpoint} from './checkpointStore'
const stroke=(id:string,userId='A'):StrokeOperation=>({id,type:'stroke',userId,layerId:'L',timestamp:1,
  strokeId:id,washId:'m70:L',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],
  dabs:[{x:0,y:0,size:10,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]})
const dry:Operation={id:'dry',type:'paper_dry',layerId:'L',userId:'A',timestamp:2}
function apply(log:OperationLog,op:Operation){log.append(op,{},false)
  if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId)}
const undo=(targetOpId:string,userId='A'):Operation=>({id:'undo-'+targetOpId,type:'operation_undo',targetOpId,userId,timestamp:3})
function proof(log:OperationLog){return closedWatercolorCheckpoint('L',log.watercolorEffectiveOperations(),()=>({revision:log.revision,operations:log.watercolorEffectiveOperations()}))}
function fixture(){const log=new OperationLog();apply(log,stroke('a'));apply(log,dry);return log}
describe('closed M70 material checkpoint proof',()=>{
  it('reuses a dry epoch across same wash ID and undo of a later stroke',()=>{
    const log=fixture(),closed=proof(log)!
    const cp:Checkpoint={layerId:'L',opIds:['a'],tiles:[],...closed}
    const store=new CheckpointStore(1024);store.add(cp)
    apply(log,stroke('b'))
    expect(store.best('L',log.layerPixelOps('L'))).toEqual({cp,start:1})
    apply(log,undo('b'))
    expect(closed.canonicalValid()).toBe(true)
    expect(store.startOf(cp,log.layerPixelOps('L'))).toBe(1)
  })
  it('rejects undo of pigment before the dry boundary',()=>{
    const log=fixture(),closed=proof(log)!;apply(log,stroke('b'));apply(log,undo('a'))
    expect(closed.canonicalValid()).toBe(false)
  })
  it('rejects undo of dry despite unchanged stroke IDs',()=>{
    const log=fixture(),closed=proof(log)!;apply(log,undo('dry'))
    expect(log.layerPixelOps('L').map(op=>op.id)).toEqual(['a'])
    expect(closed.canonicalValid()).toBe(false)
  })
  it('rejects same-ID water projection changes and lost foreign protection',()=>{
    const log=new OperationLog();apply(log,stroke('a'));apply(log,stroke('b','B'));apply(log,dry)
    const colored=proof(log)!;apply(log,undo('a'))
    expect(colored.canonicalValid()).toBe(false)
    const retained=proof(log)!;expect(retained).not.toBeNull();apply(log,undo('b','B'))
    expect(retained.canonicalValid()).toBe(false)
  })
  it('rejects material backfilled before its endpoint',()=>{
    const log=fixture(),closed=proof(log)!
    log.prependHistorical([{op:stroke('earlier','B'),state:'done'}])
    expect(closed.canonicalValid()).toBe(false)
  })
  it('does not prove open water or another layer dry',()=>{
    const log=new OperationLog();apply(log,stroke('a'));expect(proof(log)).toBeNull()
    apply(log,{...dry,layerId:'other'});expect(proof(log)).toBeNull()
  })
  it('validates every lookup, including an in-progress sliced replay',()=>{
    const log=fixture(),closed=proof(log)!
    const cp:Checkpoint={layerId:'L',opIds:['a'],tiles:[],...closed}
    const store=new CheckpointStore(1024);store.add(cp);apply(log,stroke('b'))
    expect(store.startOf(cp,log.layerPixelOps('L'))).toBe(1)
    apply(log,undo('dry'))
    expect(store.startOf(cp,log.layerPixelOps('L'))).toBe(-1)
    expect(store.best('L',log.layerPixelOps('L'))).toBeNull()
    const unproven:Checkpoint={layerId:'L',opIds:['a'],tiles:[],closedWashIds:['m70:L']}
    expect(store.startOf(unproven,log.layerPixelOps('L'))).toBe(-1)
  })
})

it('includes layer-transform material in the proof, not only layerId operations',()=>{
  const log=new OperationLog();apply(log,stroke('a'))
  const transform:Operation={id:'transform',type:'layer_transform',userId:'A',timestamp:2,
    transforms:[{layerId:'L',matrix:[1,0,0,1,10,0]}]}
  apply(log,transform);apply(log,dry)
  const closed=proof(log)!
  apply(log,undo('transform'))
  expect(closed.canonicalValid()).toBe(false)
})

it('rejects three-author dependency changes on either side of a dry boundary',()=>{
  const log=new OperationLog()
  apply(log,stroke('water','A'));apply(log,stroke('blue','B'));apply(log,stroke('yellow','C'));apply(log,dry)
  const colored=proof(log)!
  apply(log,undo('water','A'))
  expect(colored.canonicalValid()).toBe(false)
  const effective=()=>log.watercolorEffectiveOperations().filter((op):op is StrokeOperation=>op.type==='stroke')
  expect(effective().find(op=>op.id==='water')?.preset.split(':')[2]).toBe('0')
  const retained=proof(log)!
  apply(log,stroke('after-dry','C'))
  expect(retained.canonicalValid()).toBe(true)
  apply(log,undo('blue','B'))
  expect(retained.canonicalValid()).toBe(false)
  // C's earlier contribution still protects A's historical water.
  expect(effective().some(op=>op.id==='water')).toBe(true)
  apply(log,undo('yellow','C'))
  // C's new post-dry stroke cannot adopt water lost in the old epoch.
  expect(effective().some(op=>op.id==='water')).toBe(false)
})
