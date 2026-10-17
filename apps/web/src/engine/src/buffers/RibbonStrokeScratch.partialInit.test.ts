import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {RibbonStrokeScratch} from './RibbonStrokeScratch'

for(const nth of [1,2,3,4])it(`returns all pool leases when scratch allocation ${nth} fails and permits retry`,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const tile=new AccumulationBuffer(gl,3,3)
 const created=vi.spyOn(gl,'createTexture'),deleted=vi.spyOn(gl,'deleteTexture')
 let calls=0,fail=true
 const pool=new RibbonScratchPool(gl,(w,h,f)=>{
  if(++calls===nth && fail)throw Error('Residency budget exhausted')
  return new AccumulationBuffer(gl,w,h,f)
 })
 const scratch=new RibbonStrokeScratch(pool,true,true)
 expect(()=>scratch.getOrCreate(tile)).toThrow('Residency budget exhausted')
 expect(scratch.peek(tile)).toBeNull()
 expect(pool.bytes.live).toBe(0)
 pool.trimFree()
 expect(deleted).toHaveBeenCalledTimes(created.mock.calls.length)
 fail=false
 const entry=scratch.getOrCreate(tile)
 expect(entry.original.width).toBe(3)
 expect(entry.inkLoad).toBeTruthy();expect(entry.inkColor).toBeTruthy()
 expect(scratch.getOrCreate(tile)).toBe(entry)
 scratch.destroy();pool.trimFree()
 expect(pool.bytes.live).toBe(0)
 expect(deleted).toHaveBeenCalledTimes(created.mock.calls.length)
 tile.destroy()
})

it('returns a just-acquired original when its first copy fails',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const tile=new AccumulationBuffer(gl,3,3),pool=new RibbonScratchPool(gl)
 const scratch=new RibbonStrokeScratch(pool,true,true)
 vi.spyOn(tile,'copyTo').mockImplementationOnce(()=>{throw Error('copy budget')})
 expect(()=>scratch.getOrCreate(tile)).toThrow('copy budget')
 expect(pool.bytes.live).toBe(0);expect(scratch.peek(tile)).toBeNull()
 expect(scratch.getOrCreate(tile).inkColor).toBeTruthy()
 scratch.destroy();pool.trimFree();tile.destroy()
})
