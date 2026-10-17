import {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import {it,expect,vi} from 'vitest'
import {createTestEngine,dab,simulateStrokeEnd} from './testing/engineTestUtils'
import {RibbonScratchPool} from './src/buffers/RibbonScratchPool'
import {BufferResidency} from './src/buffers/BufferResidency'
import {AccumulationBuffer} from './src/buffers/AccumulationBuffer'
import {ribbonProfileFor} from './src/dabs/ribbonProfile'
const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
it.each(['chunk','up','cancel'] as const)('%s boundary cannot retire a managed film while deferred material is suspended',async boundary=>{
 const {engine}=createTestEngine({asyncFinish:true,watercolorModel:'m70-r2-v1',paper:'flat',pageWidth:64,pageHeight:64},{width:64,height:64});await engine.paperReady()
 const gl=engine['gl'];gl.colorMask=()=>{}
 const cache=new BufferResidency(gl,224*1024*1024),pool=new RibbonScratchPool(gl,(w,h)=>new AccumulationBuffer(gl,w,h,'nearest',cache),{discardIdleContents:true})
 engine['_ribbonScratchPool']=pool;engine.initLayer('L');engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil(preset);engine.setSize(16)
 const controller=engine['_puddleFor'](),target=engine['_layers'].get('L')!,profile=ribbonProfileFor('watercolor',preset),source=controller.source(target,'held',profile,Date.now()),scratch=source.scratch
 if(!(controller instanceof PuddleRoomController))throw Error('Small-page ownership fixture required')
 engine['_ribbonStrokeScratch']=scratch;engine['_strokeLayerId']='L';engine['_strokeId']='held';engine['_wash']={id:'held',layerId:'L',signature:'test',endedAt:Infinity,scratch};engine['_washId']='held'
 const fifo=engine['_wcCanonical'];fifo.workScheduler=null;fifo['ctx'].schedule=()=>1;fifo['ctx'].unschedule=()=>{};engine['_sliceLimits'].budgetMs=0
 engine['_minmaxExt']={MAX_EXT:0x8008}
 const bands=vi.spyOn(engine['_ribbonPainter']['ctx'],'drawRibbonBands')
 try{
  const dabs=Array.from({length:10},(_,i)=>dab(12+i*3,30,{size:12,opacity:1,t:i*10})),work=engine['_ribbonStrokeWork'](target,dabs,engine['_resolvePreset']('watercolor',preset),preset,profile,[.1,.3,.8],scratch,undefined,undefined,[0,0],true,1)
  while(!work.next().done){}
  engine['_strokeDabs']=dabs;engine['_strokePreset']=preset;engine['_strokeTool']='watercolor'
  for(let i=0;i<1000&&!bands.mock.calls.some(call=>call[3]==='ink-max');i++)fifo['advance']()
  expect(engine['_wcAsyncError']).toBeNull();expect(bands.mock.calls.some(call=>call[3]==='ink-max')).toBe(true);expect(fifo.queuedRequestCount).toBeGreaterThan(0);expect(engine['_strokeLayerId']).toBe('L')
  const destination=bands.mock.calls.find(call=>call[3]==='ink-max')![0],destroy=vi.spyOn(destination,'destroy')
  const finish=vi.spyOn(controller,'finish'),oldGesture=scratch.gesture
  if(boundary==='up')simulateStrokeEnd(engine,42,30);else engine['_flushStrokeChunk']();pool.trimFree()
  const oldContext=scratch.captureFinishMetadata().finish!
  const retiredBeforeResume=destroy.mock.calls.length
  if(boundary==='cancel'){
   fifo.cancel(false);expect(engine['_wcAsyncOwners'].size).toBe(0);expect(finish).not.toHaveBeenCalled()
  }else{
   if(scratch.gesture===oldGesture)scratch.newFilm()
   // New logical input must not replace this queued finish's captured context.
   Object.assign(scratch.finishContext!,{color:[.9,.1,.2],bounds:{minX:0,minY:0,maxX:90,maxY:90},profile:{...profile,materialModel:'front8-detail-flow-v4'}})
   scratch.diffusePending=true
   for(let i=0;i<3000&&fifo.queuedRequestCount;i++)fifo['advance']()
   expect(finish).toHaveBeenCalledOnce();expect(finish.mock.calls[0][1]).toMatchObject({gesture:oldGesture,finish:{color:oldContext.color,bounds:oldContext.bounds,profile:{materialModel:'m70-r2-v1'}}})
   expect(controller['layers'].get(target)?.context).toMatchObject({color:oldContext.color,bounds:oldContext.bounds});expect(scratch.diffusePending).toBe(true)
  }
  expect(engine['_wcAsyncError']).toBeNull();expect(retiredBeforeResume).toBe(0);expect(fifo.queuedRequestCount).toBe(0)
 }finally{bands.mockRestore();engine.destroy();expect(cache.bufferCount).toBe(0);cache.dispose()}
})

it('last async release preserves the Puddle canonical scratch until its owning controller closes',async()=>{
 const {engine}=createTestEngine({asyncFinish:true,watercolorModel:'m70-r2-v1',pageWidth:64,pageHeight:64},{width:64,height:64});await engine.paperReady();engine['gl'].colorMask=()=>{};engine.initLayer('L');engine.setActiveLayer('L')
 const controller=engine['_puddleFor'](),target=engine['_layers'].get('L')!,source=controller.source(target,'owner',ribbonProfileFor('watercolor',preset),Date.now()),scratch=source.scratch,tile=target.resolveForPaint({minX:0,minY:0,maxX:16,maxY:16})[0]
 scratch.getOrCreate(tile.buffer);const destroy=vi.spyOn(scratch,'destroy')
 try{engine['_holdAsyncScratch'](scratch);engine['_wash']=null;engine['_ribbonStrokeScratch']=null;engine['_releaseAsyncScratch'](scratch,false);expect(destroy).not.toHaveBeenCalled();expect(engine['_wcAsyncOwners'].size).toBe(0);expect(controller.owns(scratch)).toBe(true);controller.destroy();expect(destroy).toHaveBeenCalledOnce()}
 finally{engine.destroy()}
})
