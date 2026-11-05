import {expect,it,vi} from 'vitest'
import type {BrushDescriptor,Dab,BrushDynamic} from '@grafetto/shared'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from './testing/engineTestUtils'
let serial=1400
const control=(kind:BrushDynamic['control']):BrushDynamic=>({control:kind,jitter:0,minimum:0,...(kind==='fade'?{fade:1}:{})})
function fixture(mixer:NonNullable<BrushDescriptor['mixer']>,behavior:BrushDescriptor['behavior']={version:2}){
 const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-'+(++serial).toString(16).padStart(24,'0'),version:14,model:'mixer',opacity:1,tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,0],[1,1]],behavior,mixer}
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored foreground',source:'qa',warnings:[],descriptor}],assets:[],skipped:[]});return `brush:${descriptor.id}@14`
}
const source={load:0,initialLoad:0,pickup:.8,strength:1,source:'previousCanvas' as const,smearAlpha:true}
it('keeps foreground independent of pickup, multiplies its own dynamics and effective opacity, and uses per-stamp HSV color',async()=>{
 const preset=fixture({...source,foreground:{rate:.2,dynamics:[control('pressure')]}},{version:2,dynamics:{saturation:{control:'off',minimum:0,jitter:0,strength:1,curve:[[0,0],[1,0]]}}})
 const {engine}=createTestEngine({}, {width:128,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const uniforms=vi.spyOn(engine['gl'],'uniform4f'),scalar=vi.spyOn(engine['gl'],'uniform1f')
  engine.appendOperation(makeStroke('peer','ink',[20,40].map(x=>({...dab(x,32,{size:20,pressure:.5}),opacity:.6})),{tool:'digitalBrush',preset,color:[.8,.2,.2],strokeId:'foreground',strokeEnd:true}),'remote')
  const foreground=uniforms.mock.calls.filter(([loc])=>(loc as unknown as {name:string}).name==='u_previousCanvasForeground').map(c=>c.slice(1))
  expect(foreground.length).toBeGreaterThan(0)
  for(const values of foreground){expect(values.slice(0,3)).toEqual([.8,.8,.8]);expect(values[3]).toBeCloseTo(.2*.5*.5*.6,7)}
  scalar.mock.calls.filter(([loc])=>(loc as unknown as {name:string}).name==='u_strength').forEach(([,v])=>expect(v).toBeCloseTo(.8*.5*.6,7))
 }finally{engine.destroy()}
})
it('evaluates radius and foreground fade before logical state advancement and preserves results across chunks',async()=>{
 const preset=fixture({...source,sampling:{mode:'uniformMean',radius:1,radiusDynamics:[control('fade')]},foreground:{rate:.2,dynamics:[control('fade')]}})
 const run=async(chunked:boolean)=>{
  const {engine}=createTestEngine({}, {width:128,height:80})
  try{
   await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
   const painter=engine['_smudge'] as unknown as {drawTransferDab:(...args:unknown[])=>void},transfer=vi.spyOn(painter,'drawTransferDab')
   const dabs=[20,40,60].map(x=>dab(x,40,{size:40,pressure:1}))
   const append=(input:Dab[],end:boolean)=>engine.appendOperation(makeStroke('peer','ink',input,{tool:'digitalBrush',preset,strokeId:'fade',...(end?{strokeEnd:true as const}:{})}),'remote')
   if(chunked){append(dabs.slice(0,1),false);append(dabs.slice(1),true)}else append(dabs,true)
   return transfer.mock.calls.map(call=>{const wet=call[9] as {samplingRadius:number;foregroundRate:number};return [wet.samplingRadius,wet.foregroundRate]})
  }finally{engine.destroy()}
 }
 const full=await run(false);expect(full).toEqual([[1,.2],[.5,.1]]);expect(await run(true)).toEqual(full)
})
it('keeps absent foreground opt-in disabled on the pure previous-canvas path',async()=>{
 const preset=fixture(source),{engine}=createTestEngine({}, {width:80,height:64})
 try{await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const u=vi.spyOn(engine['gl'],'uniform4f')
 engine.appendOperation(makeStroke('peer','ink',[dab(20,32),dab(40,32)],{tool:'digitalBrush',preset,strokeId:'pure',strokeEnd:true}),'remote')
 const alpha=u.mock.calls.filter(([loc])=>(loc as unknown as {name:string}).name==='u_previousCanvasForeground').map(c=>c[4]);expect(alpha.length).toBeGreaterThan(0);expect(alpha.every(v=>v===0)).toBe(true)
 }finally{engine.destroy()}
})
