import { expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import { RibbonScratchPool } from './src/buffers/RibbonScratchPool'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'

function setup() {
  const { engine } = createTestEngine()
  const gl = (engine as unknown as { gl: WebGLRenderingContext }).gl
  const pool = new RibbonScratchPool(gl)
  const tile = new AccumulationBuffer(gl, 32, 24)
  const scratch = new RibbonStrokeScratch(pool, true, true)
  return { engine, gl, pool, tile, scratch }
}

it('allocates running coverage only on demand and releases it after the old job lands', () => {
  const { engine, pool, tile, scratch } = setup()
  expect(scratch.runningCoverage(tile)).toBeUndefined()
  expect(pool.bytes.live).toBe(0)
  scratch.trackRunningCoverage = true
  const film = scratch.runningCoverage(tile)
  const live = pool.bytes.live
  expect(scratch.runningCoverage(tile)).toBe(film)
  expect(pool.bytes.live).toBe(live)
  scratch.releaseRunningCoverage()
  expect(pool.bytes.live).toBe(live - 32 * 24 * 4)
  expect(scratch.runningCoverage(tile)).toBeUndefined()
  scratch.destroy()
  expect(pool.bytes.live).toBe(0)
  pool.destroy(); tile.destroy(); engine.destroy()
})

it('does not drop the next film when releasing the previous gesture or capture an unresolved rebase', () => {
  const { engine, gl, pool, tile, scratch } = setup()
  scratch.gesture = 2
  scratch.trackRunningCoverage = true
  const film = scratch.runningCoverage(tile)
  scratch.releaseFilm(1)
  expect(scratch.peek(tile)?.coverageFilm).toBe(film)
  expect(scratch.snapshot(gl, () => ({ originX: 0, originY: 0 }))).toBeNull()
  expect(scratch.spill(() => ({ originX: 0, originY: 0 }))).toBeNull()
  scratch.releaseFilm(2)
  expect(scratch.peek(tile)?.coverageFilm).toBeUndefined()
  scratch.destroy(); pool.destroy(); tile.destroy(); engine.destroy()
})

it('forgets dead coverage without returning old-context handles to the pool', () => {
  const { engine, pool, tile, scratch } = setup()
  scratch.trackRunningCoverage = true
  scratch.runningCoverage(tile)
  const release = vi.spyOn(pool, 'release')
  scratch.forget()
  expect(release).not.toHaveBeenCalled()
  expect(scratch.trackRunningCoverage).toBe(false)
  expect([...scratch.tileEntries()]).toHaveLength(0)
  pool.forget(); tile.destroy(); engine.destroy()
})

it('owns the coverage base and continuation only until the pending rebase is released', () => {
  const { engine, pool, tile, scratch } = setup()
  const coverage = scratch.getOrCreate(tile).coverage
  const pixels = new Uint8Array(32 * 24 * 4).fill(83)
  coverage.restorePixels(pixels)
  scratch.trackRunningCoverage = true
  const base = scratch.runningCoverage(tile)!
  expect(base.readPixels()).toEqual(pixels)
  const draw = vi.fn()
  scratch.recordRunningCoverage(tile, draw)
  expect(draw).not.toHaveBeenCalled()
  expect(scratch.peek(tile)?.coverageCommands).toEqual([draw])
  scratch.releaseRunningCoverage()
  expect(scratch.peek(tile)?.coverageCommands).toBeUndefined()
  scratch.destroy(); pool.destroy(); tile.destroy(); engine.destroy()
})

it('forgets a pending continuation before settle cancellation can recycle dead handles', () => {
  const { engine, pool, tile, scratch } = setup()
  scratch.trackRunningCoverage = true
  scratch.runningCoverage(tile)
  scratch.recordRunningCoverage(tile, vi.fn())
  const release = vi.spyOn(pool, 'release')
  scratch.releaseRunningCoverage(true)
  scratch.releaseRunningCoverage()
  expect(release).not.toHaveBeenCalled()
  expect(scratch.peek(tile)?.coverageFilm).toBeUndefined()
  expect(scratch.peek(tile)?.coverageCommands).toBeUndefined()
  scratch.forget(); pool.forget(); tile.destroy(); engine.destroy()
})
