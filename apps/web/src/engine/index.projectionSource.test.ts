import{it,expect,vi}from'vitest'
import{createBrushSourceNonce,createBrushRandomStrokeId,type BrushDescriptor,type BrushSourceContext}from'@grafetto/shared'
import{installBrushLibrary}from'./brushLibrary'
import{createTestEngine,paperReady,makeLayerAdd,makeStroke,dab}from'./testing/engineTestUtils'
import type{CanvasProjectionSampler,ProjectionSampleLayer}from'./src/raster/CanvasProjectionSampler'
import type{AccumulationBuffer}from'./src/buffers/AccumulationBuffer'

const preset=()=>{
 const descriptor:BrushDescriptor={id:'imported-812812812812812812812812',version:38,model:'mixer',category:'paint',tip:{kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.2,flow:1,flowPer:'pass',opacity:1,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],pressureSmoothingPx:0,mixer:{source:'projectionCanvas',load:0,initialLoad:0,pickup:1,strength:1,smearAlpha:true}}
 installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{descriptor,name:'Authored projection',source:'qa',warnings:[]}]})
 return 'brush:'+descriptor.id+'@38'
}
const source:BrushSourceContext={version:1,projection:[{id:'L',opacity:.5},{id:'R',opacity:1}]}
const seeds={version:1 as const,sequentialSeed:1,strokeSeed:2}
function sourceSum(layers:readonly ProjectionSampleLayer[]):number{
 let sum=0
 for(const tile of layers[0].buffer.resolveVisible({minX:0,minY:0,maxX:32,maxY:32}))for(const n of tile.buffer.readPixels())sum+=n
 return sum
}

it('rebuilds external read pixels at the operation prefix rather than the current source layer',async()=>{
 const {engine}=createTestEngine({userId:'A'},{width:32,height:32});await paperReady(engine)
 try{
  const token=preset();engine.appendOperation(makeLayerAdd('A','L'),'remote');engine.appendOperation(makeLayerAdd('C','R'),'remote')
  const paint=makeStroke('A','L',[dab(12,12,{size:14,opacity:.6})]);engine.appendOperation(paint,'remote')
  const reader=engine['_smudge'] as unknown as {projectionSampler:CanvasProjectionSampler},observed:number[]=[]
  // MockGL does not execute this new shader. Inspect the real historical
  // source buffers it receives; real-device tests cover projection pixels.
  vi.spyOn(reader.projectionSampler,'gather').mockImplementation((patch:AccumulationBuffer,_rect,layers)=>{observed.push(sourceSum(layers));patch.clear()})
  const strokeId=createBrushRandomStrokeId(createBrushSourceNonce('read_nonce_000',source),seeds)
  engine.appendOperation(makeStroke('C','R',[dab(8,12,{size:10}),dab(16,12,{size:10})],{tool:'digitalBrush',preset:token,strokeId,brushRandom:seeds,brushSource:source,strokeEnd:true}),'remote')
  const first=observed[0];expect(first).toBeGreaterThan(0)
  engine.appendOperation(makeStroke('B','L',[dab(12,12,{size:22,opacity:1})]),'remote')
  const before=observed.length
  engine['_rebuildLayer']('R')
  expect(observed.length).toBeGreaterThan(before)
  expect(observed.slice(before).every(n=>n===first)).toBe(true)
  // A checkpoint with the same R operation ids must not hide a changed
  // external read when A undoes the earlier source paint.
  engine['_takeCheckpoint']('R')
  const beforeUndo=observed.length;engine.undo()
  expect(observed.length).toBeGreaterThan(beforeUndo)
  expect(observed.slice(beforeUndo).every(n=>n===0)).toBe(true)
 }finally{engine.destroy()}
})
