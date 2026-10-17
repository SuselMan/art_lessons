import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,makeStroke,dab,paperReady} from './testing/engineTestUtils'
// Presentation only; the real NativePuddleTarget exclusive-owner assertion
// and material/controller/source/legacy settle paths are not mocked.
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
it.fails('a M70 RAF must not take the shared field from another layer legacy drawing continuation',async()=>{
 const {engine}=createTestEngine({userId:'observer',paper:'flat',watercolorModel:'m70-r2-v1',pageWidth:64,pageHeight:64},{width:64,height:64})
 await paperReady(engine)
 try{
  for(const id of ['M','L'])engine.appendOperation(makeLayerAdd('peer',id),'remote')
  const dabs=Array.from({length:20},(_,i)=>dab(10+i*1.7,25,{size:8,opacity:1,t:i*10}))
  engine.appendOperation({...makeStroke('peer','M',dabs),id:'m70',tool:'watercolor',preset:'normal:95:34:PB29:round:wc@m70-r2-v1',strokeId:'m70',washId:'m70:M'},'remote')
  const controller=engine['_puddle']!
  expect(controller.state.revisions.some(revision=>!revision.ready)).toBe(true)
  engine['_sliceLimits'].budgetMs=0;engine['_sliceLimits'].size=1
  engine.appendOperation({...makeStroke('peer','L',dabs),id:'legacy',tool:'watercolor',preset:'normal:95:34:PB29:round:wc@front8-detail-flow-v4',strokeId:'legacy',washId:'legacy'},'remote')
  expect(engine['_settle']).not.toBeNull()
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_strokeLayerId']).toBeNull()
  // Invoke the actual next M70 RAF callback, leaving its real ownership guard
  // enabled. Cancel its queued timer first to keep this deterministic/owned.
  cancelAnimationFrame(controller['raf']);controller['raf']=0
  expect(()=>controller['frame'](performance.now()+1000)).not.toThrow()
 }finally{engine.destroy()}
})
