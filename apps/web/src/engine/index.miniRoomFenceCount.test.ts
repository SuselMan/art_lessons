import {writeFileSync} from 'node:fs'
import {it,expect,vi} from 'vitest'
import {createTestEngine,dab} from './testing/engineTestUtils'
import {RibbonStrokeScratch} from './src/buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from './src/dabs/ribbonProfile'
it('counts source-generator fences for identical dabs without measuring GPU time',async()=>{
 const results=[]
 for(const asyncFinish of [false,true]){
  const preset='normal:95:34:PB29:round:wc@front8-detail-flow-v4'
  const {engine}=createTestEngine({asyncFinish,watercolorModel:'front8-detail-flow-v4',paper:'flat',pageWidth:64,pageHeight:64},{width:64,height:64})
  await engine.paperReady();engine['gl'].colorMask=()=>{};engine.initLayer('L');engine.setActiveLayer('L');engine['_minmaxExt']={MAX_EXT:0x8008}
  const scratch=new RibbonStrokeScratch(engine['_ribbonScratchPool'],true,true),target=engine['_layers'].get('L')!,profile=ribbonProfileFor('watercolor',preset)
  const fifo=engine['_wcCanonical'];fifo.workScheduler=null;fifo['ctx'].schedule=()=>1;fifo['ctx'].unschedule=()=>{};engine['_sliceLimits'].budgetMs=0
  const finish=vi.spyOn(engine['gl'],'finish'),bands=vi.spyOn(engine['_ribbonPainter']['ctx'],'drawRibbonBands')
  engine['_ribbonStrokeScratch']=scratch
  try{
   const dabs=Array.from({length:10},(_,i)=>dab(12+i*3,30,{size:12,opacity:1,t:i*10}))
   const work=engine['_ribbonStrokeWork'](target,dabs,engine['_resolvePreset']('watercolor',preset),preset,profile,[.1,.3,.8],scratch,undefined,undefined,[0,0],true,0)
   let immediate=0;while(!work.next().done)immediate++
   const before=finish.mock.calls.length;let advances=0
   while(fifo.queuedRequestCount&&advances<1000){fifo['advance']();advances++}
   expect(engine['_wcAsyncError']).toBeNull();expect(fifo.queuedRequestCount).toBe(0)
   results.push({asyncFinish,immediate,advances,sourceFences:finish.mock.calls.length-before,bands:bands.mock.calls.length})
  }finally{finish.mockRestore();bands.mockRestore();engine['_ribbonStrokeScratch']=null;scratch.destroy();engine.destroy()}
 }
 writeFileSync('docs/qa/runs/800-mini-room-cost-20261017/source-fence-counts.json',JSON.stringify({kind:'CPU MockGL counts; not GPU timing',results},null,2)+'\n')
 expect(results[0].sourceFences).toBe(0);expect(results[1].sourceFences).toBeGreaterThan(0)
 expect(results[0].bands).toBe(results[1].bands)
})
