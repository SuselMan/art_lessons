import{it,expect,vi}from'vitest'
import{createBrushSourceNonce,createBrushRandomStrokeId,type BrushDescriptor,type BrushSourceContext}from'@grafetto/shared'
import{installBrushLibrary}from'./brushLibrary'
import{createTestEngine,paperReady,makeLayerAdd,makeStroke,dab}from'./testing/engineTestUtils'
import type{CanvasProjectionSampler,ProjectionSampleLayer}from'./src/raster/CanvasProjectionSampler'
import type{AccumulationBuffer}from'./src/buffers/AccumulationBuffer'

const preset=(gradient=false)=>{
 const descriptor:BrushDescriptor={id:'imported-812812812812812812812812',version:gradient?39:38,model:'mixer',category:'paint',tip:{kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.2,flow:1,flowPer:'pass',opacity:1,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],pressureSmoothingPx:0,mixer:{source:'projectionCanvas',load:0,initialLoad:0,pickup:1,strength:1,smearAlpha:true}}
 if(gradient)descriptor.mixer!.foreground={gradient:{rate:1,value:1}}
 installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{descriptor,name:'Authored projection',source:'qa',warnings:[]}]})
 return 'brush:'+descriptor.id+'@'+descriptor.version
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

it('shares an unchanged source prefix across nested projection read scopes',async()=>{
 const {engine}=createTestEngine({userId:'A'},{width:32,height:32});await paperReady(engine)
 const store={cache:new Map<string,{buffer:import('./src/buffers/ILayerBuffer').ILayerBuffer;bytes:number}>(),bytes:0}
 try{
  engine.appendOperation(makeLayerAdd('A','L'),'remote')
  const paint=makeStroke('A','L',[dab(12,12,{size:14,opacity:.6})]);engine.appendOperation(paint,'remote')
  const target=engine['_layers'].get('L')!
  const scope={beforeSeq:100,target,layerId:'outer',store}
  const first=engine['_historicalProjectionLayer'](scope,'L')
  const nested=engine['_historicalProjectionLayer']({...scope,beforeSeq:99,layerId:'nested'},'L')
  expect(nested).toBe(first)
  expect(store.cache.size).toBe(1)
  expect(store.bytes).toBeGreaterThan(0)
  engine['_releaseProjectionScope'](scope)
  expect(store.cache.size).toBe(0);expect(store.bytes).toBe(0)
 }finally{for(const entry of store.cache.values())entry.buffer.destroy();engine.destroy()}
})


it('captures the selected palette and projection before queued author work',async()=>{
 const {engine}=createTestEngine({userId:'A'},{width:32,height:32});await paperReady(engine)
 try{
  const {makeBrushGradient}=await import('@grafetto/shared'),token=preset(true)
  engine.appendOperation(makeLayerAdd('A','L'),'remote');engine.setActiveLayer('L');engine.setCompositeOrder([{id:'L',opacity:.5}]);engine.setTool('digitalBrush');engine.setPencil(token)
  const first=makeBrushGradient([1,0,0,0],[0,0,1,1]),second=makeBrushGradient([0,1,0,1],[1,1,1,1])
  engine.setBrushGradient(first)
  const snapshot=engine['_captureAuthorStart']({x:12,y:12,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp:0},0)
  engine.setBrushGradient(second);engine.setCompositeOrder([{id:'L',opacity:1}])
  expect(snapshot?.brushSource?.gradient).toBe(first)
  expect(snapshot?.brushSource?.projection).toEqual([{id:'L',opacity:.5}])
  expect(Object.isFrozen(snapshot?.brushSource)).toBe(true)
 }finally{engine.destroy()}
})
