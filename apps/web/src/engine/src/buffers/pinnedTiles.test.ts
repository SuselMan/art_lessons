import { describe, expect, it } from 'vitest'

import { packTilePixels, unpackTilePixels } from './pinnedTiles'

/** Round-trips a tile and returns the packed size, so a test can assert both
 *  that nothing changed and that something was saved. */
function roundTrip(pixels: Uint8Array): { back: Uint8Array; packedBytes: number } {
  const packed = packTilePixels(pixels)
  return { back: unpackTilePixels(packed, pixels.byteLength), packedBytes: packed.byteLength }
}

/** A tile with `count` opaque pixels starting at `at`, the rest transparent —
 *  the shape a stroke through a mostly-empty tile actually leaves. */
function sparseTile(pixelCount: number, at: number, count: number): Uint8Array {
  const px = new Uint8Array(pixelCount * 4)
  for (let i = at; i < at + count; i++) px.set([20, 30, 40, 255], i * 4)
  return px
}

describe('packTilePixels / unpackTilePixels (#467)', () => {
  it('round-trips a stroke through a mostly-empty tile, and shrinks it', () => {
    const pixels = sparseTile(4096, 1000, 40)
    const { back, packedBytes } = roundTrip(pixels)

    expect([...back]).toEqual([...pixels])
    expect(packedBytes).toBeLessThan(pixels.byteLength / 10)
  })

  it('round-trips a fully opaque tile, where there is nothing to save', () => {
    const pixels = new Uint8Array(256 * 4)
    for (let i = 0; i < 256; i++) pixels.set([i, 255 - i, 7, 255], i * 4)

    const { back } = roundTrip(pixels)

    expect([...back]).toEqual([...pixels])
  })

  it('round-trips an entirely blank tile down to almost nothing', () => {
    const pixels = new Uint8Array(4096 * 4)
    const { back, packedBytes } = roundTrip(pixels)

    expect([...back]).toEqual([...pixels])
    expect(packedBytes).toBeLessThan(32)
  })

  // The pathological input for any run encoder. It must stay correct and must
  // not grow the payload, which is what the raw fallback is for.
  it('never grows a tile, however badly it alternates', () => {
    const pixels = new Uint8Array(1024 * 4)
    for (let i = 0; i < 1024; i += 2) pixels.set([1, 2, 3, 4], i * 4)

    const { back, packedBytes } = roundTrip(pixels)

    expect([...back]).toEqual([...pixels])
    expect(packedBytes).toBeLessThanOrEqual(pixels.byteLength + 1)
  })

  // Lossless, not merely invisible: RGB under zero alpha is preserved, because
  // a rebuild's pixels can be republished and smudge samples colour off the
  // layer regardless of what the alpha says.
  it('keeps colour that sits under zero alpha', () => {
    const pixels = new Uint8Array(64 * 4)
    pixels.set([9, 8, 7, 0], 4 * 4)
    pixels.set([1, 1, 1, 255], 20 * 4)

    const { back } = roundTrip(pixels)

    expect([...back.subarray(16, 20)]).toEqual([9, 8, 7, 0])
    expect([...back]).toEqual([...pixels])
  })

  it('round-trips whatever a pseudo-random drawing throws at it', () => {
    // Deterministic: a failure has to be reproducible from the test alone.
    let seed = 12345
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let trial = 0; trial < 40; trial++) {
      const pixels = new Uint8Array(512 * 4)
      for (let i = 0; i < 512; i++) {
        if (rand() < 0.3) pixels.set([rand() * 255 | 0, rand() * 255 | 0, rand() * 255 | 0, rand() * 255 | 0], i * 4)
      }
      expect([...roundTrip(pixels).back]).toEqual([...pixels])
    }
  })
})
