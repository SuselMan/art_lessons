import { afterEach, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, readLayerPixels, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd, simulateStroke } from './testing/engineTestUtils'

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

for(const geometry of [
  {pageWidth:1536,pageHeight:1536,infinite:false},
  {pageWidth:64,pageHeight:64,infinite:true},
])it(`rejects M70 DOWN atomically on ${JSON.stringify(geometry)}`, async()=>{
  const {engine}=createTestEngine({userId:'artist',watercolorModel:'m70-r2-v1',...geometry},{width:64,height:64})
  await paperReady(engine)
  vi.useFakeTimers()
  engine.appendOperation(makeLayerAdd('artist','paint'),'remote')
  engine.setActiveLayer('paint');engine.setTool('watercolor')
  const internal=engine as unknown as {_strokeId:string|null;_strokeLayerId:string|null;_puddleFor():unknown}
  const allocate=vi.spyOn(internal,'_puddleFor')
  const before=readLayerPixels(engine,'paint')
  const operations=engine.getOperations().map(op=>op.id)
  expect(()=>simulateStrokeStart(engine,10,12)).toThrow('one bounded page tile up to 1024px per side')
  expect(internal._strokeLayerId).toBeNull();expect(internal._strokeId).toBeNull()
  for(let i=0;i<20;i++)simulateStrokeMove(engine,10+i,12)
  simulateStrokeEnd(engine,35,12)
  expect(engine.getOperations().map(op=>op.id)).toEqual(operations)
  expect(readLayerPixels(engine,'paint')).toEqual(before)
  expect(allocate).not.toHaveBeenCalled()
  engine.setTool('pencil')
  simulateStroke(engine,[{x:10,y:12},{x:25,y:12}])
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(1)
})

it('checks source capacity after finishing accepted Dry and before gesture state',async()=>{
  const {engine}=createTestEngine({userId:'artist',watercolorModel:'m70-r2-v1',pageWidth:64,pageHeight:64},{width:64,height:64})
  await paperReady(engine);vi.useFakeTimers()
  engine.appendOperation(makeLayerAdd('artist','paint'),'remote')
  engine.setActiveLayer('paint');engine.setTool('watercolor')
  const internal=engine as unknown as {_strokeId:string|null;_strokeLayerId:string|null;_puddle:unknown}
  let closing=true
  const assertSourceAvailable=vi.fn(()=>{
    expect(closing).toBe(false)
    expect(internal._strokeId).toBeNull();expect(internal._strokeLayerId).toBeNull()
    throw Error('two wet layers')
  })
  internal._puddle={finishDrying:()=>{closing=false},assertSourceAvailable,has:()=>false,presentAll:vi.fn(),owns:()=>false}
  try{
    expect(()=>simulateStrokeStart(engine,10,12)).toThrow('two wet layers')
    simulateStrokeMove(engine,25,12);simulateStrokeEnd(engine,35,12)
    expect(assertSourceAvailable).toHaveBeenCalledTimes(1)
    expect(internal._strokeId).toBeNull();expect(internal._strokeLayerId).toBeNull()
    expect(engine.getOperations().filter(op=>op.type==='stroke')).toEqual([])
  }finally{internal._puddle=null}
})

for(const [pageWidth,pageHeight]of [[512,768],[768,512]])it(`accepts one rectangular ${pageWidth}x${pageHeight} material tile`,async()=>{
 const {engine}=createTestEngine({userId:'artist',watercolorModel:'m70-r2-v1',pageWidth,pageHeight},{width:64,height:64})
 await paperReady(engine);vi.useFakeTimers()
 Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
 try{engine.appendOperation(makeLayerAdd('artist','paint'),'remote');engine.setActiveLayer('paint');engine.setTool('watercolor')
  expect(()=>simulateStroke(engine,[{x:10,y:12},{x:25,y:12}])).not.toThrow()
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(1)
  const internal=engine as unknown as {_puddle:{dimensions:{width:number;height:number}}}
  expect(internal._puddle.dimensions).toEqual({width:pageWidth,height:pageHeight})

 }finally{engine.destroy()}
})

for(const[pageWidth,pageHeight]of [[512,768],[768,512]])it(`keeps rectangular Dry undo/redo in layer history ${pageWidth}x${pageHeight}`,async()=>{
 const {engine}=createTestEngine({userId:'artist',watercolorModel:'m70-r2-v1',pageWidth,pageHeight},{width:64,height:64})
 await paperReady(engine);vi.useFakeTimers()
 try{engine.appendOperation(makeLayerAdd('artist','paint'),'remote')
  const dry={id:'rect-dry',type:'paper_dry' as const,userId:'artist',layerId:'paint',timestamp:Date.now()}
  engine.appendOperation(dry,'remote')
  expect(engine.undo()?.id).toBe(dry.id)
  expect(engine.redo()?.id).toBe(dry.id)
 }finally{engine.destroy()}
})

it('requires exact single-tile page geometry and rejects invalid axes',async()=>{
 const {engine}=createTestEngine({userId:'artist',watercolorModel:'m70-r2-v1',pageWidth:64,pageHeight:64},{width:64,height:64})
 await paperReady(engine);vi.useFakeTimers()
 try{
  const internal=engine as unknown as {_tileSize():{w:number;h:number}}
  const page=vi.spyOn(engine['_paper'],'pageSize'),tile=vi.spyOn(internal,'_tileSize')
  for(const[w,h,tw,th]of [[512,768,512,512],[1024,1025,1024,1024],[0,512,0,512],[1.5,512,1.5,512],[NaN,512,64,512],[512,Infinity,512,64]]){
   page.mockReturnValue({w,h});tile.mockReturnValue({w:tw,h:th})
   expect(engine['_m70GeometrySupported']()).toBe(false)
  }
 }finally{engine.destroy()}
})
