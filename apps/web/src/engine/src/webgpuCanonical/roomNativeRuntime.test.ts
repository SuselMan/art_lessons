import {expect,it,vi} from 'vitest'
import {RoomNativeRuntime} from './roomNativeRuntime'
it('retiring an unused stale initializer does not cancel another native generation in the shared FIFO',async()=>{
 const cancel=vi.fn(),destroy=vi.fn()
 const runtime=Reflect.construct(RoomNativeRuntime,[{destroy},{fifo:{cancel},changed:vi.fn()}]) as RoomNativeRuntime
 await runtime.retire('unmount')
 expect(destroy).toHaveBeenCalledOnce();expect(cancel).not.toHaveBeenCalled()
})
it('boundary retirement releases the old owner without cancelling later queued source recipes',()=>{
 const cancel=vi.fn(),retire=vi.fn(async()=>{})
 const runtime=Reflect.construct(RoomNativeRuntime,[{}, {fifo:{cancel},changed:vi.fn()}]) as RoomNativeRuntime
 ;(runtime as unknown as {owner:unknown}).owner={retire}
 runtime.invalidateAtBoundary('clear')
 expect(retire).toHaveBeenCalledWith('clear',false);expect(cancel).not.toHaveBeenCalled()
})
it('foreign-water merge checks the captured recipient and actual layer target before material writes',()=>{
 const recipient={},layer={},anotherLayer={},merge=vi.fn()
 const runtime=Reflect.construct(RoomNativeRuntime,[{}, {fifo:{},changed:vi.fn()}]) as RoomNativeRuntime
 const state=runtime as unknown as {scratch:unknown;targetLayer:unknown;owner:unknown;foreignPrepared:WeakMap<object,Set<string>>;central:unknown}
 state.scratch=recipient;state.targetLayer=layer;state.owner={importForeign:merge};state.foreignPrepared.set(recipient,new Set(['water']))
 state.central={enqueueSource:(emit:()=>void)=>emit()}
 expect(()=>runtime.importForeign(recipient as never,anotherLayer as never,'water')).toThrow('recipient layer/generation mismatch')
 expect(merge).not.toHaveBeenCalled()
 state.foreignPrepared.set(recipient,new Set(['water']))
 runtime.importForeign(recipient as never,layer as never,'water');expect(merge).toHaveBeenCalledWith('water')
 runtime.importForeign(recipient as never,anotherLayer as never,'wholly-off-tile');expect(merge).toHaveBeenCalledTimes(1)
 runtime.importForeign(recipient as never,anotherLayer as never,'water');expect(merge).toHaveBeenCalledTimes(1) // Reused recipient has no fresh auxiliary proof.
})
