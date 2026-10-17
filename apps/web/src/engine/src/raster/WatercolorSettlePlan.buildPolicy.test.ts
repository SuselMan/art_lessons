import {expect,it,vi} from 'vitest'
import {createTestEngine} from '../../testing/engineTestUtils'
import {RibbonStrokeScratch} from '../buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from '../dabs/ribbonProfile'

function execute(dev:boolean,model:'m70-r2-v1'|'front8-detail-flow-v4',travel:boolean,twoPaints:boolean,diagnostics:boolean){
 vi.stubEnv('DEV',dev)
 const {engine}=createTestEngine({paper:'flat'},{width:1024,height:1024})
 const pool=engine['_ribbonScratchPool'],passes=engine['_watercolorPasses'],owner=engine['_settlePlan']
 const tile=pool.acquire(1024,1024),scratch=new RibbonStrokeScratch(pool,true,true)
 engine.initLayer('policy')
 scratch.filmBuffers(tile);scratch.paints.add('1,0,0');if(twoPaints)scratch.paints.add('0,0,1')
 if(travel)scratch.brushTravel=[{x:512,y:512,radius:128,aspect:1,angle:0,dx:180,dy:0,water:1}]
 const preset=`normal:100:69:PB15:round:wc@${model}`,bounds={minX:100,minY:200,maxX:900,maxY:800}
 scratch.noteFinish({target:engine['_layers'].get('policy')!,preset:engine['_resolvePreset']('watercolor',preset),profile:ribbonProfileFor('watercolor',preset)!,color:[1,0,0],opacity:1,bounds,fieldSeed:[0,0],landedWet:1,wetPeak:1,radiusPx:128,dwellMs:0})
 owner.diagnosticSkipBrushContacts=diagnostics;owner.diagnosticAlwaysPairedColour=diagnostics;owner.diagnosticPreserveBrushField=diagnostics
 const trace:unknown[]=[],ids=new Map<object,number>()
 function value(x:unknown):unknown{
  if(x===null||typeof x!=='object')return x
  if(Array.isArray(x))return x.map(value)
  if('texture'in x&&'width'in x&&'height'in x){if(!ids.has(x))ids.set(x,ids.size);return {buffer:ids.get(x),width:x.width,height:x.height}}
  return Object.fromEntries(Object.entries(x).filter(([,v])=>typeof v!=='function').map(([k,v])=>[k,value(v)]))
 }
 const spies:Array<{mockRestore():void}>=[]
 for(const name of ['fieldOp','diffuseStep','brushPass','wcResample','pigmentColor','waterFrontStep'] as const){
  const original=passes[name].bind(passes)
  spies.push(vi.spyOn(passes,name).mockImplementation(((...args:never[])=>{trace.push([name,value(args)]);return (original as (...args:never[])=>unknown)(...args)}) as never))
 }
 const reconstruction=passes.materialReconstruction(),original=reconstruction.pigment.bind(reconstruction)
 const detail=vi.spyOn(reconstruction,'pigment').mockImplementation(request=>{trace.push(['reconstruct',value(request)]);return original(request)})
 let job:ReturnType<typeof owner.prepare>=null
 try{
  job=owner.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],bounds,0,128,1,1,1,1)!
  const count=job.ops.length
  for(let i=0;i<job.ops.length;i++)job.ops[i]()
  job.finish()
  return {trace,count,paired:!trace.some(row=>(row as unknown[])[0]==='pigmentColor'),contacts:trace.some(row=>(row as unknown[])[0]==='brushPass'),preserve:detail.mock.calls.some(([request])=>request.preserveBrush)}
 }finally{job?.dispose();detail.mockRestore();for(const spy of spies)spy.mockRestore();scratch.destroy();pool.release(tile);engine.destroy();vi.unstubAllEnvs()}
}
for(const travel of [false,true])for(const twoPaints of [false,true])it(`M70 actual prepare has identical approved build policy (travel=${travel},twoPaints=${twoPaints})`,()=>{
 const qa=execute(true,'m70-r2-v1',travel,twoPaints,true)
 expect(execute(false,'m70-r2-v1',travel,twoPaints,true)).toEqual(qa)
 expect(execute(false,'m70-r2-v1',travel,twoPaints,false)).toEqual(qa)
 expect(qa.paired).toBe(true);expect(qa.contacts).toBe(false);expect(qa.preserve).toBe(true)
})
it('legacy single-point prepare retains its build-scoped diagnostic opt-ins',()=>{
 const qa=execute(true,'front8-detail-flow-v4',false,false,true)
 const production=execute(false,'front8-detail-flow-v4',false,false,true)
 expect(qa.paired).toBe(true);expect(qa.preserve).toBe(true)
 expect(production.paired).toBe(false);expect(production.preserve).toBe(false)
})
it('legacy recorded brush contacts remain enabled in production',()=>{
 expect(execute(false,'front8-detail-flow-v4',true,true,true).contacts).toBe(true)
})
