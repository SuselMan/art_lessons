import fs from'node:fs'
import{describe,it,expect}from'vitest'
import type{BrushLibrary,BrushDescriptor,Dab}from'@grafetto/shared'
import{behaviorStampsForDab,beginBrushBehavior,brushDynamicValue}from'./brushBehavior'
import{mask190RootExecution}from'./independentMask190'
import{DIGITAL_BRUSHES}from'./digitalBrushPresets'
const read=(location:string|undefined)=>location?JSON.parse(fs.readFileSync(location,'utf8'))as BrushLibrary:undefined
const native=read(process.env.NATIVE195_LIBRARY),fade=read(process.env.NATIVE195_RENDER_LIBRARY),seeds={version:1 as const,sequentialSeed:123,strokeSeed:456}
const input=(x:number,t:number):Dab=>({x,y:20,size:16,pressure:1,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t,sourceTime:t,sourceAngle:0,sourceSize:16,sourceScale:1,sourceTwist:0,sourceTangentialPressure:.5,normalizedSpeed:0})
const dabs=Array.from({length:16},(_,i)=>input(i<5?10+i*2:i===5?18:10+(i-1)*2,i<5?i*10:100+(i-5)*10))
function trace(brush:BrushDescriptor,partition:boolean){let state=beginBrushBehavior(dabs[0],mask190RootExecution(brush,{brushRandom:seeds}));const rows:{generic:number|undefined;history:number|undefined;sizes:number[];stamps:unknown}[]=[];for(let i=0;i<dabs.length;i++){if(partition&&i===4)state=structuredClone(state);const stamps=behaviorStampsForDab(brush,dabs[i],state,[.2,.3,.4]);rows.push({generic:state.genericDabSequence195,history:state.dabSequence,sizes:stamps.map(s=>s.size),stamps})}return{rows,state}}
describe.skipIf(!native||!fade)('native195 generic render counter independent of callback history',()=>{
 it('applies actual Curve/Sketch Line width Fade through the generic counter across chunks and scratch forks',()=>{
  const curve=fade!.brushes.find(r=>r.descriptor.curveTrace)?.descriptor,sketch=fade!.brushes.find(r=>r.descriptor.sketch)?.descriptor;expect(curve,'genuine native Curve Fade required').toBeDefined();expect(sketch,'genuine native Sketch Fade required').toBeDefined()
  for(const b of[curve!,sketch!]){expect((b.curveTrace??b.sketch)!.dynamics!.width![0].control).toBe('dabProgress');const all=trace(b,false),chunks=trace(b,true);expect(chunks).toEqual(all);expect(all.rows.map(r=>r.history)).toEqual(dabs.map((_,i)=>i+1));expect(all.rows.map(r=>r.generic)).toEqual(b.curveTrace?dabs.map(()=>1):dabs.map((_,i)=>i<5?1:2));expect(all.rows.flatMap(r=>r.sizes).length).toBeGreaterThan(0)
   const widthControl=(b.curveTrace??b.sketch)!.dynamics!.width![0],factor=(n:number)=>brushDynamicValue(widthControl,dabs[0],{...all.state,genericDabSequence195:n},0)
   if(b.curveTrace){for(const size of all.rows.slice(1).flatMap(r=>r.sizes))expect(size).toBeCloseTo(16*factor(1),10)}
   else{for(const r of all.rows.slice(1,6))for(const size of r.sizes)expect(size).toBeCloseTo(Math.max(.9,b.sketch!.width*factor(1)),10);for(const r of all.rows.slice(6))for(const size of r.sizes)expect(size).toBeCloseTo(Math.max(.9,b.sketch!.width*factor(2)),10)}
  }
 })
 it('keeps real Particle history/RNG progression but does not fabricate a render Opacity option',()=>{
  const b=native!.brushes.find(r=>r.source==='host-default-particlebrush.kpp')!.descriptor,all=trace(b,false);expect(trace(b,true)).toEqual(all);expect(all.rows.map(r=>r.history)).toEqual(dabs.map((_,i)=>i+1));expect(all.rows.map(r=>r.generic)).toEqual(dabs.map((_,i)=>i<5?1:2));expect(b.behavior?.modulations?.opacity).toBeUndefined()
  const state=beginBrushBehavior(dabs[0],mask190RootExecution(b,{brushRandom:seeds}));expect(()=>behaviorStampsForDab(b,{...dabs[0],sourceTwist:NaN},state,[0,0,0])).toThrow();expect(state.genericDabSequence195).toBeUndefined()
 })
 it('leaves historical counters unchanged and does not advance a real state through a cloned geometry probe',()=>{
  const old=DIGITAL_BRUSHES[0],state=beginBrushBehavior(dabs[0]);for(const d of dabs)behaviorStampsForDab(old,d,state,[0,0,0]);expect(state.genericDabSequence195).toBeUndefined();expect(state.dabSequence).toBe(dabs.length)
  const progress={control:'dabProgress' as const,period:32,minimum:0,jitter:0};expect(brushDynamicValue(progress,dabs[0],state,0)).toBe(.5)
  const b=fade!.brushes.find(r=>r.descriptor.curveTrace)!.descriptor,actual=beginBrushBehavior(dabs[0],mask190RootExecution(b,{brushRandom:seeds})),before=structuredClone(actual);behaviorStampsForDab(b,dabs[0],structuredClone(actual),[0,0,0],{geometryOnly:true});expect(actual).toEqual(before)
 })
})
