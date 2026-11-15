import fs from'node:fs'
import path from'node:path'
import{beforeAll,describe,it,expect}from'vitest'
import{hasStationary195Scope,resolveStationary195Role,type BrushLibrary,type Dab}from'@grafetto/shared'
import{installBrushLibrary,installBrushPixels}from'../../brushLibrary'
import{brushPreparationPlan}from'../dabs/BrushPreparation'
import{DabSystem}from'../dabs/DabSystem'
import{shapingForDigitalBrush}from'./digitalBrushPresets'
import{mask190RootExecution,mask190ChildExecution}from'./independentMask190'
import{beginBrushBehavior,behaviorStampsForDab,secondaryBrushDabs,type SecondarySamplingState}from'./brushBehavior'
import{usesNativeFilterMask,usesNativeSmudgeFeatures}from'./nativeBrushFeatures'
import{tangentConstructorIsPoint195}from'./tangentConstructor195'
const location=process.env.NATIVE195_LIBRARY
const library=location?JSON.parse(fs.readFileSync(location,'utf8'))as BrushLibrary:undefined
beforeAll(()=>{if(!library||!location)return;installBrushLibrary(library);for(const a of library.assets)installBrushPixels(a.id,new Uint8Array(fs.readFileSync(path.join(path.dirname(location),a.file))))})
const seeds={version:1 as const,sequentialSeed:123,strokeSeed:456}
const pen={sourceTwist:0,sourceTangentialPressure:.5}
const input=(time:number):Dab=>({...pen,x:20,y:20,size:16,pressure:1,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:time,sourceTime:time,sourceAngle:0,sourceSize:16,sourceScale:1,normalizedSpeed:0})
describe.skipIf(!library)('actual native195 payload dispatch and stationary inputs',()=>{
 it('prepares every admitted native descriptor through the public resource plan without a proxy',()=>{
  expect(library!.brushes.length).toBeGreaterThanOrEqual(52)
  for(const row of library!.brushes){const b=row.descriptor;expect(hasStationary195Scope(b),row.source).toBe(true);expect(resolveStationary195Role(b),row.source).not.toBeNull();expect(()=>brushPreparationPlan(b),row.source).not.toThrow()}
 })
 it('keeps old Filter147/Smudge payloads distinct from explicit native192/193 features',()=>{
  const filters=library!.brushes.map(r=>r.descriptor).filter(b=>b.filter),mixers=library!.brushes.map(r=>r.descriptor).filter(b=>b.mixer&&!b.filter&&!b.deform&&!b.grid&&!b.mypaint)
  expect(filters.some(b=>!usesNativeFilterMask(b))).toBe(true);expect(filters.some(usesNativeFilterMask)).toBe(true)
  expect(mixers.some(b=>!usesNativeSmudgeFeatures(b)&&!b.mixer!.sampling)).toBe(true);expect(mixers.some(usesNativeSmudgeFeatures)).toBe(true)
  for(const b of mixers.filter(b=>b.mixer!.sampling?.mode==='uniformMean'))expect(usesNativeSmudgeFeatures(b)).toBe(false)
 })
 it('retains F64 child time on held parent requests and yields identical whole/chunked geometry',()=>{
  const b=library!.brushes.find(r=>r.descriptor.behavior?.dual)?.descriptor;expect(b).toBeDefined();const child=b!.behavior!.dual!.brush
  const execution=mask190RootExecution(b!,{brushRandom:seeds}),childExecution=mask190ChildExecution(b!,execution)
  expect(childExecution!.maskRole190!.version).toBe(child.version);expect(child.version).toBe(190)
  const dabs=[0,20.125000000000004,40.25000000000001].map(input)
  const evaluate=(chunks:readonly Dab[][])=>{const state:SecondarySamplingState={remaining:0},geometry=beginBrushBehavior(dabs[0],childExecution),requests:Dab[]=[],sizes:number[]=[];for(const chunk of chunks){const selected=secondaryBrushDabs(b!,child,chunk,state,true,undefined,childExecution);requests.push(...selected);for(const dab of selected)sizes.push(...behaviorStampsForDab(child,dab,geometry,[0,0,0]).map(s=>s.size))}return{requests,sizes}}
  const whole=evaluate([dabs]),chunks=evaluate(dabs.map(d=>[d]));expect(chunks).toEqual(whole);expect(whole.requests.map(d=>d.sourceTime)).toEqual(dabs.map(d=>d.sourceTime));expect(new Set(whole.sizes).size).toBeGreaterThan(1)
 })
 it('selects the Tangent shortcut from configured dimensions, never low-pressure shaped size',()=>{
  const b=library!.brushes.find(r=>r.descriptor.tangentNormal?.sharpnessChecked)?.descriptor;expect(b).toBeDefined()
  expect(tangentConstructorIsPoint195(b!,1)).toBe(true);expect(tangentConstructorIsPoint195(b!,16)).toBe(false)
  const shaped=shapingForDigitalBrush(b!,{size:true,opacity:true});expect(tangentConstructorIsPoint195(b!,16)).toBe(false)
  expect(shaped.size(.01,0)*16).toBeLessThanOrEqual(16)
 })
 it('uses the finite native callback roles without inventing stationary ink or discarding line callbacks',()=>{
  for(const row of library!.brushes.filter(r=>r.source.startsWith('host-default-'))){const b=row.descriptor,role=resolveStationary195Role(b)!,sampler=new DabSystem({shaping:shapingForDigitalBrush(b,{size:true,opacity:true})})
   sampler.recordedPen188=b;sampler.captureSourceSize=true;sampler.captureSourceTime=true;sampler.captureSourceAngle=true;sampler.brushExecution=mask190RootExecution(b,{brushRandom:seeds});sampler.stationary195={...role,updateSpacingBetweenDabs:false,ignoreRate:role.family==='mypaint'};sampler.timing=b.behavior!.timing!
   expect(sampler.startStroke(20,20,1,0,0,16,0,0,0,pen)).toHaveLength(1)
   const requests=[25,50,75,100,125,150].flatMap(t=>[...sampler.continueTimedStroke(20,20,1,0,0,16,0,0,t,'hold',pen)])
   if(role.callback==='refreshOnly')expect(requests,row.source).toHaveLength(0)
   else if(role.callback==='lineCallback'){expect(requests.map(d=>d.sourceTime),row.source).toEqual([25,50,75,100,125,150]);expect(sampler['_spacingBehavior']!.dabSequence).toBe(role.family==='bristle'?7:1)}
   else expect(requests.length,row.source).toBeGreaterThan(0)
  }
 })
 it('moving Particle/Sketch callbacks do not spend the generic point counter, while stationary effective requests do',()=>{
  for(const name of ['host-default-particlebrush.kpp','host-default-sketchbrush.kpp']){const b=library!.brushes.find(r=>r.source===name)!.descriptor,role=resolveStationary195Role(b)!,sampler=new DabSystem({shaping:shapingForDigitalBrush(b,{size:true,opacity:true})});sampler.recordedPen188=b;sampler.captureSourceSize=true;sampler.captureSourceTime=true;sampler.captureSourceAngle=true;sampler.brushExecution=mask190RootExecution(b,{brushRandom:seeds});sampler.stationary195={...role,updateSpacingBetweenDabs:false};sampler.timing=b.behavior!.timing!;sampler.startStroke(20,20,1,0,0,16,0,0,0,pen)
   expect([...sampler.continueTimedStroke(21,20,1,0,0,16,0,0,1,'real',pen)]).toHaveLength(1);expect([...sampler.continueTimedStroke(22,20,1,0,0,16,0,0,2,'real',pen)]).toHaveLength(1);expect(sampler['_spacingBehavior']!.dabSequence).toBe(1)
   expect([...sampler.continueTimedStroke(22,20,1,0,0,16,0,0,102,'hold',pen)].length).toBeGreaterThan(0);expect(sampler['_spacingBehavior']!.dabSequence).toBeGreaterThan(1)
  }
 })
 it('retains constructor-size precision of nonmask families and floats only the five mask families',()=>{
  for(const row of library!.brushes){const b=row.descriptor,role=resolveStationary195Role(b)!;if(role.family==='bristle')continue
   const sampler=new DabSystem({shaping:shapingForDigitalBrush(b,{size:true,opacity:true})});sampler.recordedPen188=b;sampler.captureSourceSize=true;sampler.captureSourceTime=true;sampler.captureSourceAngle=true;sampler.brushExecution=mask190RootExecution(b,{brushRandom:seeds});sampler.stationary195={...role,updateSpacingBetweenDabs:false};sampler.timing=b.behavior!.timing!
   const dab=sampler.startStroke(20,20,1,0,0,16.3,0,0,0,pen)[0];expect(dab.sourceSize,row.source).toBe(['pixel','smudge','filter','sketch','spray'].includes(role.family)?Math.fround(16.3):16)
  }
 })
 it('rejects a malformed public195 resource plan before acquiring any resources',()=>{const b=structuredClone(library!.brushes[0].descriptor);b.behavior!.timing=undefined;expect(()=>brushPreparationPlan(b)).toThrow('Invalid whole')})
})
