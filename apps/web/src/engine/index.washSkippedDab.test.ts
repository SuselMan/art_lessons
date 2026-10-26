import { describe,expect,it } from 'vitest'
import type { BrushDescriptor,Dab } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { creamyWash,type WashPixel } from './src/presets/brushWash'
import { brushDraws,createTestEngine,dab,makeLayerAdd,makeStroke } from './testing/engineTestUtils'

const brush:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-aabb3344ccdd5566eeff7788',version:125,
  scatter:undefined,flow:1,paperInteraction:0,opacityByPressure:[[0,0],[1,1]],
  behavior:{version:2,dynamics:{size:{control:'speed',minimum:0,jitter:0,curve:[[0,1],[1,0]]}},rendering:{accumulation:'alphaDarken',mode:'buildUp',opacityCeiling:'uniform',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},
}
installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored skipped wash',source:'qa',warnings:[],descriptor:brush}],assets:[],skipped:[]})

function history(chunks:Dab[][]):Array<{average:number;mode:number}>{
 const {engine}=createTestEngine({userId:'wash-owner'},{width:64,height:64})
 try{
  Object.assign(engine['gl'],{blendColor:()=>{}})
  engine.appendOperation(makeLayerAdd('wash-owner','ink'))
  for(const [index,dabs] of chunks.entries())engine.appendOperation(makeStroke('wash-owner','ink',dabs,{
   tool:'digitalBrush',preset:`brush:${brush.id}@125`,strokeId:'same-gesture',...(index===chunks.length-1?{strokeEnd:true as const}:{}),
  }),'remote')
  return brushDraws(engine).filter(d=>d.kind==='stamp').map(d=>{
   const average=d.uniforms.get('u_washAverage'),mode=d.uniforms.get('u_washMode')
   if(typeof average!=='number'||typeof mode!=='number')throw Error('Missing wash history uniforms')
   return {average,mode}
  })
 }finally{engine.destroy()}
}
const point=(size:number,pressure:number,normalizedSpeed=0):Dab=>dab(24,24,{size,pressure,opacity:1,normalizedSpeed})
describe('wash history admits only paintable radii',()=>{
 it('ignores a tiny high-opacity probe before two visible low-opacity dabs, including chunk boundaries',()=>{
  // Ribbon geometry first enforces a .5px radius floor. A size dynamic can
  // still shrink that admitted source footprint below the painter's .25 floor.
  const tiny=point(.1,.8,.9),first=point(20,.2),second=point(20,.2)
  const expected=history([[first,second]])
  expect(expected).toHaveLength(2)
  for(const entry of expected){expect(entry.average).toBeCloseTo(.2,6);expect(entry.mode).toBe(3)}
  expect(history([[tiny,first,second]])).toEqual(expected)
  expect(history([[tiny],[first],[second]])).toEqual(expected)
  // Independent half-covered pixel witness: the two admitted averages yield
  // alpha .15. Letting the skipped .8 dab into A would instead give .1854.
  let pixel:WashPixel=[0,0,0,0]
  for(const entry of expected)pixel=creamyWash(pixel,[1,0,0],.5,.2,1,entry.average)
  expect(pixel[3]).toBeCloseTo(.15,6)
 })
 it('still updates falling/rising opacity for every admitted dab across chunks',()=>{
  const valid=[point(20,.8),point(20,.2),point(20,.9),point(20,.2)]
  const full=history([valid]),chunks=history(valid.map(d=>[d]))
  expect(chunks).toEqual(full)
  for(const [index,average] of [.8,.74,.9,.83].entries())expect(full[index].average).toBeCloseTo(average,6)
  expect(full.map(d=>d.mode)).toEqual([3,2,3,2])
 })
 it('preserves the existing radius floor, including admission exactly at .25',()=>{
  expect(history([[point(1,.8,.5001)]])).toEqual([])
  const admitted=history([[point(1,.8,.5)]])
  expect(admitted).toHaveLength(1);expect(admitted[0].average).toBeCloseTo(.8,6)
 })
})
