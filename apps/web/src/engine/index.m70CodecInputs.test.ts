import {expect,it,vi} from 'vitest'
import {strokeDabs,type Dab,type StrokeOperation} from '@grafetto/shared'
import {PencilEngine} from './index'
import {createTestEngine,paperReady} from './testing/engineTestUtils'
// Presentation-only shaders are outside this CPU input experiment. Material
// deposition, controller/source, pointer normalization and replay remain real.
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t'] as const
function make(){
 // Capture the actual DOM listeners registered by a fresh engine. This feeds
 // PointerInput and DabSystem; no preconstructed dabs or packed op is authored.
 const scaffold=createTestEngine();scaffold.engine.destroy()
 const listeners=new Map<string,EventListener>()
 const canvas={...scaffold.canvas,width:64,height:64,clientWidth:64,clientHeight:64,getBoundingClientRect:()=>({left:0,top:0,width:64,height:64}),addEventListener:(type:string,listener:EventListener)=>listeners.set(type,listener),removeEventListener:(type:string)=>listeners.delete(type)}
 const engine=new PencilEngine(canvas as unknown as HTMLCanvasElement,{userId:'A',pageWidth:64,pageHeight:64,paper:'flat',watercolorModel:'m70-r2-v1'})
 engine['_sliceLimits'].budgetMs=Infinity;engine.initLayer('L');engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:95:34:PB29:round');engine.setColor([.1,.25,.8])
 const pointer=(type:string,x:number,y:number,timeStamp:number)=>{
  const event={type,button:0,buttons:type==='pointerup'?0:1,pointerType:'pen',pointerId:1,isPrimary:true,clientX:x,clientY:y,pressure:type==='pointerup'?0:.7317,tiltX:0,tiltY:0,timeStamp,preventDefault(){},getCoalescedEvents(){return[this]}}
  listeners.get(type)!(event as unknown as Event)
 }
 return{engine,pointer}
}
function capture(engine:PencilEngine){
 const painter=engine['_ribbonPainter'],original=painter.paint.bind(painter)
 const delivered:Dab[]=[],nibs:Dab[]=[];let last:Parameters<typeof painter.paint>[6]|undefined
 const ctx=(painter as unknown as {ctx:{drawRibbonNibPass(...args:unknown[]):void}}).ctx
 const nib=ctx.drawRibbonNibPass.bind(ctx)
 const material=vi.spyOn(painter,'paint').mockImplementation(function*(...args){
  const splits=args[4].normalizeDeposit&&painter.diagnosticSegmentDelivery&&args[1].length>1&&!args[12]?.segmented
  if(!splits)delivered.push(...args[1].map(d=>({...d})))
  last=args[6];yield* original(...args)
 })
 const render=vi.spyOn(ctx,'drawRibbonNibPass').mockImplementation((...args)=>{nibs.push({...args[2] as Dab});nib(...args)})
 return{delivered,nibs,finish:()=>{
  const values=last?Object.fromEntries(['waterUsed','pigmentUsed','surplusWater','surplusPigment','brakeWater','brakePigment','speed','speedPeak','dwellMs'].map(key=>[key,(last as unknown as Record<string,unknown>)[key]])):{}
  material.mockRestore();render.mockRestore();return values
 }}
}
function differences(a:Dab[],b:Dab[]){const count:Record<string,number>={},max:Record<string,number>={};for(let i=0;i<Math.min(a.length,b.length);i++)for(const f of fields)if(!Object.is(a[i][f],b[i][f])){count[f]=(count[f]??0)+1;max[f]=Math.max(max[f]??0,Math.abs(a[i][f]-b[i][f]))}return{count,max}}
for(const chunked of [false,true])it(`actual pointer M70 material receives exact recorded codec inputs (${chunked?'automatic chunk':'UP taper'})`,async()=>{
 const author=make();await paperReady(author.engine);author.engine.setSize(chunked?2.4:8.37)
 const live=capture(author.engine)
 let operations:StrokeOperation[]=[],authorScalars:Record<string,unknown>={},rawFieldsOff32=0
 try{
  author.pointer('pointerdown',16.123456789,22.234567891,1000.123456789)
  const moves=chunked?72:6
  for(let i=1;i<=moves;i++)author.pointer('pointermove',chunked?(i%2?48.123456789:16.123456789):16.123456789+i*3.123456789,22.234567891+i*.0123456789,1000.123456789+i*37.123456789)
  rawFieldsOff32=author.engine['_strokeDabs'].reduce((n,d)=>n+fields.filter(f=>!Object.is(d[f],Math.fround(d[f]))).length,0)
  author.pointer('pointerup',chunked?16.123456789:34.864197523,22.456789123,1000.123456789+(moves+1)*37.123456789)
  operations=author.engine.getOperations().filter((op):op is StrokeOperation=>op.type==='stroke')
  if(chunked)expect(operations.length).toBeGreaterThanOrEqual(2);else expect(operations).toHaveLength(1)
  expect(live.delivered.length).toBeGreaterThan(4)
  authorScalars=live.finish()
 }finally{author.engine.destroy()}
 const decoded=operations.flatMap(strokeDabs)
 expect(decoded).toHaveLength(live.delivered.length)
 expect(live.delivered.map(d=>Object.fromEntries(fields.map(f=>[f,Math.fround(d[f])])))).toEqual(decoded)
 expect(decoded.some(d=>d.pressure===0)).toBe(true)
 const receiver=make();await paperReady(receiver.engine);const replay=capture(receiver.engine)
 try{
  for(const op of operations)receiver.engine.appendOperation(op,'remote')
  expect(replay.delivered).toEqual(decoded)
  const replayScalars=replay.finish(),codec=differences(live.delivered,replay.delivered),render=differences(live.nibs,replay.nibs)
  expect(rawFieldsOff32).toBeGreaterThan(0)
  expect(codec.count).toEqual({})
  expect(render.count).toEqual({})
  expect(live.nibs).toEqual(replay.nibs)
  expect(replayScalars).toEqual(authorScalars)
  const scalarDelta=Object.fromEntries(Object.keys(authorScalars).filter(key=>typeof authorScalars[key]==='number'&&typeof replayScalars[key]==='number').map(key=>[key,(authorScalars[key]as number)-(replayScalars[key]as number)]))
  console.log(JSON.stringify({diagnostic:'CPU inputs only, not pixel divergence or causal explanation of956',chunked,rawFieldsOff32,operations:operations.length,dabs:decoded.length,authorRenderNibs:live.nibs.length,replayRenderNibs:replay.nibs.length,codec,render,scalarDelta}))
 }finally{receiver.engine.destroy()}
})
