// #573 — the digital brush's bitmap tips. The masks are generated on every
// client, so the one property that matters above all is that every client
// generates the same bytes; the checksum below is what fails if an edit lets a
// device-dependent function in (see tipMasks.ts's file comment).
import { describe, expect, it } from 'vitest'

import { TIP_MASK_IDS, TIP_MASK_SIZE, tipMaskMips, tipMaskPixels } from './tipMasks'

function fnv(bytes: Uint8Array): number {
  let h = 0x811c9dc5
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0
  return h >>> 0
}

describe('tip masks', () => {
  it('are exactly zero along the border, which CLAMP_TO_EDGE sampling relies on', () => {
    const n = TIP_MASK_SIZE
    for (const id of TIP_MASK_IDS) {
      const px = tipMaskPixels(id)
      for (let i = 0; i < n; i++) {
        expect(px[i], `${id} top`).toBe(0)
        expect(px[(n - 1) * n + i], `${id} bottom`).toBe(0)
        expect(px[i * n], `${id} left`).toBe(0)
        expect(px[i * n + n - 1], `${id} right`).toBe(0)
      }
    }
  })

  it('actually draw something', () => {
    for (const id of TIP_MASK_IDS) {
      const px = tipMaskPixels(id)
      const inked = px.filter(v => v > 128).length
      expect(inked, id).toBeGreaterThan(200)
    }
  })

  it('build a full mip chain down to 1x1', () => {
    const levels = tipMaskMips('chalk')
    expect(levels).toHaveLength(Math.log2(TIP_MASK_SIZE) + 1)
    expect(levels[levels.length - 1]).toHaveLength(1)
  })

  it('come out byte-identical every time — pinned, so a portability regression fails here', () => {
    const sums = Object.fromEntries(TIP_MASK_IDS.map(id => [id, fnv(tipMaskPixels(id))]))
    expect(sums).toMatchInlineSnapshot(`
      {
        "bristle": 3810103785,
        "chalk": 2151330714,
        "grass": 3358002417,
        "leaf": 1919205637,
        "rough": 721962733,
        "speckle": 1727859149,
      }
    `)
  })
})
