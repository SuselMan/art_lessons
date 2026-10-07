import { describe, expect, it } from 'vitest'
import { makeDab, makePocPaper, packGpuDabs, pocPreset } from './model'
import type { BrushOptions } from './model'
import { watercolorMixFromPreset, watercolorNibFromPreset } from '../presets/watercolorPresets'
import { makeWetGrid, wetDiffuseStepMany } from '../watercolor/wetDiffusion'
const brush: BrushOptions = { size: 400, water: 1, pigment: 1, color: [0.5, 0.25, 0.8], nib: 'round' }
describe('WebGPU prototype input / mathematical bounds', () => {
  it('reuses recorded pressure geometry and is independent of input batching', () => {
    const dabs = Array.from({ length: 50 }, (_, k) => makeDab({ x: 100 + k * 7, y: 200 + Math.sin(k / 4) * 30, pressure: 0.8, t: k * 8 }, brush))
    const all = packGpuDabs(dabs, brush, 0, null)
    const a = packGpuDabs(dabs.slice(0, 19), brush, 0, null), b = packGpuDabs(dabs.slice(19), brush, a.travelled, a.previous)
    const joined = new Float32Array(all.data.length); joined.set(a.data); joined.set(b.data, a.data.length)
    expect(joined).toEqual(all.data)
    expect(b.travelled).toBe(all.travelled)
    expect(dabs[0].size).toBeLessThanOrEqual(400)
  })
  it('serializes the baseline preset with the production water/pigment order and nib', () => {
    const preset = pocPreset({ ...brush, water: 1, pigment: 0.13, nib: 'chisel' })
    expect(watercolorMixFromPreset(preset)).toEqual({ water: 1, pigment: 0.13 })
    expect(watercolorNibFromPreset(preset)).toBe('chisel')
  })
  it('separates clean water from pigment; pure water deposits no optical depth', () => {
    const d = makeDab({ x: 300, y: 300, pressure: 1, t: 0 }, brush)
    const p = packGpuDabs([d], { ...brush, pigment: 0 }, 0, null).data
    expect(p[3]).toBeGreaterThan(0)
    expect(p[6]).toBe(0)
    const dry = packGpuDabs([d], { ...brush, water: 0 }, 0, null).data
    expect(dry[3]).toBe(0)
    expect(dry[6]).toBeGreaterThan(0)
  })
  it('keeps chisel pose in the same Dab contract', () => {
    const d = makeDab({ x: 20, y: 40, pressure: 0.4, t: 8 }, { ...brush, nib: 'chisel' })
    expect(d.aspectRatio).toBe(2)
    expect(d.angle).toBe(-Math.PI / 4)
    expect(packGpuDabs([d], brush, 0, null).data[4]).toBe(2)
  })
  it('uses deterministic bounded paper and a positive donor budget', () => {
    const paper = makePocPaper(32, 32)
    expect(paper).toEqual(makePocPaper(32, 32))
    expect(Math.min(...paper)).toBeGreaterThanOrEqual(0.25)
    expect(Math.max(...paper)).toBeLessThanOrEqual(0.75)
    // gate*max(wa-wb,0)≤1/4 for wa,wb in[0,1]. Even all eight
    // directions at worst paper/flow bounds have total outgoing share<1.
    expect(8 * (0.09 + 0.03 * 0.5 + 0.018 * 0.82) + 8 * 0.015 * 0.25).toBeLessThan(1)
    expect(8 * (0.036 + 0.014 * 0.5)).toBeLessThan(1)
  })
  it('production reference conserves depth and mass, does not exchange across dry cells', () => {
    const grid = makeWetGrid(8, 8); grid.water.fill(0.7)
    grid.paperHeight.set(makePocPaper(8, 8)); grid.water[4] = 0
    const mass = new Float64Array(64), depth = new Float64Array(64)
    mass[20] = 1; depth[20] = 2; mass[4] = 1; depth[4] = 0.5
    const [outMass, outDepth] = wetDiffuseStepMany(grid, [mass, depth])
    expect(outMass.reduce((a, b) => a + b, 0)).toBeCloseTo(2, 12)
    expect(outDepth.reduce((a, b) => a + b, 0)).toBeCloseTo(2.5, 12)
    expect(outMass[4]).toBe(1)
    expect(Math.min(...outMass)).toBeGreaterThanOrEqual(0)
  })
})
