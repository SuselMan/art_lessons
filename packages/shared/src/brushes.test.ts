import { describe, expect, it } from 'vitest'
import { isBrushLibrary, type BrushLibrary } from './brushes.js'

function library(): BrushLibrary {
  const hash = 'a'.repeat(64)
  return {
    schemaVersion: 1, assets: [{ id: `asset:${hash}`, size: 2, file: `${hash}.bin` }], skipped: [],
    brushes: [{ name: 'Watercolour', source: 'abr', warnings: [], descriptor: {
      id: 'imported-' + 'a'.repeat(16), version: 1, model: 'stamp', category: 'wet',
      tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, angle: 0, rotation: 'path' },
      paperInteraction: 0.5, spacing: 0.1, flow: 0.6, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    } }],
  }
}

describe('brush library contract', () => {
  it('accepts empty metadata and an imported stamp descriptor', () => {
    expect(isBrushLibrary({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })).toBe(true)
    expect(isBrushLibrary(library())).toBe(true)
  })
  it('rejects dangling resources and duplicate identities', () => {
    const data = library()
    data.brushes[0].descriptor.tip.mask = `asset:${'b'.repeat(64)}`
    expect(isBrushLibrary(data)).toBe(false)
    const duplicate = library()
    duplicate.brushes.push(structuredClone(duplicate.brushes[0]))
    expect(isBrushLibrary(duplicate)).toBe(false)
    const assets = library()
    assets.assets.push(structuredClone(assets.assets[0]))
    expect(isBrushLibrary(assets)).toBe(false)
  })
  it('rejects unsafe paths and non-power-of-two or oversized textures', () => {
    for (const size of [0, 2.5, 3, 4096, Infinity, NaN]) {
      const data = library()
      data.assets[0].size = size
      expect(isBrushLibrary(data), `size ${size}`).toBe(false)
    }
    const data = library()
    data.assets[0].file = '../secret.bin'
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('validates every supplied mask reference even for round tips', () => {
    const data = library()
    data.brushes[0].descriptor.tip.kind = 'round'
    data.brushes[0].descriptor.tip.mask = `asset:${'b'.repeat(64)}`
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('rejects non-finite rendering values and non-monotonic pressure curves', () => {
    const data = library()
    data.brushes[0].descriptor.flow = NaN
    expect(isBrushLibrary(data)).toBe(false)
    data.brushes[0].descriptor.flow = 0.5
    data.brushes[0].descriptor.sizeByPressure = [[1, 1], [0, 0]]
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('rejects malformed optional dynamics and unsupported material models', () => {
    const data = library()
    data.brushes[0].descriptor.texture = { id: `asset:${'b'.repeat(64)}`, periodPx: 100, strength: 0.5 }
    expect(isBrushLibrary(data)).toBe(false)
    delete data.brushes[0].descriptor.texture
    data.brushes[0].descriptor.mixer = { load: 1, pickup: 0.5, strength: 1 }
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('bounds total decoded resource memory', () => {
    const data = library()
    data.assets = Array.from({ length: 65 }, (_, n) => {
      const hash = n.toString(16).padStart(64, '0')
      return { id: `asset:${hash}`, size: 2048, file: `${hash}.bin` }
    })
    expect(isBrushLibrary(data)).toBe(false)
  })
})

describe('Krita source rendering contracts', () => {
  it('retains size multipliers above two without allowing the same values for paint opacity', () => {
    const data = library()
    data.brushes[0].descriptor.sizeByPressure = [[0, 3.18], [1, 3.18]]
    expect(isBrushLibrary(data)).toBe(true)
    data.brushes[0].descriptor.opacityByPressure = [[0, 3.18], [1, 3.18]]
    expect(isBrushLibrary(data)).toBe(false)
  })

  it('validates every animation frame and requires the same storage dimensions', () => {
    const data = library()
    const second = `asset:${'b'.repeat(64)}` as const
    data.assets.push({ id: second, size: 2, file: `${second.slice(6)}.bin` })
    const tip = data.brushes[0].descriptor.tip
    tip.animation = { mode: 'incremental', frames: [data.assets[0].id, second] }
    expect(isBrushLibrary(data)).toBe(true)
    data.assets[1].size = 4
    expect(isBrushLibrary(data)).toBe(false)
    data.assets.pop()
    expect(isBrushLibrary(data)).toBe(false)
  })

  it('bounds mask crops and source defaults independently of rendering strength', () => {
    const data = library()
    data.brushes[0].sourceDefaults = { sizePx: 40, opacity: 0.6, flow: 0.4 }
    const tip = data.brushes[0].descriptor.tip
    tip.maskBounds = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
    expect(isBrushLibrary(data)).toBe(true)
    tip.maskBounds.width = 1
    expect(isBrushLibrary(data)).toBe(false)
    delete tip.maskBounds
    data.brushes[0].sourceDefaults.flow = 2
    expect(isBrushLibrary(data)).toBe(false)
  })
})
