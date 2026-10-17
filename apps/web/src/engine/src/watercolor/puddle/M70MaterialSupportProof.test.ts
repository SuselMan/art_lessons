import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {watercolorSpreadBudget,watercolorFrontSteps,WC_FRONT_FLOOR,WC_FRONT_DRY_COST,WC_FRONT_DRY_SHARE} from '../../presets/watercolorPresets'
import {fastFrontSchedule} from '../../raster/WatercolorFrontPaths'
import {MaterialSupportGraph,materialDonors,certifiedMaterialRadius,type DryExteriorCertificate} from './M70MaterialSupportProof.test-support'
import {expect,it,vi} from 'vitest'
import {createTestEngine} from '../../../testing/engineTestUtils'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {ribbonProfileFor} from '../../dabs/ribbonProfile'
import {M70DependencyGraph,m70FieldReads} from './M70WindowPolicy'

for(const materialOnly of [false,true])for(const twoPaints of [false,true])it(`pins actual M70 ${materialOnly?'donor support':'backward dependency'} schedule (twoPaints=${twoPaints})`,()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:1024,height:1024})
 const pool=engine['_ribbonScratchPool'],passes=engine['_watercolorPasses'],owner=engine['_settlePlan']
 const tile=pool.acquire(1024,1024),scratch=new RibbonStrokeScratch(pool,true,true)
 engine.initLayer('window-proof');scratch.filmBuffers(tile);scratch.paints.add('1,0,0');if(twoPaints)scratch.paints.add('0,0,1')
 // Deliberately nonempty old gesture metadata: canonical M70 must omit contacts.
 scratch.brushTravel=[{x:512,y:512,radius:40,aspect:1,angle:0,dx:180,dy:0,water:1}]
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1',bounds={minX:0,minY:0,maxX:1024,maxY:1024}
 scratch.noteFinish({target:engine['_layers'].get('window-proof')!,preset:engine['_resolvePreset']('watercolor',preset),profile:ribbonProfileFor('watercolor',preset)!,color:[1,0,0],opacity:1,bounds,fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0})
 scratch.dryCtx={...scratch.finishContext!,radiusPx:40,standing:1}
 const linear=(buffer:AccumulationBuffer)=>buffer['_baseFilter']==='linear'
 const graph=materialOnly?new MaterialSupportGraph<AccumulationBuffer>(linear):new M70DependencyGraph<AccumulationBuffer>(linear)
 const frontCalls:Array<{max:number;dry:number;floor:number;stride:number;scale:number;foreign:boolean;discrete:boolean}>=[]
 const traces:Array<{kind:string;radius:number}>=[],spies:Array<{mockRestore():void}>=[]
 const originalField=passes.fieldOp.bind(passes)
 spies.push(vi.spyOn(passes,'fieldOp').mockImplementation((out,a,b,mode,k,opts={})=>{
  const donors=materialOnly?materialDonors(mode,a,b,opts):m70FieldReads(mode,a,b,opts)
  traces.push({kind:`field:${mode}`,radius:donors===null&&graph instanceof MaterialSupportGraph?graph.auxiliary(out):graph.write(out,donors!)})
  originalField(out,a,b,mode,k,opts)
 }))
 const originalFront=passes.waterFrontStep.bind(passes)
 spies.push(vi.spyOn(passes,'waterFrontStep').mockImplementation((...args)=>{
  frontCalls.push({max:args[6],dry:args[3],floor:args[8],stride:args[9]??1,scale:args[10]??1,foreign:!!args[11],discrete:!!args[12]})
  const [field,,,,src,dst,,, ,stride=1]=args
  traces.push({kind:'front',radius:graph instanceof MaterialSupportGraph?graph.auxiliary(dst):graph.write(dst,[{source:src,radius:stride},{source:field.coverage,radius:stride}])})
  originalFront(...args)
 }))
 const originalDiffuse=passes.diffuseStep.bind(passes)
 spies.push(vi.spyOn(passes,'diffuseStep').mockImplementation((...args)=>{
  const radius=args[8]*(args[9]?2:1)
  traces.push({kind:'diffuse',radius:graph.write(args[7],materialOnly?[{source:args[6],radius}]:[{source:args[6],radius},{source:args[10],radius}])})
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
  expect(proof).toBe(materialOnly?450:612)
  expect(graph.maxRadius).toBe(materialOnly?450:612)
  expect(frontCalls).toHaveLength(45)
  const outward=frontCalls.filter(c=>c.max===100)
  expect(outward).toHaveLength(25)
  expect(outward.filter(c=>c.stride===8)).toHaveLength(17)
  expect(outward.filter(c=>c.stride===1)).toHaveLength(8)
  expect(outward.every(c=>c.dry===48&&c.floor===.85&&c.scale===1&&c.foreign===false&&c.discrete===true)).toBe(true)
 }finally{job?.dispose();brush.mockRestore();resample.mockRestore();for(const spy of spies.reverse())spy.mockRestore();scratch.destroy();pool.release(tile);engine.destroy()}
})

it('bounds approved actual outward schedule using an explicit pessimistic numeric-error contract',()=>{
 const budget=watercolorSpreadBudget(40,1,1),costMax=budget+4,dry=Math.max(WC_FRONT_DRY_COST,budget*WC_FRONT_DRY_SHARE),schedule=fastFrontSchedule(watercolorFrontSteps(budget,40,1))
 expect({budget,costMax,dry,draws:schedule.length}).toEqual({budget:96,costMax:100,dry:48,draws:25})
 // Contract to verify on supported renderer: packed unit costs underestimate
 // by <=1 costunit/unit, each outward sample+write+arithmetic loses <=4 RGBA8 codes,
 // unreached1 is a fixedpoint, samples obey certified point/linear supports.
 const unitLowerBound=WC_FRONT_FLOOR*dry-1
 const accumulatedWriteLoss=schedule.length*4*costMax/255
 const reach=Math.ceil((budget+1+accumulatedWriteLoss)/unitLowerBound)
 const conservativeSamplingSlack=8
 expect(unitLowerBound).toBeCloseTo(39.8);expect(reach).toBe(4)
 expect(reach+conservativeSamplingSlack).toBeLessThan(32)
})
it('adversarial fixedpoint min-plus rounddown simulation cannot manufacture distant wet coverage',()=>{
 const budget=96,max=100,dryUnit=39.8,schedule=fastFrontSchedule(watercolorFrontSteps(budget,40,1)),size=513,zero=256
 let pressure:number[]=Array.from({length:size},(_,i)=>i<=zero?0:max)
 for(const stride of schedule){
  const old=pressure;pressure=old.map((self,i)=>{
   let best=self
   for(const dir of [-1,1]){
    const donor=i+dir*stride;if(donor<0||donor>=size||old[donor]>=max)continue
    // Infinite material halfplane x<=0 is MORE permissive than any finite
    // bboxS. Every unit interval outsideS charges the hard dry lowerbound.
    const outside=Math.max(0,Math.max(i,donor)-Math.max(zero,Math.min(i,donor)))
    best=Math.min(best,old[donor]+outside*dryUnit)
   }
   // Exact unreached1 fixedpoint is essential; never decrement the sentinel.
   return best>=max?max:Math.max(0,best-4*max/255)
  })
 }
 const reached=pressure.map((p,i)=>p<budget+1?i-zero:0)
 expect(Math.max(...reached)).toBeLessThanOrEqual(4)
 expect(pressure.slice(zero+32).every(p=>p===max)).toBe(true)
})
it('without exact unreached fixedpoint the tight proof is invalid, not a silent fallback assumption',()=>{
 let empty=100
 for(let n=0;n<25;n++)empty-=4*100/255
 expect(empty).toBeLessThan(97) // would falsely extend coverage everywhere
})

const proof:DryExteriorCertificate={scale:1,radius:40,water:1,standing:1,budget:96,costMax:100,outwardDraws:25,dryCost:48,floor:.85,pointGrid:true,foreignStencilAbsent:true,unchangedScheduleAndShaders:true,unreachedCostFixedPoint:true,maxWriteErrorCodes:4,maxPackedUnderestimatePerUnit:1}
it('requires every certificate field; unknown or foreign remains612',()=>{
 expect(certifiedMaterialRadius(proof)).toBe(32)
 expect(certifiedMaterialRadius(undefined)).toBe(612)
 for(const key of Object.keys(proof)){
  const modified={...proof};delete (modified as any)[key]
  expect(certifiedMaterialRadius(modified as any)).toBe(612)
 }
 for(const change of [{scale:2},{radius:41},{foreignStencilAbsent:false},{outwardDraws:26},{unreachedCostFixedPoint:false},{maxWriteErrorCodes:2}])expect(certifiedMaterialRadius({...proof,...change} as any)).toBe(612)
})

it('invalidates R32 proof when any reviewed execution or shader source changes',()=>{
 const hashes={
  "raster/shaders.ts": "900ae36d8afd512d5a68a0035ec1c84b9915ef53191fbd5e19918f2bb544deb7",
  "raster/WatercolorSettlePlan.ts": "67c5e48da59acca27fe078c27632105768a9191f380d1fb195c409eb1ab8c7da",
  "raster/WatercolorFrontPaths.ts": "5715f547d834465abc5153e6516b18f3c6cfeb98346adb5fe87ed9f9fa92cf22",
  "raster/WatercolorPasses.ts": "eb23f10e70ca8086e8f7da235a0abb90e3f3f06ab8397a47c745d377b94f4e10",
  "raster/discreteGridSampling.ts": "c9b580bbe2d361c713d578354f516868336ffb70649b4baa838d2978977fc429",
  "presets/watercolorPresets.ts": "4df2fc0600c2d2bd7e709b0e9f99d5c0499debf9096fd276b042d8e503082f7a",
  "watercolor/wetDiffusion.ts": "8873ebb15fa8f7ede8b03f8c8c0cefb63e9dd4b13eb42612273795d3b96075b6",
  "watercolor/puddle/PuddleTarget.ts": "8f4a61f4786476afb1e2c5965df81b07422cd5fd1b052a26e6f51c18dde88538"
}
 for(const [file,expected]of Object.entries(hashes)){
  const actual=createHash('sha256').update(readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')
  expect(actual,'R32 certificate requires review: '+file).toBe(expected)
 }
})
