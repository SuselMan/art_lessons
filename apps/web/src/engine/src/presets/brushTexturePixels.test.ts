import { describe, expect, it } from 'vitest'
import { importedAssetPixels, installBrushPixels } from './importedBrushes'
import { brushTextureMips, brushTexturePixels } from './tipMasks'

describe('texture base pixels', () => {
  it('borrows the immutable imported plane and preserves historical mip bytes', () => {
    const id = `asset:${'b2'.repeat(32)}` as const
    const source = Uint8Array.from([0, 1, 2, 255, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    installBrushPixels(id, source)
    const base = brushTexturePixels(id), snapshot = base.slice()
    expect(base).toBe(importedAssetPixels(id))
    const levels = brushTextureMips(id)
    expect(levels[0]).toBe(base)
    expect(levels[1]).toEqual(Uint8Array.from([2, 67, 10, 12]))
    expect(levels[2]).toEqual(Uint8Array.from([23]))
    expect(base).toEqual(snapshot)
    expect(source).toEqual(snapshot)
  })
})
