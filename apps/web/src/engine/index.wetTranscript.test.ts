import {afterEach,expect,it} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
import type {PencilEngine,PencilEngineOptions} from './index'
import {PaperWetness} from './src/paper/paperWetness'
import {WetTranscript,replayWetTranscript,WetClockCursor} from './src/paper/WetTranscript'
import {PointerInput} from './src/input/PointerInput'
const engines:PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0))e.destroy()})
async function setup(options:PencilEngineOptions){const {engine:e}=createTestEngine({userId:'actor',...options},{width:64,height:64});engines.push(e);e.appendOperation(makeLayerAdd('actor','L'));e.setCompositeOrder([{id:'L',opacity:1}]);e.setActiveLayer('L');await paperReady(e);e.setTool('watercolor');e.setPencil('normal:20:100:PB29:round');e.setSize(8);e['_paperWet'].deposit('L',20,20,32,.8,performance.now()-1000,false,.3);e['_paperWet'].deposit('L',8,8,4,.9,performance.now(),true,.6);return e}
it('actual PointerInput and Engine brush wet profile replays exact recorded batch times/actions on independent fork',async()=>{
 const transcript=new WetTranscript(),e=await setup({diagnosticPointerAdmission:true,diagnosticWetTranscript:transcript.observe}),initial=e['_paperWet'].captureDiagnosticSnapshot(),fork=PaperWetness.forkDiagnosticSnapshot(initial)
 const listeners=new Map<string,((e:PointerEvent)=>void)[]>();const canvas={width:64,height:64,style:{},addEventListener(type:string,fn:(e:PointerEvent)=>void){listeners.set(type,[...(listeners.get(type)??[]),fn])},removeEventListener(){},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:64,height:64})} as unknown as HTMLCanvasElement
 const pointer=new PointerInput(canvas);pointer.on('start',s=>e['_onStart'](s)).on('move',s=>e['_onMove'](s)).on('end',s=>e['_onEnd'](s))
 const ev=(x:number,t:number)=>({button:0,pointerId:1,pointerType:'pen',pressure:.7,clientX:x,clientY:20,tiltX:8,tiltY:-4,timeStamp:t} as PointerEvent);const emit=(type:string,event:PointerEvent)=>{for(const fn of listeners.get(type)??[])fn(event)}
 try{emit('pointerdown',ev(8,100));emit('pointermove',{...ev(24,124),getCoalescedEvents:()=>[ev(16,112),ev(24,124)]});emit('pointerup',ev(24,128))}finally{pointer.destroy()}
 const strokes=e.getOperations().filter(op=>op.type==='stroke');expect(strokes).toHaveLength(1);const op=strokes[0];if(op.type!=='stroke')throw Error('No stroke')
 expect(transcript.dropped).toBe(0);expect(e['_wetTranscriptErrors']).toBe(0);expect(transcript.events[0]).toMatchObject({kind:'clock',stage:'admission-touch'});expect(transcript.events.findIndex(event=>event.kind==='drop-pending')).toBeLessThan(transcript.events.findIndex(event=>event.kind==='sample'));expect(transcript.events.at(-1)?.kind).toBe('commit')
 const cursor=new WetClockCursor(transcript.events,{dropped:0,errors:0});for(const event of transcript.events)if(event.kind==='clock')expect(cursor.next(event.stage,event.batch)).toBe(event.value);cursor.assertDone();expect(transcript.events.filter(event=>event.kind==='clock').map(event=>event.kind==='clock'?event.stage:null)).toEqual(expect.arrayContaining(['admission-touch','wash-join','checkpoint-wall','wash-ended','pending-commit']))
 const profiles=replayWetTranscript(fork,transcript.events,{dropped:transcript.dropped,errors:e['_wetTranscriptErrors']});expect(profiles.get(op.strokeId!)).toBe(op.wet);expect(op.wet).toBeTruthy();expect(transcript.events.some(e=>e.kind==='drain')).toBe(true)
 const now=performance.now();expect(fork.rasterWetAndPool(-2,-2,1,12,12,now)).toEqual(e['_paperWet'].rasterWetAndPool(-2,-2,1,12,12,now));expect(fork.peak(now)).toBe(e['_paperWet'].peak(now))
 const changed=transcript.events.map(event=>event.kind==='sample'?{...event,now:event.now+60000}:event);const fresh=PaperWetness.forkDiagnosticSnapshot(initial);expect(()=>replayWetTranscript(fresh,changed,{dropped:0,errors:0})).toThrow('sample mismatch')
 const drainIndex=transcript.events.findIndex(event=>event.kind==='drain'),reordered=[transcript.events[0],transcript.events[drainIndex],...transcript.events.slice(1).filter((_,i)=>i+1!==drainIndex)];expect(()=>replayWetTranscript(PaperWetness.forkDiagnosticSnapshot(initial),reordered,{dropped:0,errors:0})).toThrow('sample mismatch')
})
it('constructor OFF ignores observer; throwing observer does not block real brush or UP commit',async()=>{
 let called=0;const off=await setup({diagnosticWetTranscript:()=>called++});simulateStrokeStart(off,8,20);simulateStrokeMove(off,16,20);simulateStrokeEnd(off,24,20);expect(called).toBe(0);expect(off['_wetTranscriptBatch']).toBe(0);expect(off['_wetClockOrdinal']).toBe(0)
 const failing=await setup({diagnosticPointerAdmission:true,diagnosticWetTranscript:()=>{throw Error('observer')}});simulateStrokeStart(failing,8,20);simulateStrokeMove(failing,16,20);simulateStrokeEnd(failing,24,20);expect(failing.getOperations().some(op=>op.type==='stroke')).toBe(true);expect(failing['_strokeLayerId']).toBeNull();expect(failing['_wetTranscriptErrors']).toBeGreaterThan(0)
 const bounded=new WetTranscript(1);bounded.observe({kind:'drop-pending'});bounded.observe({kind:'drop-pending'});expect(bounded.events).toHaveLength(1);expect(bounded.dropped).toBe(1);expect(()=>replayWetTranscript(new PaperWetness(),bounded.events,{dropped:bounded.dropped,errors:0})).toThrow('Incomplete');expect(()=>replayWetTranscript(new PaperWetness(),[],{dropped:0,errors:1})).toThrow('Incomplete')
})
it('typed clock cursor rejects wrong stage/batch, missing/duplicate ordinal and incomplete evidence without retry',()=>{
 const records=[{kind:'clock',stage:'admission-touch',value:100,ordinal:1,batch:null,layerId:'L',strokeId:null},{kind:'clock',stage:'sample-batch',value:102,ordinal:2,batch:1,layerId:'L',strokeId:'S'}] as const
 const cursor=new WetClockCursor(records,{dropped:0,errors:0});expect(()=>cursor.next('wash-join')).toThrow('order');expect(()=>cursor.next('admission-touch')).toThrow('order')
 const missing=new WetClockCursor(records,{dropped:0,errors:0});missing.next('admission-touch');expect(()=>missing.assertDone()).toThrow('Incomplete')
 const batch=new WetClockCursor(records,{dropped:0,errors:0});batch.next('admission-touch');expect(()=>batch.next('sample-batch',2)).toThrow('order')
 expect(()=>new WetClockCursor([records[1],records[0]],{dropped:0,errors:0})).toThrow('ordinal');expect(()=>new WetClockCursor([records[0],{...records[1],ordinal:1}],{dropped:0,errors:0})).toThrow('ordinal');expect(()=>new WetClockCursor(records,{dropped:1,errors:0})).toThrow('Incomplete');expect(()=>new WetClockCursor(records,{dropped:0,errors:1})).toThrow('Incomplete')
})
