import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {createTestEngine} from '../../../testing/engineTestUtils'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {ribbonProfileFor} from '../../dabs/ribbonProfile'
import {M70DependencyGraph,m70FieldReads,m70WindowGeometry,m70Windows} from './M70WindowPolicy'
import {WC_FIELD_OP_FRAG,WC_FIELD_OP_M70_FRAG,WC_DIFFUSE_FRAG,WC_WATER_FRONT_FRAG} from '../../raster/shaders'

for(const twoPaints of [false,true])it(`bounds the actual radius40 M70 operator graph including linear supports (twoPaints=${twoPaints})`,()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:1024,height:1024})
 const pool=engine['_ribbonScratchPool'],passes=engine['_watercolorPasses'],owner=engine['_settlePlan']
 const tile=pool.acquire(1024,1024),scratch=new RibbonStrokeScratch(pool,true,true)
 engine.initLayer('window-proof');scratch.filmBuffers(tile);scratch.paints.add('1,0,0');if(twoPaints)scratch.paints.add('0,0,1')
 // Deliberately nonempty old gesture metadata: canonical M70 must omit contacts.
 scratch.brushTravel=[{x:512,y:512,radius:40,aspect:1,angle:0,dx:180,dy:0,water:1}]
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1',bounds={minX:0,minY:0,maxX:1024,maxY:1024}
 scratch.noteFinish({target:engine['_layers'].get('window-proof')!,preset:engine['_resolvePreset']('watercolor',preset),profile:ribbonProfileFor('watercolor',preset)!,color:[1,0,0],opacity:1,bounds,fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0})
 scratch.dryCtx={...scratch.finishContext!,radiusPx:40,standing:1}
 const graph=new M70DependencyGraph<AccumulationBuffer>(buffer=>buffer['_baseFilter']==='linear')
 const traces:Array<{kind:string;radius:number}>=[],spies:Array<{mockRestore():void}>=[]
 const originalField=passes.fieldOp.bind(passes)
 spies.push(vi.spyOn(passes,'fieldOp').mockImplementation((out,a,b,mode,k,opts={})=>{
  traces.push({kind:`field:${mode}`,radius:graph.write(out,m70FieldReads(mode,a,b,opts))})
  originalField(out,a,b,mode,k,opts)
 }))
 const originalFront=passes.waterFrontStep.bind(passes)
 spies.push(vi.spyOn(passes,'waterFrontStep').mockImplementation((...args)=>{
  const [field,,,,src,dst,,, ,stride=1]=args
  traces.push({kind:'front',radius:graph.write(dst,[{source:src,radius:stride},{source:field.coverage,radius:stride}])})
  originalFront(...args)
 }))
 const originalDiffuse=passes.diffuseStep.bind(passes)
 spies.push(vi.spyOn(passes,'diffuseStep').mockImplementation((...args)=>{
  const radius=args[8]*(args[9]?2:1)
  traces.push({kind:'diffuse',radius:graph.write(args[7],[{source:args[6],radius},{source:args[10],radius}])})
  originalDiffuse(...args)
 }))
 const originalCopy=AccumulationBuffer.prototype.copyRegionInto
 spies.push(vi.spyOn(AccumulationBuffer.prototype,'copyRegionInto').mockImplementation(function(this:AccumulationBuffer,...args){
  graph.write(args[0],[{source:this,radius:0}],true);return originalCopy.apply(this,args)
 }))
 const originalWholeCopy=AccumulationBuffer.prototype.copyTo
 spies.push(vi.spyOn(AccumulationBuffer.prototype,'copyTo').mockImplementation(function(this:AccumulationBuffer,...args){
  graph.write(args[0],[{source:this,radius:0}]);return originalWholeCopy.apply(this,args)
 }))
 const originalClear=AccumulationBuffer.prototype.clear
 spies.push(vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer,...args){graph.clear(this);return originalClear.apply(this,args)}))
 const brush=vi.spyOn(passes,'brushPass'),resample=vi.spyOn(passes,'wcResample')
 let job:ReturnType<typeof owner.prepare>=null
 try{
  job=owner.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],bounds,0,40,1,0,1,1)!
  for(let i=0;i<job.ops.length;i++)job.ops[i]()
  // Inspect solver output BEFORE land overwrites/shared-field bookkeeping.
  const lastTides=traces.filter(t=>t.kind==='field:14').slice(-2)
  expect(lastTides).toHaveLength(2)
  expect(brush).not.toHaveBeenCalled();expect(resample).not.toHaveBeenCalled()
  const proof=Math.max(...lastTides.map(t=>t.radius))
  expect(proof).toBeGreaterThan(500)
  // Every traced intermediate, not merely the last material tide pair.
  expect(graph.maxRadius).toBeLessThanOrEqual(640)
  expect(m70WindowGeometry(proof).field).toBe(1536)
  expect({proof,front:traces.filter(t=>t.kind==='front').length,diffusion:traces.filter(t=>t.kind==='diffuse').length}).toMatchInlineSnapshot(`
    {
      "diffusion": 26,
      "front": 45,
      "proof": 612,
    }
  `)
 }finally{job?.dispose();brush.mockRestore();resample.mockRestore();for(const spy of spies.reverse())spy.mockRestore();scratch.destroy();pool.release(tile);engine.destroy()}
})
it('rejects an enlarged or nonfinite dependency cone and unknown operators',()=>{
 expect(()=>m70WindowGeometry(641)).toThrow();expect(()=>m70WindowGeometry(Infinity)).toThrow()
 expect(()=>m70FieldReads(21,'a','b')).toThrow()
 const graph=new M70DependencyGraph<string>(()=>false)
 expect(()=>graph.write('b',[{source:'a',radius:NaN}])).toThrow()
})
it('tracks aliases as pre-write versions and includes bilinear support',()=>{
 const graph=new M70DependencyGraph<string>(key=>key==='linear')
 graph.write('linear',[{source:'raw',radius:10}])
 expect(graph.write('linear',[{source:'linear',radius:8}])).toBe(19)
 graph.clear('linear');expect(graph.radius('linear')).toBe(0)
})
// Explicit mode6 bilinear uses four nearest taps within the existing 10+1 bound.
// The graph keeps conservative linear supports for the other data-field reads.
it('pins shader source sampling contracts until this proof is reviewed',()=>{
 expect([WC_FIELD_OP_FRAG,WC_FIELD_OP_M70_FRAG,WC_DIFFUSE_FRAG,WC_WATER_FRONT_FRAG].map(source=>createHash('sha256').update(source).digest('hex'))).toMatchInlineSnapshot(`
   [
     "ae45ac70c5af4da78450da2d380312fb7ecde0ec954a579056b79734cf7e22c6",
     "b53ec815e0e503925fa25ec9ac2f7105d6d79dd102a36dfa9f68953ae68c2461",
     "5b8a7c5985ab52ddd49ed256813703a66e625c9d6a826f11e76be3dd28affca7",
     "79df8169a12b5105da3ff9fb4c203bacd1fcffd5e1ee15917088e0687834b7d6",
   ]
 `)
})

for(const [width,height] of [[1240,1754],[1754,2480],[2480,3508],[1024,3508],[1537,1537]])it(`covers finite ${width}x${height} without artificial window boundaries`,()=>{
 const domain={width:Math.max(1024,Math.ceil(width/256)*256),height:Math.max(1024,Math.ceil(height/256)*256)}
 const windows=m70Windows({width,height},domain,612)
 expect(windows.reduce((n,w)=>n+w.core.width*w.core.height,0)).toBe(width*height)
 for(const {core,field} of windows){
  expect(field.width).toBeLessThanOrEqual(1536);expect(field.height).toBeLessThanOrEqual(1536)
  expect(field.width%256).toBe(0);expect(field.height%256).toBe(0)
  for(const [position,size,limit] of [['x','width',domain.width],['y','height',domain.height]] as const){
   expect(Number.isInteger(field[position])).toBe(true)
   expect(field[position]).toBeGreaterThanOrEqual(0);expect(field[position]+field[size]).toBeLessThanOrEqual(limit)
   // An insufficient halo is allowed ONLY at the same global boundary.
   expect(field[position]===0||core[position]-field[position]>=640).toBe(true)
   expect(field[position]+field[size]===limit||field[position]+field[size]-(core[position]+core[size])>=640).toBe(true)
  }
 }
})
it('refuses unrounded or undersized global domains rather than silently changing boundaries',()=>{
 expect(()=>m70Windows({width:1240,height:1754},{width:1240,height:1754},612)).toThrow()
 expect(()=>m70Windows({width:1240,height:1754},{width:1024,height:1792},612)).toThrow()
})
