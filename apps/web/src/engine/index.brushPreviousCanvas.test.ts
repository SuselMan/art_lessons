import { expect, it, vi } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'

let ordinal = 1200
function fixture(overrides: Partial<BrushDescriptor> = {}) {
  const descriptor: BrushDescriptor = {
    ...digitalBrushFromPreset('hard-round'), id: `imported-${(++ordinal).toString(16).padStart(24,'0')}`, version: 111,
    model:'mixer', opacity:1, tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},
    sizeByPressure:[[0,1],[1,1]], opacityByPressure:[[0,1],[1,1]], behavior:{version:2},
    mixer:{load:0,initialLoad:0,pickup:.95,strength:1,smearAlpha:true,source:'previousCanvas'}, ...overrides,
  }
  installBrushLibrary({schemaVersion:1,brushes:[{name:'Own previous-canvas witness',source:'qa',warnings:[],descriptor}],assets:[],skipped:[]})
  return {descriptor,preset:`brush:${descriptor.id}@111`}
}
type Rect = {minX:number;minY:number;maxX:number;maxY:number}
function probes(engine: ReturnType<typeof createTestEngine>['engine']) {
  const painter=engine['_smudge'] as unknown as {gatherPatch:(...args:unknown[])=>void;drawTransferDab:(...args:unknown[])=>void}
  const gathers=vi.spyOn(painter,'gatherPatch'), transfers=vi.spyOn(painter,'drawTransferDab'), uniform=vi.spyOn(engine['gl'],'uniform1f')
  return {gathers,transfers,values:(name:string)=>uniform.mock.calls.filter(([loc])=>(loc as unknown as {name:string}).name===name).map(([,v])=>v)}
}
const center=(r:Rect)=>[(r.minX+r.maxX)/2,(r.minY+r.maxY)/2]
function append(engine:ReturnType<typeof createTestEngine>['engine'],preset:string,dabs:Dab[],user='peer',strokeId='gesture',end=false) {
  engine.appendOperation(makeStroke(user,'ink',dabs,{tool:'digitalBrush',preset,strokeId,...(end?{strokeEnd:true as const}:{})}),'remote')
}

it('first placed contact only primes position; subsequent snapshots use previous centre and current dimensions',async()=>{
  const {preset}=fixture(),{engine}=createTestEngine({}, {width:128,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
    const p=probes(engine)
    append(engine,preset,[dab(20,32,{size:20,pressure:1})])
    expect(p.gathers).not.toHaveBeenCalled();expect(p.transfers).not.toHaveBeenCalled()
    append(engine,preset,[dab(40,32,{size:40,pressure:1}),dab(60,32,{size:8,pressure:1})])
    const rectangles=p.gathers.mock.calls.map(call=>call[2] as Rect)
    expect(p.gathers.mock.calls[0][0]).not.toBe(p.gathers.mock.calls[1][0])
    expect(rectangles.map(center)).toEqual([[20,32],[40,32],[40,32],[60,32]])
    expect(rectangles[0].maxX-rectangles[0].minX).toBe(rectangles[1].maxX-rectangles[1].minX)
    expect(rectangles[2].maxX-rectangles[2].minX).toBe(rectangles[3].maxX-rectangles[3].minX)
    expect(rectangles[2].maxX-rectangles[2].minX).toBeLessThan(rectangles[0].maxX-rectangles[0].minX)
    const order=[...p.gathers.mock.invocationCallOrder.map(n=>[n,'gather'] as const),...p.transfers.mock.invocationCallOrder.map(n=>[n,'transfer'] as const)].sort((a,b)=>a[0]-b[0]).map(x=>x[1])
    expect(order).toEqual(['gather','gather','transfer','gather','gather','transfer'])
    expect(p.values('u_paintLoad')).toEqual([])
  } finally {engine.destroy()}
})

it.each([true,false])('uses independent COPY/OVER transfer mode smearAlpha=%s and no travel in amount',async smearAlpha=>{
  const base=fixture(),{preset}=fixture({opacity:.8,mixer:{...base.descriptor.mixer!,smearAlpha},opacityByPressure:[[0,0],[1,1]]}),{engine}=createTestEngine({}, {width:128,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const p=probes(engine)
    append(engine,preset,[20,22,70].map(x=>({...dab(x,32,{size:20,pressure:.5}),opacity:.6})))
    expect(p.values('u_strength').length).toBe(2)
    p.values('u_strength').forEach(value=>expect(value).toBeCloseTo(.95*.5*.6,3))
    expect(p.values('u_previousCanvas')).toEqual([smearAlpha?1:2,smearAlpha?1:2])
  } finally {engine.destroy()}
})

it('preserves chunk order and isolates previous positions across users and replacement gestures',async()=>{
  const {preset}=fixture(),{engine}=createTestEngine({}, {width:256,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const p=probes(engine)
    append(engine,preset,[dab(20,32)],'a','a1');append(engine,preset,[dab(100,32)],'b','b1')
    append(engine,preset,[dab(40,32)],'a','a1');append(engine,preset,[dab(120,32)],'b','b1')
    expect(p.gathers.mock.calls.map(call=>center(call[2] as Rect))).toEqual([[20,32],[40,32],[100,32],[120,32]])
    append(engine,preset,[dab(180,32)],'a','a2');expect(p.transfers).toHaveBeenCalledTimes(2)
    append(engine,preset,[dab(200,32)],'a','a2',true)
    expect(p.gathers.mock.calls.slice(-2).map(call=>center(call[2] as Rect))).toEqual([[180,32],[200,32]])
  } finally {engine.destroy()}
})

it('keeps absent-source mixers on their reservoir pickup path',async()=>{
  const base=fixture();delete base.descriptor.mixer!.source
  const {preset}=fixture({mixer:base.descriptor.mixer}),{engine}=createTestEngine({}, {width:64,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const p=probes(engine)
    append(engine,preset,[dab(20,32),dab(40,32)])
    expect(p.values('u_paintLoad').length).toBeGreaterThan(0)
    expect(p.values('u_previousCanvas').length).toBeGreaterThan(0)
    expect(p.values('u_previousCanvas').every(v=>v===0)).toBe(true)
  } finally {engine.destroy()}
})

it('threads placed scatter centres across chunks without re-priming each logical dab',async()=>{
  const {preset}=fixture({scatter:{count:3,radius:.4,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0}}),{engine}=createTestEngine({}, {width:128,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const p=probes(engine)
    append(engine,preset,[dab(30,32,{size:20})]);expect(p.transfers).toHaveBeenCalledTimes(2)
    append(engine,preset,[dab(60,32,{size:20})]);expect(p.transfers).toHaveBeenCalledTimes(5)
    const rects=p.gathers.mock.calls.map(call=>call[2] as Rect)
    for(let i=2;i<rects.length;i+=2)expect(center(rects[i])).toEqual(center(rects[i-1]))
  } finally {engine.destroy()}
})

it('evaluates pickup sensors before advancing the logical previous-dab state',async()=>{
  const base=fixture(),{preset}=fixture({mixer:{...base.descriptor.mixer!,pickupDynamics:[{control:'speed',minimum:0,jitter:0}]}}),{engine}=createTestEngine({}, {width:128,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const p=probes(engine)
    append(engine,preset,[20,40,60].map((x,i)=>({...dab(x,32,{size:20,pressure:1}),t:i*20})))
    expect(p.values('u_strength')).toHaveLength(2)
    p.values('u_strength').forEach(value=>expect(value).toBeCloseTo(.95*.5,5))
  } finally {engine.destroy()}
})

it('applies descriptor opacity already baked into recorded dab opacity exactly once',async()=>{
  const {preset}=fixture({opacity:.5}),{engine}=createTestEngine({}, {width:128,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const p=probes(engine)
    append(engine,preset,[20,40].map(x=>({...dab(x,32,{size:20,pressure:1}),opacity:.5})))
    expect(p.values('u_strength')).toHaveLength(1)
    expect(p.values('u_strength')[0]).toBeCloseTo(.95*.5,5)
  } finally {engine.destroy()}
})
