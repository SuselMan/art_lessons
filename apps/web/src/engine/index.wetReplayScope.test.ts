import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady} from './testing/engineTestUtils'
import type {PencilEngine,PencilEngineOptions} from './index'
import {PointerInput,type PointerData} from './src/input/PointerInput'
import {WetTranscript} from './src/paper/WetTranscript'
const engines:PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0))e.destroy()})
async function setup(options:PencilEngineOptions={}){const {engine:e}=createTestEngine({userId:'actor',...options},{width:64,height:64});engines.push(e);for(const id of ['L1','L2'])e.appendOperation(makeLayerAdd('actor',id));e.setCompositeOrder([{id:'L1',opacity:1},{id:'L2',opacity:1}]);e.setActiveLayer('L1');await paperReady(e);e.setTool('watercolor');e.setPencil('normal:20:100:PB29:round');e.setSize(8);e['_paperWet'].deposit('L1',20,20,32,.8,performance.now()-1000,false,.3);return e}
async function recorded(){
 const tape=new WetTranscript(),e=await setup({diagnosticPointerAdmission:true,diagnosticWetTranscript:tape.observe}),snapshot=e['_paperWet'].captureDiagnosticSnapshot(),samples:Array<{kind:'start'|'move'|'end';sample:PointerData}>=[]
 const listeners=new Map<string,((e:PointerEvent)=>void)[]>();const canvas={width:64,height:64,style:{},addEventListener(type:string,fn:(e:PointerEvent)=>void){listeners.set(type,[...(listeners.get(type)??[]),fn])},removeEventListener(){},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:64,height:64})} as unknown as HTMLCanvasElement
 const pointer=new PointerInput(canvas);for(const kind of ['start','move','end'] as const)pointer.on(kind,s=>{samples.push({kind,sample:{...s}});if(kind==='start')e['_onStart'](s);else if(kind==='move')e['_onMove'](s);else e['_onEnd'](s)})
 const event=(x:number,t:number)=>({button:0,pointerId:1,pointerType:'pen',pressure:.7,clientX:x,clientY:20,tiltX:8,tiltY:-4,timeStamp:t} as PointerEvent);const emit=(type:string,event:PointerEvent)=>{for(const fn of listeners.get(type)??[])fn(event)}
 try{emit('pointerdown',event(8,100));emit('pointermove',{...event(24,124),getCoalescedEvents:()=>[event(16,112),event(24,124)]});emit('pointerup',event(24,128))}finally{pointer.destroy()}
 const op=e.getOperations().find(op=>op.type==='stroke');if(!op||op.type!=='stroke'||!op.strokeId||!op.washId)throw Error('No authoritative source metadata');expect(tape.dropped).toBe(0);expect(e['_wetTranscriptErrors']).toBe(0);return {tape,snapshot,samples,op}
}
function capture(e:PencilEngine,r:Awaited<ReturnType<typeof recorded>>,events=r.tape.events){return e.diagnosticCaptureWetReplay(r.op.strokeId!,r.op.washId!,r.op.id,r.snapshot,events,{dropped:0,errors:0})}
it('actual handlers on captured fork preserve entire original operation after live paper/tool/layer changes; live model untouched',async()=>{
 const r=await recorded(),e=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),packet=capture(e,r)
 e['_paperWet'].clear();e['_paperWet'].deposit('L2',40,40,4,.2,performance.now(),true,.1);e.setTool('pencil');e.setSize(30);e.setActiveLayer('L2')
 const live=e['_paperWet'],before=live.captureDiagnosticSnapshot(),fixedNow=performance.now(),beforeRaster=live.rasterWetAndPool(-2,-2,1,12,12,fixedNow)
 for(const item of r.samples)e.diagnosticDispatchPointerAdmission(packet,item.kind,item.sample,r.op.timestamp)
 const op=e.getOperations().find(op=>op.type==='stroke');expect(op).toEqual(r.op);expect(e['_paperWet']).toBe(live);expect(live.rasterWetAndPool(-2,-2,1,12,12,fixedNow)).toEqual(beforeRaster);expect(live.captureDiagnosticSnapshot().recordCount).toBe(before.recordCount)
 expect(e['_wetReplayScope']).toBeNull();expect(e['_opts'].tool).toBe('pencil');expect(e['_activeId']).toBe('L2');expect(e['_opts'].size).toBe(30)
})
it('wrong clock stage fails fresh scope without fallback, restores fields and locks failed Engine until destroy',async()=>{
 const r=await recorded(),e=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),changed=r.tape.events.map(event=>event.kind==='clock'&&event.stage==='admission-touch'?{...event,stage:'wash-join' as const}:event),packet=capture(e,r,changed)
 expect(()=>e.diagnosticDispatchPointerAdmission(packet,'start',r.samples[0].sample,r.op.timestamp)).toThrow('stage/order');expect(e['_wetReplayScope']).toBeNull();expect(e['_locked']).toBe(true);expect(e.getOperations().some(op=>op.type==='stroke')).toBe(false);expect(()=>capture(e,r)).toThrow('fresh owner')
})
it('foreign packet/destroyed owner fail before input; material throw and reentrancy restore scope but never claim rollback',async()=>{
 const r=await recorded(),a=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),b=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),packet=capture(a,r)
 expect(()=>b.diagnosticDispatchPointerAdmission(packet,'start',r.samples[0].sample,r.op.timestamp)).toThrow('owner');a.destroy();expect(()=>a.diagnosticDispatchPointerAdmission(packet,'start',r.samples[0].sample,r.op.timestamp)).toThrow('owner')
 const throwing=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),p=capture(throwing,r);vi.spyOn(throwing as unknown as {_paintStrokeDabs():void},'_paintStrokeDabs').mockImplementation(()=>{throw Error('paint throw')});expect(()=>throwing.diagnosticDispatchPointerAdmission(p,'start',r.samples[0].sample,r.op.timestamp)).toThrow('paint throw');expect(throwing['_wetReplayScope']).toBeNull();expect(throwing['_locked']).toBe(true)
 const nested=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),n=capture(nested,r);nested['_wetTranscriptObserver']=()=>nested.diagnosticDispatchPointerAdmission(n,'start',r.samples[0].sample,r.op.timestamp);expect(()=>nested.diagnosticDispatchPointerAdmission(n,'start',r.samples[0].sample,r.op.timestamp)).toThrow('Failed wet replay');expect(nested['_wetReplayScope']).toBeNull();expect(nested['_locked']).toBe(true)
})
it('callback installed after capture rejects every dispatch before handler/model mutation and latches failure',async()=>{
 const r=await recorded()
 for(const lateKind of ['start','move','end'] as const){const e=await setup({diagnosticPointerAdmission:true,diagnosticWetReplay:true}),packet=capture(e,r)
  if(lateKind!=='start')e.diagnosticDispatchPointerAdmission(packet,'start',r.samples[0].sample,r.op.timestamp)
  if(lateKind==='end')for(const item of r.samples.filter(item=>item.kind==='move'))e.diagnosticDispatchPointerAdmission(packet,'move',item.sample,r.op.timestamp)
  const live=e['_paperWet'],at=performance.now(),before=live.rasterWetAndPool(-2,-2,1,12,12,at),revision=e['_log'].revision,paint=vi.spyOn(e as unknown as {_paintStrokeDabs():void},'_paintStrokeDabs'),callback=vi.fn(()=>e.appendOperation(makeLayerAdd('peer','late')))
  e['_onLocalOperation']=callback;const item=r.samples.find(item=>item.kind===lateKind)!
  expect(()=>e.diagnosticDispatchPointerAdmission(packet,lateKind,item.sample,r.op.timestamp)).toThrow('owner');expect(callback).not.toHaveBeenCalled();expect(paint).not.toHaveBeenCalled();expect(e['_log'].revision).toBe(revision);expect(live.rasterWetAndPool(-2,-2,1,12,12,at)).toEqual(before);expect(e['_wetReplayScope']).toBeNull();expect(e['_locked']).toBe(true)
 }
})
