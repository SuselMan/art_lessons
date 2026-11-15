import fs from'node:fs'
import path from'node:path'
import{beforeAll,describe,it,expect,vi}from'vitest'
import{strokeDabs,type BrushLibrary,type Operation}from'@grafetto/shared'
import{installBrushLibrary,installBrushPixels}from'../../brushLibrary'
import{createTestEngine,makeLayerAdd,paperReady,pointerSample}from'../../testing/engineTestUtils'

// Only real, admitted native195 data can enable this integration test. It must
// never manufacture timing on an older descriptor whose scope forbids it.
const location=process.env.NATIVE195_LIBRARY
const library=location?JSON.parse(fs.readFileSync(location,'utf8'))as BrushLibrary:undefined
beforeAll(()=>{if(!library||!location)return;installBrushLibrary(library);for(const asset of library.assets)installBrushPixels(asset.id,new Uint8Array(fs.readFileSync(path.join(path.dirname(location),asset.file))))})
describe.skipIf(!library)('canonical timed author from the actual native195 corpus',()=>{
 it('arms the existing clock after BEGIN and retires it at END without replacing the frozen source',async()=>{
  const row=library!.brushes.find(r=>r.descriptor.spray?.color.sourcePolicy&&r.descriptor.behavior?.timing)
  expect(row,'native corpus must contain a genuinely timed canonical Spray').toBeDefined()
  const operations:Operation[]=[];let seq=1
  const {engine}=createTestEngine({userId:'author',onLocalOperation:op=>{operations.push(op);queueMicrotask(()=>engine.confirmOperation(op.id,++seq))}},{width:96,height:64})
  try{
   await paperReady(engine);engine.appendOperation({...makeLayerAdd('author','ink'),seq:1},'remote');engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil(`brush:${row!.descriptor.id}@195`);engine.setSize(24)
   vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
   const sample=()=>pointerSample(32,32,{timeStamp:performance.now(),dispatchTime:performance.now(),sourceTwist:0,sourceTangentialPressure:.5,pressure:1})
   const binding=vi.spyOn(engine as unknown as { _gridBinding:(...args:unknown[])=>unknown },'_gridBinding').mockReturnValue({kind:'notReady',reason:'prefix',retryKey:'test-held-prefix'})
   engine['_onStart'](sample());const staged=engine['_gridAuthor']!;expect(staged.committed).toBe(false);expect(engine['_airbrushTimer']).toBeNull()
   await vi.advanceTimersByTimeAsync(80);const latest={...sample(),x:36,sourceTwist:90,pressure:.8};engine['_onMove'](latest);expect(engine['_airbrushTimer']).toBeNull();binding.mockRestore()
   engine['_tryGridAuthorStart'](staged);await vi.advanceTimersByTimeAsync(0);expect(engine['_authorProducer']?.input).toMatchObject(latest);expect(engine['_airbrushInput']).toMatchObject(latest)
   const owner=engine['_ribbonStrokeScratch']?.canonicalSource;expect(owner).toBeDefined();expect(engine['_airbrushTimer']).not.toBeNull()
   const count=()=>engine['_strokeDabs'].length+operations.reduce((n,op)=>n+(op.type==='stroke'?strokeDabs(op).length:0),0)
   const first=count();await vi.advanceTimersByTimeAsync(250)
   expect(engine['_authorInputError']).toBeUndefined();expect(count()).toBeGreaterThan(first);expect(engine['_ribbonStrokeScratch']?.canonicalSource).toBe(owner)
   const beforeEnd=count();engine['_onEnd'](sample());await vi.advanceTimersByTimeAsync(10);expect(engine['_authorInputError']).toBeUndefined();expect(engine['_strokeId']).toBeNull();expect(engine['_airbrushTimer']).toBeNull()
   const ended=count();expect(ended).toBe(beforeEnd);await vi.advanceTimersByTimeAsync(250);expect(count()).toBe(ended)
  }finally{engine.destroy();vi.useRealTimers()}
 })
 it('does not arm a stale source candidate after END or cancel before BEGIN becomes ready',async()=>{
  const row=library!.brushes.find(r=>r.descriptor.spray?.color.sourcePolicy&&r.descriptor.behavior?.timing);expect(row).toBeDefined()
  for(const ending of ['end','cancel']as const){const {engine}=createTestEngine({userId:'author'},{width:96,height:64});let binding:ReturnType<typeof vi.spyOn>|undefined
   try{await paperReady(engine);engine.appendOperation({...makeLayerAdd('author','ink'),seq:1},'remote');engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil(`brush:${row!.descriptor.id}@195`);engine.setSize(24);vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']})
    binding=vi.spyOn(engine as unknown as {_gridBinding:(...args:unknown[])=>unknown},'_gridBinding').mockReturnValue({kind:'notReady',reason:'prefix',retryKey:'test-held-prefix'})
    const sample=pointerSample(32,32,{timeStamp:performance.now(),dispatchTime:performance.now(),sourceTwist:0,sourceTangentialPressure:.5});engine['_onStart'](sample);const staged=engine['_gridAuthor']!;expect(staged.committed).toBe(false)
    if(ending==='end')engine['_onEnd'](sample);else engine['_cancelOwnedAuthor'](false)
    binding.mockRestore();binding=undefined;engine['_tryGridAuthorStart'](staged);await vi.advanceTimersByTimeAsync(250)
    expect(engine['_airbrushTimer']).toBeNull();expect(engine['_authorProducer']).toBeUndefined();expect(engine['_strokeId']).toBeNull();expect(engine['_authorInputError']).toBeUndefined()
   }finally{binding?.mockRestore();engine.destroy();vi.useRealTimers()}
  }
 })

})
