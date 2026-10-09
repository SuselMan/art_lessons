import {expect,it,vi} from 'vitest'
import {createTestEngine} from '../../testing/engineTestUtils'
import {captureOwnedReadsetStructure,sameOwnedReadsetStructure,ownedReadsetWriteBlocked} from '../../../../../../docs/qa/harness/728-gl-timing/OwnedReadsetPassport'
import {enqueueOwnedLazyUp,enqueueAfterOwnedUp} from '../../../../../../docs/qa/harness/728-gl-timing/OwnedLazyUpTransaction'
import {WatercolorCanonicalFIFO} from './WatercolorCanonicalFIFO'
it('a real same-texture write escapes structural identity, proving absent content-version authority',()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64}),pool=engine['_ribbonScratchPool'],buffer=pool.acquire(64,64),passport=captureOwnedReadsetStructure([buffer]),write=vi.spyOn(engine['gl'],'clear')
 try{
  buffer.clear();expect(write).toHaveBeenCalled();expect(sameOwnedReadsetStructure(passport,[buffer])).toBe(true)
  // No invented revision: status/owner exclusion blocks despite identity match.
  expect(ownedReadsetWriteBlocked(passport,[buffer],'preparing',true)).toBe(true)
 }finally{write.mockRestore();pool.release(buffer);engine.destroy()}
})
it('real FIFO defers the actual source write until prior captured owner publishes, without dropping it',()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64}),pool=engine['_ribbonScratchPool'],buffer=pool.acquire(64,64),passport=captureOwnedReadsetStructure([buffer]),write=vi.spyOn(engine['gl'],'clear')
 let id=0;const frames=new Map<number,()=>void>(),queue=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++id,cb);return id},unschedule:h=>{frames.delete(h)},changed:()=>{},failed:()=>{throw Error('unexpected failure')}})
 try{
  const owner=enqueueOwnedLazyUp(queue,{generation:1,retain:()=>{},valid:()=>sameOwnedReadsetStructure(passport,[buffer]),capture:()=>{},prepare:function*(){yield 0},publish:()=>{},release:()=>{}})
  expect(ownedReadsetWriteBlocked(passport,[buffer],owner.status,queue.pending)).toBe(true)
  enqueueAfterOwnedUp(queue,()=>{expect(owner.status).toBe('published');buffer.clear()},()=>{throw Error('source unexpectedly dropped')})
  expect(write).not.toHaveBeenCalled();while(frames.size){const [h,cb]=frames.entries().next().value!;frames.delete(h);cb()}
  expect(write).toHaveBeenCalledOnce();expect(ownedReadsetWriteBlocked(passport,[buffer],owner.status,queue.pending)).toBe(false)
  for(const status of ['cancelled','failed'] as const)expect(ownedReadsetWriteBlocked(passport,[buffer],status,false)).toBe(true)
 }finally{queue.cancel(false);write.mockRestore();pool.release(buffer);engine.destroy()}
})
it('rejects changed readset identity even after publication',()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64}),pool=engine['_ribbonScratchPool'],a=pool.acquire(64,64),b=pool.acquire(64,64)
 try{expect(ownedReadsetWriteBlocked(captureOwnedReadsetStructure([a]),[b],'published',false)).toBe(true)}finally{pool.release(a);pool.release(b);engine.destroy()}
})
