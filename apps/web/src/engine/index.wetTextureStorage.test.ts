import { expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import type { PaperWetness } from './src/paper/paperWetness'

it('retains wet overlay storage only for matching dimensions and overwrites the same bytes', () => {
  const { engine } = createTestEngine({}, { width: 256, height: 256 })
  const e = engine as unknown as {
    _updateWetTexture(now: number): void
    _wetTexAt: number
    _wetTexSize: [number, number]
    _paperWet: PaperWetness
  }
  const gl = engine.gl
  const image = vi.spyOn(gl, 'texImage2D')
  const sub = vi.spyOn(gl, 'texSubImage2D')
  const captured: Uint8Array[] = []
  image.mockImplementation((...args: unknown[]) => {
    if (args[8] instanceof Uint8Array) captured.push(args[8].slice())
  })
  sub.mockImplementation((...args: unknown[]) => {
    if (args[8] instanceof Uint8Array) captured.push(args[8].slice())
  })
  try {
    const now = performance.now() + 1000
    e._paperWet.deposit('L', 80, 80, 20, 1, now)
    e._wetTexAt = -Infinity
    e._updateWetTexture(now)
    expect(image).toHaveBeenCalledTimes(1)
    expect(sub).not.toHaveBeenCalled()
    const size = [...e._wetTexSize]
    e._wetTexAt = -Infinity
    e._updateWetTexture(now)
    expect(image).toHaveBeenCalledTimes(1)
    expect(sub).toHaveBeenCalledTimes(1)
    expect(captured[1]).toEqual(captured[0])
    e._paperWet.deposit('L', 180, 180, 20, 1, now)
    e._wetTexAt = -Infinity
    e._updateWetTexture(now)
    expect(e._wetTexSize).not.toEqual(size)
    expect(image).toHaveBeenCalledTimes(2)
    // Simulate the reset that accompanies forgetting the dead-context name.
    e._wetTexSize = [0, 0]
    e._wetTexAt = -Infinity
    e._updateWetTexture(now)
    expect(image).toHaveBeenCalledTimes(3)
  } finally { image.mockRestore(); sub.mockRestore(); engine.destroy() }
})
