import assert from 'node:assert/strict'
import { PresentationEpoch, presentationStep } from './presentation'
const state = new PresentationEpoch()
assert.equal(state.accept(1), true)
state.hasTarget = true
state.step(presentationStep(16, false).advance)
assert(state.progress > 0 && state.progress < 1)
const previous = state.progress
assert.equal(state.accept(0), false)
assert.equal(state.progress, previous)
assert.equal(state.accept(2), true)
assert.equal(state.progress, 0)
assert.equal(state.hasTarget, false)
state.hasTarget = true
state.step(0.5)
assert.equal(state.accept(2), true)
assert.equal(state.progress, 0.5)
assert.equal(state.hasTarget, true)
for (const dt of [-10, 0, 1, 16, 100, 500, Infinity, NaN]) {
  const wet = presentationStep(dt, false), dry = presentationStep(dt, true)
  assert(wet.advance >= 0 && wet.advance < 1)
  assert(wet.travel >= 0 && wet.travel < 1)
  assert(dry.advance >= wet.advance)
}
const half = presentationStep(8, false).advance, full = presentationStep(16, false).advance
assert(Math.abs(1 - (1 - half) ** 2 - full) < 1e-12)
assert.equal(state.accept(NaN), false)
console.log('presentation epoch and time-weight contracts pass')
