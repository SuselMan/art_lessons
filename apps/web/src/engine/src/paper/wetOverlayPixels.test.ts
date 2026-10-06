import { describe, expect, it } from 'vitest'

import { wetOverlayPixels, wetOverlayWorkspace } from './wetOverlayPixels'

// Independent full-neighbourhood convolution; production uses separable max
// and a specialised interior path. Include edges with nonzero input too.
function reference(cells: Float32Array, pools: Float32Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let wet = 0, pool = 0, body = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
      const i = yy * w + xx
      body = Math.max(body, cells[i])
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1)
        wet += cells[i] * weight
        pool += pools[i] * weight
      }
    }
    const i = (y * w + x) * 4
    out[i] = out[i + 2] = Math.round(Math.min(wet / 16, 1) * 255)
    out[i + 1] = Math.round(Math.min(pool / 16, 1) * 255)
    out[i + 3] = Math.round(Math.min(body, 1) * 255)
  }
  return out
}

describe('wet overlay pixels', () => {
  it('keeps zero padding rather than clamping the edge', () => {
    const actual = wetOverlayPixels(new Float32Array([0.5]), new Float32Array([0.25]), 1, 1, wetOverlayWorkspace(1))
    expect([...actual]).toEqual([32, 16, 32, 128])
  })

  it.each([[1, 7], [7, 1], [3, 3], [13, 11], [162, 162]])('matches a full convolution at %i×%i', (w, h) => {
    const cells = new Float32Array(w * h), pools = new Float32Array(w * h)
    let seed = 728
    for (let i = 0; i < cells.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      cells[i] = (seed % 1025) / 1024
      pools[i] = (seed % 513) / 1024
    }
    expect(wetOverlayPixels(cells, pools, w, h, wetOverlayWorkspace(w * h))).toEqual(reference(cells, pools, w, h))
  })

  it('overwrites reused workspace after drying and a different raster shape', () => {
    const workspace = wetOverlayWorkspace(143)
    const cells = new Float32Array(143).fill(0.75), pools = new Float32Array(143).fill(0.5)
    wetOverlayPixels(cells, pools, 13, 11, workspace)
    cells.fill(0); pools.fill(0)
    expect(wetOverlayPixels(cells, pools, 11, 13, workspace)).toEqual(new Uint8Array(143 * 4))
    cells[1] = 0.75; pools[142] = 0.5
    expect(wetOverlayPixels(cells, pools, 11, 13, workspace)).toEqual(reference(cells, pools, 11, 13))
  })
})
