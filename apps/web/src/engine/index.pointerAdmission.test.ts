import {afterEach,expect,it,vi} from 'vitest'
vi.mock('nanoid',()=>({nanoid:()=> 'fixed-id-0'}))
import {createTestEngine,makeLayerAdd,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
import type {PencilEngine} from './index'
import type {PointerData} from './src/input/PointerInput'
const engines:PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0))e.destroy()})
async function setup(admitted:boolean){const {engine:e}=createTestEngine({userId:'actor',diagnosticPointerAdmission:admitted},{width:64,height:64});engines.push(e);for(const id of ['L1','L2'])e.appendOperation(makeLayerAdd('actor',id));e.setCompositeOrder([{id:'L1',opacity:1},{id:'L2',opacity:1}]);e.setActiveLayer('L1');e.setTool('pencil');e.setSize(8);await paperReady(e);return e}
const sample=(x:number,t:number):PointerData=>({x,y:20,pressure:.7,tiltX:8,tiltY:-4,speed:.3,timeStamp:t,pointerType:'pen'})
it('actual Engine synchronous original vs admitted replay preserves packed pencil geometry/pressure/IDs after tool and layer change',async()=>{
 const baseline=await setup(false),candidate=await setup(true),samples=[sample(8,100),sample(16,112),sample(24,124)]
 simulateStrokeStart(baseline,8,20,samples[0]);simulateStrokeMove(baseline,16,20,samples[1]);simulateStrokeEnd(baseline,24,20,samples[2])
 const packet=candidate.diagnosticCapturePointerAdmission('fixed-id-0');candidate.setTool('eraser');candidate.setActiveLayer('L2');candidate.setSize(30)
 for(const [i,kind] of ['start','move','end'].entries())candidate.diagnosticDispatchPointerAdmission(packet,kind as 'start'|'move'|'end',samples[i],1000+i)
 const strokes=(e:PencilEngine)=>e.getOperations().filter(op=>op.type==='stroke')
 const original=strokes(baseline)[0],replayed=strokes(candidate)[0];expect(replayed).toMatchObject({id:original.id,strokeId:original.strokeId,layerId:original.layerId,tool:original.tool,preset:original.preset,color:original.color,dabsPacked:original.dabsPacked,userId:original.userId,seq:original.seq});expect(replayed.timestamp).toBe(1002);expect(original.timestamp).toBeGreaterThan(1002);expect(strokes(candidate)).toHaveLength(1);expect(candidate['_activeId']).toBe('L2');expect(candidate['_opts'].tool).toBe('eraser');expect(candidate['_opts'].size).toBe(30)
})
it('actual Engine refuses unsupported watercolor wet-state capture, OFF, destroyed and changed journal',async()=>{
 const off=await setup(false);expect(()=>off.diagnosticCapturePointerAdmission('id')).toThrow('unsupported')
 const e=await setup(true);e.setTool('watercolor');expect(()=>e.diagnosticCapturePointerAdmission('id')).toThrow('unsupported');e.setTool('pencil');const packet=e.diagnosticCapturePointerAdmission('id');e.appendOperation(makeLayerAdd('actor','L3'));expect(()=>e.diagnosticDispatchPointerAdmission(packet,'start',sample(8,100),1000)).toThrow('stale');const fresh=e.diagnosticCapturePointerAdmission('id');e.destroy();expect(()=>e.diagnosticDispatchPointerAdmission(fresh,'start',sample(8,100),1000)).toThrow('stale')
})
it('actual handler exception restores captured tool/layer context in finally',async()=>{
 const e=await setup(true),packet=e.diagnosticCapturePointerAdmission('id');e.setTool('eraser');e.setActiveLayer('L2');const error=Error('paint failure');vi.spyOn(e as unknown as {_paintStrokeDabs():void},'_paintStrokeDabs').mockImplementation(()=>{throw error});expect(()=>e.diagnosticDispatchPointerAdmission(packet,'start',sample(8,100),1000)).toThrow(error);expect(e['_opts'].tool).toBe('eraser');expect(e['_activeId']).toBe('L2');expect(e['_admittedPointerStrokeId']).toBeNull()
})
it('actual Engine retained replay runs after owner and before actual Undo/Dry using existing FIFO',async()=>{
 const {WatercolorCanonicalFIFO}=await import('./src/watercolor/WatercolorCanonicalFIFO');const {retainPointerAdmission}=await import('../../../../docs/qa/harness/728-gl-timing/RetainedPointerAdmission')
 const e=await setup(true),packet=e.diagnosticCapturePointerAdmission('fixed-id-0');let handle=0;const frames=new Map<number,()=>void>(),order:string[]=[];const queue=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:id=>{frames.delete(id)},changed:()=>{},failed:error=>{throw error}})
 queue.enqueue({execute:function*(){yield 0;order.push('owner')},cancel:()=>{}})
 const replay=(kind:'start'|'move'|'end',s:PointerData)=>{e.diagnosticDispatchPointerAdmission(packet,kind,s,1000+s.timeStamp);if(kind==='end'){expect(e.getOperations().some(op=>op.type==='stroke'&&op.layerId==='L1')).toBe(true);order.push('source')}}
 const a=retainPointerAdmission(queue,{strokeId:'fixed-id-0',layerId:'L1',generation:1,opts:{tool:'pencil'},wet:{}},sample(8,100),{valid:()=>!e['_destroyed'],scope:(_,run)=>run(),start:s=>replay('start',s),move:s=>replay('move',s),end:s=>replay('end',s)})
 a.move(sample(16,112));a.end(sample(24,124));e.setTool('eraser');e.setActiveLayer('L2')
 queue.enqueue({execute:function*(){expect(e.undo()).not.toBeNull();order.push('Undo')},cancel:()=>{}});queue.enqueue({execute:function*(){e.watercolorDryAll();order.push('Dry')},cancel:()=>{}})
 expect(e.getOperations().some(op=>op.type==='stroke')).toBe(false);let limit=20;while(frames.size&&limit--){const [id,cb]=frames.entries().next().value!;frames.delete(id);cb()}expect(limit).toBeGreaterThan(0);expect(order).toEqual(['owner','source','Undo','Dry']);expect(a.result.status).toBe('dispatched');expect(e['_activeId']).toBe('L2');expect(e['_opts'].tool).toBe('eraser')
})
it('actual source chunk advances only its own captured journal revision; foreign callback revision remains stale',async()=>{
 for(const foreign of [false,true]){
  const e=await setup(true),packet=e.diagnosticCapturePointerAdmission('fixed-id-0')
  const flush=vi.spyOn(e as unknown as {_flushStrokeChunk():void},'_flushStrokeChunk')
  // Exercise the same source chunk branch without a huge CPU/GPU fixture.
  vi.spyOn(e as unknown as {_chunkSpanExceeded():boolean},'_chunkSpanExceeded').mockReturnValue(true)
  if(foreign){let injected=false;e['_onLocalOperation']=()=>{if(!injected){injected=true;e.appendOperation(makeLayerAdd('peer','foreign'))}}}
  e.diagnosticDispatchPointerAdmission(packet,'start',sample(8,100),1000)
  expect(flush).toHaveBeenCalled();expect(e.getOperations().some(op=>op.type==='stroke')).toBe(true)
  if(foreign)expect(()=>e.diagnosticDispatchPointerAdmission(packet,'move',sample(16,112),1012)).toThrow('stale')
  else {e.diagnosticDispatchPointerAdmission(packet,'move',sample(16,112),1012);e.diagnosticDispatchPointerAdmission(packet,'end',sample(24,124),1024);expect(e['_strokeLayerId']).toBeNull()}
 }
})
