/** Diagnostic protocol only: no production transport or operation-log change.
 * Run: npx tsx docs/reference/watercolor-water-stream-protocol.ts */
import assert from 'node:assert/strict'
import { watercolorWaterClock, watercolorWaterLoad } from '../../apps/web/src/engine/src/presets/watercolorPresets'

type Water = { cells: number[]; standing: number }
type Pigment = { cells: number[]; dose: number }
type Segment = { water: Water; pigment: Pigment }
type Scene = { fluid: Float64Array; pigment: Float64Array; observations: number[] }
const fresh = (): Scene => ({ fluid: new Float64Array(32), pigment: new Float64Array(32), observations: [] })
// Contact/pickup state belongs to the brush before delivery. This function
// never writes to it: newly delivered water cannot refill its own reservoir.
const waterPhase = (s: Scene, w: Water): void => {
  for (const cell of w.cells) s.fluid[cell] = Math.max(s.fluid[cell], w.standing)
}
const pigmentPhase = (s: Scene, p: Pigment): void => {
  // Available fluid is sampled AFTER this segment's delivery, independently
  // of its origin. A future transport operator receives this same field.
  s.observations.push(Math.max(...p.cells.map(cell => s.fluid[cell])))
  for (const cell of p.cells) s.pigment[cell] += p.dose / p.cells.length
}
const combined = (s: Scene, segment: Segment): void => {
  waterPhase(s, segment.water)
  pigmentPhase(s, segment.pigment)
}
const payloads: Segment[] = Array.from({ length: 12 }, (_, i) => ({
  water: { cells: [i, i + 1, i + 2], standing: watercolorWaterLoad(i) },
  pigment: { cells: [i, i + 1, i + 2], dose: .1 * Math.exp(-i / 20) },
}))
const direct = fresh(), explicit = fresh(), pure = fresh()
for (const segment of payloads) {
  combined(direct, segment)
  // Explicit input events occur per segment, not all water then all pigment.
  waterPhase(explicit, segment.water)
  pigmentPhase(explicit, segment.pigment)
  assert.deepEqual(direct, explicit)
  waterPhase(pure, segment.water)
}
assert.equal(pure.pigment.reduce((a, b) => a + b), 0)
assert.deepEqual(direct.fluid, pure.fluid)
// Existing coloured/pure-water stroke routes cannot supply matched water by
// changing only the preset. Coloured delivery advances the finite clock;
// bottomless clear-water delivery does not. Read the actual load functions.
let clock = 0
for (let i = 0; i < 200; i++) clock = watercolorWaterClock(clock, .1, 0)
const finite = watercolorWaterLoad(clock), bottomless = watercolorWaterLoad(0)
assert.ok(finite < bottomless)
console.log(JSON.stringify({ protocolInvariant: true, pureWaterPigment: 0,
  suppliedPigment: payloads.reduce((a, s) => a + s.pigment.dose, 0),
  storedPigment: direct.pigment.reduce((a, b) => a + b),
  postWaterSamples: direct.observations,
  existingWaterLoadAt20Radii: { coloured: finite, clearWater: bottomless },
  limitations: 'Prescribed payload, MAX wetness, additive pigment. No film MAX, brush dose calculation, paper advection, colour, GPU or live morphology.' }, null, 2))
