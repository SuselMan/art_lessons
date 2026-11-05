import { expect,it } from 'vitest'
import { strokeDabs,type BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushDraws,createTestEngine,makeLayerAdd,paperReady,simulateStroke } from './testing/engineTestUtils'

it('captures view speed before live geometry, logs v2, and replays at an unrelated viewport',async()=>{
 const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-5555aaaa6666bbbb7777cccc',version:123,spacing:.1,scatter:undefined,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],
  behavior:{version:2,speedInput:{version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'},spacing:{mode:'diameter',coefficient:.1},modulations:{size:[{control:'speed',minimum:0,jitter:0,curve:[[0,1],[1,0]]}]}}}
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Speed fixture',source:'qa',warnings:[],descriptor}],assets:[],skipped:[]})
 const {engine}=createTestEngine({userId:'speed-owner'},{width:128,height:64})
 const {engine:peer}=createTestEngine({userId:'speed-peer'},{width:128,height:64})
 try{
  for(const e of [engine,peer]){e.appendOperation(makeLayerAdd('speed-owner','ink'));e.setActiveLayer('ink');e.setCompositeOrder([{id:'ink',opacity:1}]);await paperReady(e)}
  engine.setTool('digitalBrush');engine.setPencil(`brush:${descriptor.id}@123`);engine.setSize(30)
  const points=Array.from({length:11},(_,i)=>({x:8+i*10,y:24}))
  simulateStroke(engine,points,{pressure:1,speed:99,viewSpeed:15,timeStamp:0})
  const op=engine.getOperations().find(o=>o.type==='stroke');if(!op||op.type!=='stroke')throw new Error('Missing operation')
  expect(op.dabsPacked?.startsWith('2:')).toBe(true)
  const dabs=strokeDabs(op);expect(dabs.length).toBeGreaterThan(20)
  expect(dabs.every(d=>d.t===0&&d.normalizedSpeed===.5)).toBe(true)
  const liveRadii=brushDraws(engine).filter(d=>d.kind==='stamp').map(d=>d.uniforms.get('u_dabRadius'))
  expect(liveRadii.length).toBeGreaterThan(0)
  for(const radius of liveRadii)expect(radius).toBeCloseTo(7.5)
  peer.setViewport(200,300,3,.4)
  peer.appendOperation(op,'remote')
  const peerRadii=brushDraws(peer).filter(d=>d.kind==='stamp').map(d=>d.uniforms.get('u_dabRadius'))
  expect(peerRadii).toEqual(liveRadii)
  // Explicit zero overrides measured nonzero view speed for native paintLine.
  simulateStroke(engine,points.map(p=>({...p,y:48})),{pressure:1,speed:99,viewSpeed:15,normalizedSpeed:0,timeStamp:0})
  const other=engine.getOperations().filter(o=>o.type==='stroke').at(-1)!
  expect(strokeDabs(other).every(d=>d.normalizedSpeed===0)).toBe(true)
 }finally{engine.destroy();peer.destroy()}
})
