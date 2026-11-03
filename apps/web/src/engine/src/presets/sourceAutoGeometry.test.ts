import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceAutoGeometry/geometry.native.json'
import mathNative from './fixtures/sourceAutoGeometry/math.native.json'
import { sourceAutoGeometry, type SourceAutoGeometryTip } from './sourceAutoGeometry'
const tip: SourceAutoGeometryTip = { kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1', diameter: 7, ratio: .5, spikes: 2, scale: 1, angle: 0 }
const shape = { scale: 1, ratio: 1, rotation: 0 }
const buffer = new ArrayBuffer(8), view = new DataView(buffer)
function bits(value: number): string { view.setFloat64(0, value, false); return view.getBigUint64(0, false).toString(16).padStart(16, '0') }
describe('sourceAutoGeometry isolated native profile', () => {
  it('matches all 42 original installed auto/Qt/Bionic complete geometry queries', () => {
    expect(native.cases).toHaveLength(42)
    for (const row of native.cases) {
      const actual = sourceAutoGeometry({ ...tip, diameter: row.diameter, ratio: row.generatorRatio }, row.shape, row.subpixelX, row.subpixelY)
      expect(actual, `${row.index}/${row.variant}`).toEqual({ initialSize: [row.initialWidth, row.initialHeight], brushSize: [row.brushWidth, row.brushHeight],
        characteristicSize: row.characteristicSize, hotSpot: row.hotSpot, maskSize: [row.maskWidth, row.maskHeight] })
    }
  })
  it('gates the sampled nontrivial trig inputs against independent original Bionic bits on this JS runtime', () => {
    expect(mathNative.trigCases).toHaveLength(42)
    for (const row of mathNative.trigCases) {
      expect(bits(row.argument)).toBe(row.argumentBits)
      expect(bits(Math.sin(row.argument)), `${row.index}/${row.variant} sin`).toBe(row.sinBits)
      expect(bits(Math.cos(row.argument)), `${row.index}/${row.variant} cos`).toBe(row.cosBits)
    }
  })
  it('retains raw generator dimensions separately from two-stage qint32 brush initialization', () => {
    expect(sourceAutoGeometry(tip, shape)).toEqual({ initialSize: [7, 3], brushSize: [7, 3], characteristicSize: [7, 3], hotSpot: [3.5, 1.5], maskSize: [7, 3] })
    expect(tip.ratio).toBe(.5)
    expect(sourceAutoGeometry({ ...tip, diameter: .2 }, shape).initialSize).toEqual([1, 1])
  })
  it('retains the fused opposite-corner term that changes continuous geometry at a quarter turn', () => {
    const result = sourceAutoGeometry({ ...tip, diameter: 40, ratio: 1 }, { scale: .1, ratio: 1, rotation: Math.PI / 2 }, .5, .5)
    expect(result.characteristicSize).toEqual([4, 4.000000000000001])
    expect(result.hotSpot).toEqual([2, 2.0000000000000004])
    expect(result.maskSize).toEqual([5, 5])
  })
  it('rejects unsupported shape/profile and invalid source subpixel fractions', () => {
    for (const bad of [{ kind: 'image' }, { profile: 'unknown' }, { spikes: 65 }, { diameter: NaN }, { diameter: 2147483648 }, { ratio: 0 }, { scale: -1 }]) {
      expect(() => sourceAutoGeometry({ ...tip, ...bad } as SourceAutoGeometryTip, shape)).toThrow(RangeError)
    }
    for (const sub of [-.25, 1, Infinity, NaN]) expect(() => sourceAutoGeometry(tip, shape, sub, 0)).toThrow(RangeError)
    expect(() => sourceAutoGeometry(tip, { ...shape, rotation: Infinity })).toThrow(RangeError)
  })
})
