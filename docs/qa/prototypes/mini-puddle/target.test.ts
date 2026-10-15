import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../../../apps/web/src/engine/testing/engineTestUtils'
import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { createPuddleTarget } from './target'

it('publishes paired full-resolution generations with fixed storage and bounded GPU draws', () => {
  const { engine, canvas } = createTestEngine({}, { width: 32, height: 32 })
  const gl = canvas.getContext('webgl')!
  const source = { p: new AccumulationBuffer(gl,32,32), c: new AccumulationBuffer(gl,32,32), coverage: new AccumulationBuffer(gl,32,32) }
  const allocation = vi.spyOn(gl, 'createTexture')
  const target = createPuddleTarget(gl,32,{ coarseSize:8, iterations:3 })
  const textures = allocation.mock.calls.length
  const draws = vi.spyOn(gl,'drawArrays')
  const read = vi.spyOn(gl,'readPixels')
  try {
    expect(target.dry()).toBe(false)
    target.reset(source,10)
    expect(target.dry()).toBe(false)
    const first = { ...target.buffers() }
    expect(first.p.width).toBe(32)
    draws.mockClear()
    for(let i=0;i<5;i++) {
      target.step(1)
      expect(draws.mock.calls.length).toBe(i+1)
      expect(target.buffers().p).toBe(first.p)
      expect(target.buffers().c).toBe(first.c)
      expect(target.state.iterations).toBe(0)
    }
    target.step(1)
    expect(target.state.iterations).toBe(1)
    expect(target.buffers().p).not.toBe(first.p)
    expect(target.buffers().c).not.toBe(first.c)
    target.cancel()
    draws.mockClear(); target.step(100)
    expect(draws).not.toHaveBeenCalled()
    target.reset(source,11)
    expect(target.state).toEqual({epoch:11,iterations:0,done:false})
    draws.mockClear(); target.step(100)
    expect(draws).toHaveBeenCalledTimes(18)
    expect(target.state).toEqual({epoch:11,iterations:3,done:true})
    expect(allocation.mock.calls.length).toBe(textures)
    expect(read).not.toHaveBeenCalled()
    const finished = { ...target.buffers() }
    draws.mockClear()
    expect(target.dry()).toBe(true)
    expect(draws).toHaveBeenCalledTimes(1)
    expect(target.buffers().p).toBe(finished.p)
    expect(target.buffers().c).toBe(finished.c)
    expect(target.buffers().coverage).not.toBe(finished.coverage)
    expect(allocation.mock.calls.length).toBe(textures)
    target.reset(source,12)
    expect(target.dry()).toBe(false)
    expect(target.buffers().p).not.toBe(source.p)
    expect(target.buffers().c).not.toBe(source.c)
  } finally {
    target.destroy(); target.destroy()
    Object.values(source).forEach(b=>b.destroy())
    allocation.mockRestore(); draws.mockRestore(); read.mockRestore(); engine.destroy()
  }
})
