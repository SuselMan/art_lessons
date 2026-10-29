import { expect, it, vi } from 'vitest'
import { createBrushRandomStrokeId, isBrushLibrary, packDabs, strokeDabs, type BrushDescriptor, type Dab } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushExecutionContext } from './src/presets/brushExecutionContext'
import { beginBrushBehavior, behaviorStampsForDab } from './src/presets/brushBehavior'
import { codecDab } from './src/dabs/codecDab'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, pointerSample, simulateStroke } from './testing/engineTestUtils'
const seeds={version:1 as const,sequentialSeed:123456,strokeSeed:98765}
let ordinal=43000
function fixture(){
  const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:`imported-${(++ordinal).toString(16).padStart(24,'0')}`,version:143,
    tip:{kind:'round',aspect:1,hardness:1,angle:0,rotation:'fixed',profile:{kind:'gaussian',fade:1e-6,antialias:false}},
    paperInteraction:0,texture:undefined,wet:undefined,mixer:undefined,flow:1,flowPer:'stamp',flowSpan:undefined,pressureSmoothingPx:0,
    sizeByPressure:[[0,.485944],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],
    scatter:{count:1,radius:.09,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},
    behavior:{version:2,sequentialRandom:{version:1,kind:'qt5Taus88',policy:'scatterXY'},scatter:{placement:'xyUniform',bothAxes:true,countJitter:0},spacing:{mode:'diameter',coefficient:.2}}}
  const library={schemaVersion:1 as const,assets:[],skipped:[],brushes:[{name:'Authored sequential XY',source:'qa',warnings:[],descriptor}]}
  expect(isBrushLibrary(library)).toBe(true)
  installBrushLibrary(library)
  return {descriptor,preset:`brush:${descriptor.id}@143`}
}
const point=(x:number,extra:Partial<Dab>={})=>dab(x,30,{size:24,sourceSize:24,sourceScale:1,...extra})
const strokeId=createBrushRandomStrokeId('nonce43000',seeds)
function operation(preset:string,points:Dab[],end=false){
  return makeStroke('peer','ink',[],{tool:'digitalBrush',preset,strokeId,brushRandom:seeds,dabs:undefined,dabsPacked:packDabs(points),strokeEnd:end ? true : undefined})
}
// Tile loops interleave differently across batches. Preserve multiplicity but
// compare the multiset; logical per-request order is asserted by the RNG cursor.
const stampCentres=(engine:ReturnType<typeof createTestEngine>['engine'])=>brushDraws(engine).filter(d=>d.kind==='stamp').map(d=>d.uniforms.get('u_dabCenter') as [number,number]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])
it('rejects missing source channels across op/live/preview/history before queues or GL effects',()=>{
  const {preset}=fixture(),{engine}=createTestEngine()
  try{
    engine.appendOperation(makeLayerAdd('peer','ink'))
    const invalid=operation(preset,[point(20,{sourceScale:undefined})])
    const before=engine.getOperations(),draw=vi.spyOn(engine['gl'],'drawArrays'),upload=vi.spyOn(engine['gl'],'texImage2D')
    expect(()=>engine.appendOperation(invalid,'remote')).toThrow(/sourceSize and sourceScale/)
    expect(()=>engine.previewOperation(invalid)).toThrow(/sourceSize and sourceScale/)
    expect(()=>engine.absorbHistoricalOperations([invalid])).toThrow(/sourceSize and sourceScale/)
    expect(()=>engine.appendPeerLiveDabs('peer',{strokeId,layerId:'ink',tool:'digitalBrush',preset,color:[1,0,0],packetSeq:0,dabs:[point(20,{sourceSize:undefined})],brushRandom:seeds})).toThrow(/sourceSize and sourceScale/)
    expect(engine.getOperations()).toEqual(before)
    expect(engine['_peerLiveStrokes'].size).toBe(0)
    expect(draw).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()
  }finally{engine.destroy()}
})
it('matches whole/chunk/live placement without drawing from observer ambient seeds',()=>{
  const {preset}=fixture(),a=createTestEngine(),b=createTestEngine(),c=createTestEngine()
  const points=[point(20),point(30,{sourceScale:0,size:0}),point(40),point(50)]
  try{
    for(const {engine} of [a,b,c])engine.appendOperation(makeLayerAdd('peer','ink'))
    a.engine.appendOperation(operation(preset,points),'remote')
    b.engine.appendOperation(operation(preset,points.slice(0,2)),'remote')
    b.engine.appendOperation(operation(preset,points.slice(2)),'remote')
    c.engine['_strokeBrushRandom']={...seeds,sequentialSeed:9}
    c.engine.appendPeerLiveDabs('peer',{strokeId,layerId:'ink',tool:'digitalBrush',preset,color:[1,0,0],packetSeq:0,dabs:points.slice(0,2),brushRandom:seeds})
    c.engine.appendPeerLiveDabs('peer',{strokeId,layerId:'ink',tool:'digitalBrush',preset,color:[1,0,0],packetSeq:1,dabs:points.slice(2),brushRandom:seeds})
    expect(stampCentres(a.engine).length).toBeGreaterThan(0)
    expect(stampCentres(b.engine)).toEqual(stampCentres(a.engine))
    expect(stampCentres(c.engine)).toEqual(stampCentres(a.engine))
    for(const {engine} of [a,b,c]){
      const state=[...engine['_replayRibbonChunks'].values()][0].scratch.brushBehavior!
      expect(state.execution?.brushRandom).toEqual(seeds)
      expect(state.sequentialRandom?.draws).toBe(6)
    }
  }finally{a.engine.destroy();b.engine.destroy();c.engine.destroy()}
})
it('captures source inputs for local prediction, v3 history and replay, retaining continuous tiny coverage',async()=>{
  const {preset,descriptor}=fixture(),{engine}=createTestEngine({userId:'owner'})
  const peer=createTestEngine({userId:'observer'}).engine
  try{
    for(const e of [engine,peer]){await paperReady(e);e.appendOperation(makeLayerAdd('owner','ink'));e.setActiveLayer('ink')}
    engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(.5)
    simulateStroke(engine,[{x:20,y:30},{x:24,y:30},{x:28,y:30}],{pressure:1,timeStamp:0})
    const op=engine.getOperations().find(o=>o.type==='stroke')!
    if(op.type!=='stroke')throw Error('Missing stroke')
    expect(op.dabsPacked?.startsWith('3:')).toBe(true)
    const dabs=strokeDabs(op)
    expect(dabs.every(d=>d.sourceSize===1&&d.sourceScale===1&&d.size===.5)).toBe(true)
    const radii=brushDraws(engine).filter(d=>d.kind==='stamp').map(d=>d.uniforms.get('u_dabRadius'))
    expect(radii.length).toBeGreaterThan(0)
    expect(radii.every(r=>r===.25)).toBe(true)
    peer.appendOperation(op,'remote')
    // Tile traversal depends on batching; compare the logical replay below,
    // not ordering of repeated per-tile draw calls.
    const peerRadii=brushDraws(peer).filter(d=>d.kind==='stamp').map(d=>d.uniforms.get('u_dabRadius'))
    expect(peerRadii.length).toBeGreaterThan(0)
    expect(peerRadii.every(r=>r===.25)).toBe(true)
    engine.setSize(24-1e-7)
    engine['_onStart'](pointerSample(20,50,{pressure:0,timeStamp:20}))
    const prediction=engine['_dabs'].forkForPreview().continueStroke(40,50,0,0,0,24-1e-7)
    expect(prediction.every(d=>d.sourceSize===23&&d.sourceScale===Math.fround(.485944))).toBe(true)
    engine['_onEnd'](pointerSample(40,50,{pressure:0,timeStamp:40}))
    // The committed logical input produces the same native cursor in direct replay.
    const s=beginBrushBehavior(dabs[0],brushExecutionContext(op.brushRandom))
    for(const d of dabs)behaviorStampsForDab(descriptor,codecDab(d),s,[1,0,0])
    expect(s.sequentialRandom?.draws).toBe(2*dabs.length)
  }finally{engine.destroy();peer.destroy()}
})
