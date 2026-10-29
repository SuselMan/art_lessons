import {expect,it,vi} from 'vitest'
import {isBrushLibrary,strokeDabs,type StrokeOperation,type BrushDescriptor} from '@grafetto/shared'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
import {createTestEngine,paperReady,pointerSample} from './testing/engineTestUtils'
let identity=82000
function fixture(rate=20){
 const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:`imported-${(++identity).toString(16).padStart(24,'0')}`,version:150,scatter:undefined,texture:undefined,wet:undefined,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,timing:{version:1,rate,ignoreDistanceSpacing:false},spacing:{mode:'diameter',coefficient:.2}}}
 const library={schemaVersion:1 as const,assets:[],skipped:[],brushes:[{name:'Timed fixture',source:'qa',warnings:[],descriptor}]}
 expect(isBrushLibrary(library)).toBe(true);installBrushLibrary(library);return `brush:${descriptor.id}@150`
}
async function setup(rate=20){const preset=fixture(rate),{engine}=createTestEngine({userId:'owner'},{width:64,height:64});await paperReady(engine);engine.initLayer('ink');engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(10);return engine}
it('holds through source author input, freezes real pen data and stops after pen-up',async()=>{
 const engine=await setup();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  engine['_onStart'](pointerSample(20,25,{pressure:.4,timeStamp:1000}))
  await vi.advanceTimersByTimeAsync(100)
  expect(engine['_strokeDabs'].map(d=>d.sourceTime)).toEqual([0,50,100])
  expect(engine['_strokeDabs'].every(d=>d.x===20&&d.y===25&&d.pressure===.4)).toBe(true)
  expect(engine['_airbrushInput']).toMatchObject({x:20,y:25,pressure:.4,timeStamp:1000})
  engine['_onEnd'](pointerSample(20,25,{pressure:0,timeStamp:1100}))
  const stroke=engine.getOperations().filter(o=>o.type==='stroke').at(-1)!
  expect(stroke.type).toBe('stroke');if(stroke.type!=='stroke')return
  expect(strokeDabs(stroke).map(d=>d.sourceTime)).toEqual([0,50,100])
  expect(engine['_airbrushTimer']).toBeNull()
  await vi.advanceTimersByTimeAsync(100)
  expect(strokeDabs(stroke)).toHaveLength(3)
 }finally{engine.destroy();vi.useRealTimers()}
})
it('quantizes elapsed dispatch to integer ms and accepts older hardware time after a hold tick',async()=>{
 const engine=await setup();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  engine['_onStart'](pointerSample(20,25,{pressure:1,timeStamp:1000}))
  const clock=vi.spyOn(performance,'now')
  clock.mockReturnValue(.9);expect(engine['_timedElapsed']()).toBe(0)
  clock.mockReturnValue(1.1);expect(engine['_timedElapsed']()).toBe(1)
  clock.mockReturnValue(.5);expect(engine['_timedElapsed']()).toBe(1)
  clock.mockRestore()
  await vi.advanceTimersByTimeAsync(100)
  const prefix=engine['_strokeDabs'].map(d=>({...d}))
  expect(()=>engine['_onMove'](pointerSample(30,25,{pressure:.7,timeStamp:5}))).not.toThrow()
  expect(engine['_strokeDabs'].slice(0,prefix.length)).toEqual(prefix)
  expect(engine['_strokeDabs'].every((d,i,a)=>i===0||d.sourceTime!>=a[i-1].sourceTime!)).toBe(true)
  expect(engine['_airbrushInput']).toMatchObject({x:30,y:25,pressure:.7,timeStamp:5})
  engine['_onEnd']({...pointerSample(30,25,{pressure:0,timeStamp:6}),cancelled:true})
  expect(engine['_airbrushTimer']).toBeNull()
 }finally{engine.destroy();vi.useRealTimers()}
})
it('stops owned wakeups on context loss and destroy without waiting for a callback',async()=>{
 for(const action of ['context','destroy']){
  const engine=await setup();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
  try{
   engine['_onStart'](pointerSample(20,25,{pressure:1,timeStamp:0}))
   expect(engine['_airbrushTimer']).not.toBeNull()
   if(action==='context')engine['_handleContextLost']({preventDefault(){}} as Event)
   else engine.destroy()
   expect(engine['_airbrushTimer']).toBeNull();expect(engine['_airbrushInput']).toBeUndefined()
   const n=engine['_strokeDabs'].length;await vi.advanceTimersByTimeAsync(100)
   expect(engine['_strokeDabs']).toHaveLength(n)
  }finally{if(action!=='destroy')engine.destroy();vi.useRealTimers()}
 }
})

it('yields delayed catchup and preserves the complete next gesture snapshot before it can execute',async()=>{
 const engine=await setup(1000);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  engine.setColor([1,0,0]);engine['_onStart'](pointerSample(10,10,{pressure:1,timeStamp:0}))
  clock.mockReturnValue(1000)
  engine['_onMove'](pointerSample(20,10,{pressure:1,timeStamp:1}))
  expect(engine['_strokeDabs'].length).toBeLessThan(1001)
  engine['_onEnd'](pointerSample(20,10,{pressure:0,timeStamp:2}))
  engine.setSize(21);engine.setOpacity(.3);engine.setColor([0,1,0])
  engine['_onStart'](pointerSample(30,30,{pressure:1,timeStamp:3}))
  engine['_onEnd'](pointerSample(30,30,{pressure:0,timeStamp:4}))
  engine.setSize(42);engine.setOpacity(.9);engine.setColor([0,0,1])
  await vi.advanceTimersByTimeAsync(50)
  const strokes=engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke'&&o.strokeEnd===true)
  expect(strokes).toHaveLength(2)
  expect(strokes[0].color).toEqual([1,0,0]);expect(strokes[1].color).toEqual([0,1,0])
  expect(engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke'&&o.strokeId===strokes[0].strokeId).flatMap(o=>strokeDabs(o))).toHaveLength(1001)
  expect(strokeDabs(strokes[1])[0]).toMatchObject({size:21,opacity:expect.closeTo(.3,5),sourceTime:0})
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers()}
})

it('uses latched dispatch time, not delayed processing or older coalesced hardware time',async()=>{
 const engine=await setup(100);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(500)
  engine['_onStart']({...pointerSample(10,10,{pressure:1,timeStamp:100}),dispatchTime:10})
  clock.mockReturnValue(900)
  engine['_onMove']({...pointerSample(10,10,{pressure:.7,timeStamp:1}),dispatchTime:30})
  engine['_onEnd']({...pointerSample(10,10,{pressure:0,timeStamp:2}),dispatchTime:30})
  await vi.advanceTimersByTimeAsync(20)
  const dabs=engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke').flatMap(strokeDabs)
  expect(dabs.map(d=>d.sourceTime)).toEqual([0,10,20])
  expect(dabs.at(-1)?.pressure).toBeCloseTo(.7,6)
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers()}
})
it('retains one replaceable hold horizon while canonical work is behind and cancels suspended planning on loss',async()=>{
 const engine=await setup(1000);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  engine['_onStart'](pointerSample(10,10,{pressure:.3,timeStamp:0}))
  clock.mockReturnValue(1000)
  await vi.advanceTimersByTimeAsync(1)
  expect(engine['_authorProducer']?.hold).toBeDefined()
  const held=engine['_authorProducer']!.hold
  clock.mockReturnValue(2000)
  await vi.advanceTimersByTimeAsync(1)
  expect(engine['_authorProducer']!.hold).toBe(held)
  expect(engine['_airbrushInput']).toMatchObject({pressure:.3,x:10,y:10})
  engine['_handleContextLost']({preventDefault(){}} as Event)
  expect(engine['_authorInput'].pending).toBe(false)
  expect(()=>engine['_dabs'].forkForPreview()).not.toThrow()
  expect(engine['_authorProducer']).toBeUndefined();expect(engine['_airbrushTimer']).toBeNull()
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers()}
})
it('queues an ordinary next tool on its captured layer and leaves a newer held gesture timer alive',async()=>{
 const engine=await setup(1000);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  engine['_onStart'](pointerSample(10,10,{pressure:1,timeStamp:0}))
  clock.mockReturnValue(1000)
  engine['_onMove'](pointerSample(10,10,{pressure:1,timeStamp:1}))
  engine['_onEnd'](pointerSample(10,10,{pressure:0,timeStamp:2}))
  engine.initLayer('next');engine.setActiveLayer('next');engine.setTool('pencil');engine.setPencil('HB');engine.setSize(13)
  engine['_onStart'](pointerSample(30,30,{pressure:1,timeStamp:3}))
  engine['_onEnd'](pointerSample(30,30,{pressure:0,timeStamp:4}))
  engine.setTool('digitalBrush');engine.setPencil(fixture(100));engine.setActiveLayer('ink')
  engine['_onStart'](pointerSample(40,40,{pressure:.6,timeStamp:5}))
  const producer=engine['_authorProducer']
  await vi.advanceTimersByTimeAsync(30)
  expect(engine['_authorProducer']).toBe(producer)
  expect(engine['_airbrushTimer']).not.toBeNull()
  const pencil=engine.getOperations().find((o):o is StrokeOperation=>o.type==='stroke'&&o.tool==='pencil')!
  expect(pencil).toMatchObject({tool:'pencil',preset:'HB',layerId:'next'})
  clock.mockReturnValue(1100);await vi.advanceTimersByTimeAsync(20)
  engine['_onEnd'](pointerSample(40,40,{pressure:0,timeStamp:6}))
  await vi.advanceTimersByTimeAsync(20)
  const held=engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke'&&o.preset!==pencil.preset&&o.strokeEnd===true).at(-1)!
  expect(strokeDabs(held).at(-1)?.sourceTime).toBe(100)
  expect(strokeDabs(held).every(d=>d.x===40&&d.y===40&&d.pressure===Math.fround(.6))).toBe(true)
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers()}
})
it('explicitly cancels suspended author work on page visibility loss',async()=>{
 const engine=await setup(1000);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  engine['_onStart'](pointerSample(10,10,{pressure:1,timeStamp:0}))
  clock.mockReturnValue(1000);engine['_onMove'](pointerSample(10,10,{pressure:1,timeStamp:1}))
  const previousDocument=globalThis.document
  vi.stubGlobal('document',{hidden:true})
  engine['_handleAuthorVisibility']()
  vi.stubGlobal('document',previousDocument)
  expect(engine['_authorInput'].pending).toBe(false)
  expect(engine['_airbrushTimer']).toBeNull();expect(engine['_authorProducer']).toBeUndefined()
  expect(()=>engine['_dabs'].forkForPreview()).not.toThrow()
  const n=engine.getOperations().length;await vi.advanceTimersByTimeAsync(20)
  expect(engine.getOperations()).toHaveLength(n)
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers()}
})
it('keeps individual captured hold boundaries exactly when timer work waits behind another continuation',async()=>{
 const queued=await setup(333),reference=await setup(333)
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  const down=pointerSample(.1,.3,{pressure:.37,timeStamp:0})
  queued['_onStart'](down);reference['_onStart'](down);reference['_stopAirbrush']()
  let blocked=true
  queued['_authorInput'].enqueue(function*(){while(blocked)yield})
  for(const time of [1000,1001,1002,1003]){
   clock.mockReturnValue(time);await vi.advanceTimersByTimeAsync(1)
   for(const _ of reference['_paintTimedInput'](down,time,0,0))void _
  }
  queued['_onEnd'](pointerSample(.1,.3,{pressure:0,timeStamp:1}))
  for(const _ of reference['_paintTimedInput'](down,1003,0,0))void _
  reference['_onEnd'](pointerSample(.1,.3,{pressure:0,timeStamp:1}))
  blocked=false;await vi.advanceTimersByTimeAsync(100)
  const dabs=(engine:typeof queued)=>engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke').flatMap(strokeDabs)
  expect(dabs(queued)).toEqual(dabs(reference))
  clock.mockRestore()
 }finally{queued.destroy();reference.destroy();vi.useRealTimers()}
})

it.each(['context','visibility','destroy'] as const)('preserves published chunks, clears owned tail and rejects reentrant revival on %s cancellation',async action=>{
 const engine=await setup(1000);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  engine['_onStart'](pointerSample(10,10,{pressure:1,timeStamp:0}))
  clock.mockReturnValue(2000);engine['_onMove'](pointerSample(20,10,{pressure:1,timeStamp:1}))
  engine['_flushStrokeChunk']()
  const published=engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke').map(o=>({id:o.id,packed:o.dabsPacked}))
  expect(published.length).toBeGreaterThan(0)
  const ended=vi.fn(()=>engine['_onStart'](pointerSample(40,40,{pressure:1,timeStamp:5})))
  engine['_onLiveStrokeEnd']=ended
  const previousDocument=globalThis.document
  if(action==='visibility'){vi.stubGlobal('document',{hidden:true});engine['_handleAuthorVisibility']();vi.stubGlobal('document',previousDocument)}
  else if(action==='context')engine['_handleContextLost']({preventDefault(){}} as Event)
  else engine.destroy()
  expect(ended).toHaveBeenCalledWith(expect.any(String),true)
  expect(engine['_authorInput'].pending).toBe(false);expect(engine['_authorProducer']).toBeUndefined()
  expect(engine['_strokeLayerId']).toBeNull();expect(engine['_strokeId']).toBeNull()
  expect(engine['_strokeChunkTail']).toBeUndefined();expect(engine['_strokeChunkBox']).toBeNull()
  expect(engine['_liveDabQueue']).toEqual([])
  expect(engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke').map(o=>({id:o.id,packed:o.dabsPacked}))).toEqual(published)
  await vi.advanceTimersByTimeAsync(30);expect(engine['_authorInput'].pending).toBe(false)
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers()}
})
it('drains captured timed work through one browser macrotask channel without RAF advancement',async()=>{
 const previousWindow=globalThis.window,deliveries:Array<()=>void>=[],ports:Array<{onmessage:((event:MessageEvent)=>unknown)|null;close:ReturnType<typeof vi.fn>}>=[]
 let created=0
 class BrowserChannel {
  port1={onmessage:null as ((event:MessageEvent)=>unknown)|null,close:vi.fn(),postMessage(){}}
  port2={onmessage:null,close:vi.fn(),postMessage:(token:number)=>{const handler=this.port1.onmessage;deliveries.push(()=>handler?.({data:token} as MessageEvent))}}
  constructor(){created++;ports.push(this.port1,this.port2)}
 }
 vi.stubGlobal('window',{MessageChannel:BrowserChannel})
 const engine=await setup(1000);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
 try{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0)
  expect(created).toBe(0)
  engine['_onStart'](pointerSample(10,10,{pressure:1,timeStamp:0}))
  clock.mockReturnValue(1000);engine['_onMove'](pointerSample(10,10,{pressure:1,timeStamp:1}))
  engine['_onEnd'](pointerSample(10,10,{pressure:0,timeStamp:2}))
  engine.setColor([0,1,0]);engine.setSize(21);engine['_onStart'](pointerSample(30,30,{pressure:1,timeStamp:3}));engine['_onEnd'](pointerSample(30,30,{pressure:0,timeStamp:4}))
  expect(created).toBe(1);expect(engine['_authorInput'].pending).toBe(true)
  while(deliveries.length)deliveries.shift()!()
  const strokes=engine.getOperations().filter((o):o is StrokeOperation=>o.type==='stroke')
  expect(strokes.filter(o=>o.strokeEnd)).toHaveLength(2)
  expect(strokes.filter(o=>o.strokeId===strokes[0].strokeId).flatMap(strokeDabs)).toHaveLength(1001)
  expect(strokes.at(-1)?.color).toEqual([0,1,0]);expect(engine['_authorInput'].pending).toBe(false)
  // An idle channel is reused rather than leaked or recreated per gesture.
  engine['_onStart'](pointerSample(40,40,{pressure:1,timeStamp:5}));clock.mockReturnValue(2000);engine['_onMove'](pointerSample(40,40,{pressure:1,timeStamp:6}))
  expect(created).toBe(1)
  const stale=deliveries.shift()!
  engine['_handleContextLost']({preventDefault(){}} as Event)
  expect(ports.every(p=>p.close.mock.calls.length===1)).toBe(true)
  stale();expect(engine['_authorInput'].pending).toBe(false);expect(engine['_strokeLayerId']).toBeNull()
  clock.mockRestore()
 }finally{engine.destroy();vi.useRealTimers();vi.stubGlobal('window',previousWindow)}
})
