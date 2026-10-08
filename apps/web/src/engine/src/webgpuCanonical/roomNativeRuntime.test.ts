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
