import {describe,it,expect,vi} from 'vitest'
import {withTransientGpuBuffers} from './transientBuffers'
describe('native transient allocation ownership',()=>{
 it('releases all retained allocations once when a later encode operation fails',()=>{
  const first={destroy:vi.fn()} as unknown as GPUBuffer
  const second={destroy:vi.fn()} as unknown as GPUBuffer
  const failure=new Error('bind group validation')
  expect(()=>withTransientGpuBuffers(retain=>{retain(first);retain(first);retain(second);throw failure})).toThrow(failure)
  expect(first.destroy).toHaveBeenCalledTimes(1)
  expect(second.destroy).toHaveBeenCalledTimes(1)
 })
 it('transfers successful allocations without destroying before submission',()=>{
  const buffer={destroy:vi.fn()} as unknown as GPUBuffer
  expect(withTransientGpuBuffers(retain=>[retain(buffer)])).toEqual([buffer])
  expect(buffer.destroy).not.toHaveBeenCalled()
 })
})
