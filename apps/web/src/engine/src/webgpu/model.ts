import type { Dab, StrokeOperation } from '@grafetto/shared'
import { watercolorPigmentLoad, watercolorPigmentRate, watercolorWaterLoad, watercolorWidth, watercolorPresetString } from '../presets/watercolorPresets'
import { pigmentAbsorption } from '../watercolor/pigmentOptics'

export const GPU_WORLD = { width: 1024, height: 768 } as const
export const GPU_GRID = { width: 512, height: 384 } as const
export interface GpuStroke { operation: StrokeOperation; water: number; pigment: number }
export interface InputPoint { x: number; y: number; pressure: number; t: number }
export interface BrushOptions { size: number; water: number; pigment: number; color: [number, number, number]; nib: 'round' | 'chisel' }
export function makeDab(point: InputPoint, options: BrushOptions): Dab {
  return { ...point, tiltX: 0, tiltY: 0, size: options.size * watercolorWidth(Math.max(point.pressure, 0.03), 'normal'), aspectRatio: options.nib === 'chisel' ? 2 : 1, angle: options.nib === 'chisel' ? -Math.PI / 4 : 0, opacity: 1 }
}
export function pocPreset(brush: BrushOptions) { return watercolorPresetString('normal', { water: brush.water, pigment: brush.pigment }, undefined, brush.nib) }

/** Same recorded elliptical footprint and production absorption / travel curves.
 * Dose normalisation and deposition are experimental, not a Q8-identical port. */
export function packGpuDabs(dabs: readonly Dab[], options: BrushOptions, travelled: number, previous: Dab | null) {
  const out = new Float32Array(dabs.length * 16)
  const absorption = pigmentAbsorption(options.color)
  let used = travelled
  let prev = previous
  for (let k = 0; k < dabs.length; k++) {
    const d = dabs[k]
    const dx = prev ? d.x - prev.x : 0, dy = prev ? d.y - prev.y : 0
    const length = Math.hypot(dx, dy), radius = Math.max(d.size / 2, 1)
    const travel = prev ? length / radius : 0.15
    used += travel
    const waterLoad = options.pigment > 0 ? watercolorWaterLoad(used) : 1
    const water = options.water * waterLoad
    const dose = options.pigment * watercolorPigmentLoad(used, options.water) * watercolorPigmentRate(options.water) * travel * 0.60 * d.opacity
    out.set([d.x / 2, d.y / 2, radius / 2, water, d.aspectRatio, d.angle, dose, d.pressure, ...absorption, 0, length > 0 ? dx / length : 0, length > 0 ? dy / length : 0, Math.min(travel * 0.8, 0.8), 0], k * 16)
    prev = d
  }
  return { data: out, travelled: used, previous: prev }
}
/** Integer fixed seed, CPU-only paper, stable across devices and replay. */
export function makePocPaper(width: number, height: number) {
  const field = new Float32Array(width * height)
  let state = 0x728680
  for (let i = 0; i < field.length; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    field[i] = 0.25 + (state >>> 0) / 4294967295 * 0.5
  }
  return field
}

/** Diagnostic reference fixture for the exact production diffusion algebra.
 * Wetness pressure adds the same directed term as the PoC shader. */
export function oracleFixture(width: number, height: number) {
  const cells = new Float32Array(width * height * 16)
  for (let y = 32; y < Math.min(48, height); y++) for (let x = 32; x < Math.min(48, width); x++) {
    const i = (y * width + x) * 16
    const mass = ((x * 7 + y * 11) % 19) / 19
    cells.set([mass * 0.4, mass * 1.5, mass * 0.7, mass, 0.02, 0.04, 0.01, 0.03, (x + y) % 5 ? 0.3 + (x % 3) * 0.2 : 0, 0, 0, 0, 0, 0, 0, 0], i)
  }
  return cells
}
