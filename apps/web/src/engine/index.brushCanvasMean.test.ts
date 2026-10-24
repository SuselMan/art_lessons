import {expect,it,vi} from 'vitest'
import type {BrushDescriptor} from '@grafetto/shared'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from './testing/engineTestUtils'

it('pure mean primes once, samples previous current-size contact across chunks, and transfers a1x1 constant',async()=>{
 const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-123456789abc123456789abc',version:13,model:'mixer',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2},mixer:{load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas',smearAlpha:true,sampling:{mode:'uniformMean',radius:.0041}}}
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored pure mean',source:'qa',descriptor,warnings:[]}],assets:[],skipped:[]})
 const {engine}=createTestEngine({}, {width:256,height:128})
 const painter=engine['_smudge'] as unknown as {meanPreviousCanvas:(...args:unknown[])=>unknown;drawTransferDab:(...args:unknown[])=>void}
 const mean=vi.spyOn(painter,'meanPreviousCanvas'),transfer=vi.spyOn(painter,'drawTransferDab'),uniform=vi.spyOn(engine['gl'],'uniform4f')
 const append=(x:number,size:number,end=false)=>engine.appendOperation(makeStroke('peer','ink',[dab(x,64,{size,pressure:1})],{tool:'digitalBrush',preset:`brush:${descriptor.id}@13`,strokeId:'mean',...(end?{strokeEnd:true as const}:{})}),'remote')
 try {
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));append(40.25,48)
  expect(mean).not.toHaveBeenCalled();append(80.25,48);append(120,47,true)
  expect(mean.mock.calls.map(c=>c[1])).toEqual([{minX:40,minY:63,maxX:41,maxY:65},{minX:79,minY:63,maxX:81,maxY:65}])
  const geometry=uniform.mock.calls.filter(([loc])=>(loc as unknown as {name:string}).name==='u_geometry').map(c=>c.slice(1))
  expect(geometry).toEqual([[1,2,2,2],[2,2,2,4]])
  expect(transfer.mock.calls.every(c=>(c[3] as {width:number;height:number}).width===1&&(c[3] as {height:number}).height===1)).toBe(true)
  expect(mean.mock.invocationCallOrder[0]).toBeLessThan(transfer.mock.invocationCallOrder[0])
 }finally{engine.destroy()}
})

it('bounds large mean gathers to512px and releases both scratch textures when drawing fails',async()=>{
 const {engine}=createTestEngine({}, {width:64,height:64})
 type Buffer={width:number;height:number}
 const painter=engine['_smudge'] as unknown as {meanPreviousCanvas:(target:unknown,rect:unknown)=>Buffer;acquireScratch:(size:number)=>Buffer;releaseScratch:(buffer:Buffer)=>void}
 try {
  await paperReady(engine)
  const acquire=vi.spyOn(painter,'acquireScratch'),release=vi.spyOn(painter,'releaseScratch')
  const target={resolveForPaint:()=>[]}
  const result=painter.meanPreviousCanvas(target,{minX:-1024,minY:-512,maxX:1024,maxY:512})
  expect(acquire.mock.calls.map(c=>c[0])).toEqual([512,1]);expect(result.width).toBe(1)
  expect(release.mock.calls.map(c=>c[0].width)).toEqual([512]);painter.releaseScratch(result)
  acquire.mockClear();release.mockClear()
  const draw=vi.spyOn(engine['gl'],'drawArrays').mockImplementationOnce(()=>{throw Error('authored GPU failure')})
  expect(()=>painter.meanPreviousCanvas(target,{minX:0,minY:0,maxX:2,maxY:2})).toThrow('authored GPU failure')
  expect(acquire.mock.calls.map(c=>c[0])).toEqual([2,1])
  expect(release.mock.calls.map(c=>c[0].width).sort((a,b)=>a-b)).toEqual([1,2])
  draw.mockRestore()
 }finally{engine.destroy()}
})
