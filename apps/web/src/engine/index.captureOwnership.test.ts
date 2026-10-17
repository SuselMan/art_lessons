import {it,expect,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,makeStroke,dab,paperReady} from './testing/engineTestUtils'
import {PagedPuddleRoomController} from './src/watercolor/puddle/PagedPuddleRoomController'
it('queues an actual operation reentered during capture BEFORE owner creation and retries after unwind exactly once',async()=>{
 const {engine}=createTestEngine({userId:'observer',paper:'flat',watercolorModel:'m70-r2-v1',pageWidth:1536,pageHeight:512},{width:64,height:64});await paperReady(engine);const e=engine as any;e.gl.colorMask=()=>{}
 try{
 engine.appendOperation(makeLayerAdd('peer','M'),'remote')
 const dabs=Array.from({length:3},(_,i)=>dab(20+i*2,25,{size:8,opacity:1,t:i*10}))
 engine.appendOperation({...makeStroke('peer','M',dabs),id:'capture',tool:'watercolor',preset:'normal:95:34:PB29:round:wc@m70-r2-v1',strokeId:'capture',washId:'capture'},'remote');e._completeSettle()
 const c=e._puddle as any;expect(c).toBeInstanceOf(PagedPuddleRoomController);cancelAnimationFrame(c.raf);c.raf=0
 const layer=c.layers.get(e._layers.get('M')),entry=[...layer.scratch._tiles.values()][0] as any
 expect(e._fieldPhaseOwner?.state.activeLeases??0).toBe(0);e._fieldPhaseOwner=null
 const op=makeLayerAdd('peer','queued-after-capture'),read=entry.original.readPixels.bind(entry.original);let reentered=0
 vi.spyOn(entry.original,'readPixels').mockImplementation((...args:unknown[])=>{
 if(!reentered++){
 expect(c.fieldWorkPending).toBe(true);expect(e._fieldPhaseOwner).toBeNull()
 engine.appendOperation(op,'remote');expect(e._opQueue).toHaveLength(1);expect(e._layers.has('queued-after-capture')).toBe(false)
 }
 return read(...args)
 })
 c.frame(performance.now()+1000)
 expect(c.fieldWorkPending).toBe(false);expect(e._opQueue).toHaveLength(1)
 e._flushOpQueue()
 expect(e._opQueue).toHaveLength(0);expect(e._layers.has('queued-after-capture')).toBe(true)
 expect(engine.getOperations().filter(op2=>op2.id===op.id)).toHaveLength(1)
 }finally{engine.destroy()}
})
