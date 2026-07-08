// #123: batching dab draw calls via ANGLE_instanced_arrays.
//
// Ground truth for "did batching change any pixel" is the pre-#123
// per-dab-uniform loop (_paintDabsUniform in engine/index.ts, unchanged
// call-for-call from `git show dev:apps/web/src/engine/index.ts`'s old
// _paintDabs). MockGL's _rasterDab — the actual pixel math both paths
// ultimately call — is untouched by #123 (see testing/mockGL.ts's module
// docstring), so forcing an engine's cached `_instancedArraysExt` to null
// reproduces the exact pre-#123 code path: same GL call sequence, same
// shader math (DAB_VERT's per-dab uniforms are forwarded to the same
// varyings DAB_VERT_INSTANCED's per-instance attributes feed — a value
// held constant across a triangle's 3 vertices interpolates back to that
// exact constant, so the forwarding refactor is numerically a no-op).
//
// These tests paint the same overlapping, self-crossing stroke through both
// the batched (default) and fallback (forced) paths and require bit-exact
// pixels — not just "close", since nothing here should introduce any
// float-precision drift: it's the same values, same order, same blend.
import { describe, expect, it } from 'vitest'

import type { Dab } from '@art-lessons/shared'

import {
  createTestEngine, dab, expectPixelsEqual, makeLayerAdd, makeStroke, readLayerPixels,
} from './testing/engineTestUtils'

// Internals-only escape hatch (same spirit as engineTestUtils' `internals()`)
// to force the pre-#123 fallback path for one engine instance.
function forceUniformPath(engine: unknown): void {
  (engine as { _instancedArraysExt: unknown })._instancedArraysExt = null
}

/** A tight, self-overlapping spiral — dozens of dabs from a single stroke,
 *  each ring overlapping the previous one, with varying pressure/opacity/
 *  tilt/angle/aspect so every per-dab attribute the batched path carries
 *  (not just position) gets exercised, and dabs actually cross/overlap each
 *  other rather than just sitting side by side. */
function spiralDabs(cx: number, cy: number, turns: number, steps: number): Dab[] {
  const dabs: Dab[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * turns * Math.PI * 2
    const radius = 1 + t * 10
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    dabs.push(dab(x, y, {
      size: 5 + Math.sin(t * 11) * 2,
      pressure: 0.4 + 0.5 * Math.abs(Math.sin(t * 7)),
      opacity: 0.5 + 0.4 * Math.abs(Math.cos(t * 5)),
      angle: angle * 1.3,
      aspectRatio: 1 + 0.5 * Math.abs(Math.sin(t * 3)),
      tiltX: 20 * Math.sin(t * 9),
      tiltY: 15 * Math.cos(t * 6),
      t: i,
    }))
  }
  return dabs
}

describe('#123: batched (ANGLE_instanced_arrays) dab rendering matches the pre-batching per-dab-uniform path', () => {
  it('is bit-identical for a tight overlapping spiral stroke (pencil)', () => {
    const dabs = spiralDabs(20, 20, 3, 40)

    const batched = createTestEngine({ userId: 'user-a' }, { width: 40, height: 40 })
    batched.engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    batched.engine.appendOperation(makeStroke('user-a', 'L1', dabs))
    const batchedPixels = readLayerPixels(batched.engine, 'L1')!
    expect(batchedPixels.some(v => v > 0)).toBe(true) // sanity: actually painted something

    const uniform = createTestEngine({ userId: 'user-a' }, { width: 40, height: 40 })
    forceUniformPath(uniform.engine)
    uniform.engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    uniform.engine.appendOperation(makeStroke('user-a', 'L1', dabs))
    const uniformPixels = readLayerPixels(uniform.engine, 'L1')!

    expectPixelsEqual(batchedPixels, uniformPixels)
  })

  it('is bit-identical when an eraser stroke overlaps earlier ink — the case where sequential blend order genuinely matters', () => {
    const inkDabs = spiralDabs(20, 20, 3, 40)
    const eraseDabs = spiralDabs(20, 20, 2, 25).map(d => ({ ...d, x: d.x + 3, y: d.y + 3 }))

    const batched = createTestEngine({ userId: 'user-a' }, { width: 40, height: 40 })
    batched.engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    batched.engine.appendOperation(makeStroke('user-a', 'L1', inkDabs))
    batched.engine.appendOperation(makeStroke('user-a', 'L1', eraseDabs, { tool: 'eraser' }))
    const batchedPixels = readLayerPixels(batched.engine, 'L1')!

    const uniform = createTestEngine({ userId: 'user-a' }, { width: 40, height: 40 })
    forceUniformPath(uniform.engine)
    uniform.engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    uniform.engine.appendOperation(makeStroke('user-a', 'L1', inkDabs))
    uniform.engine.appendOperation(makeStroke('user-a', 'L1', eraseDabs, { tool: 'eraser' }))
    const uniformPixels = readLayerPixels(uniform.engine, 'L1')!

    expect(batchedPixels.some(v => v > 0)).toBe(true)
    expect(uniformPixels.some(v => v > 0)).toBe(true)
    expectPixelsEqual(batchedPixels, uniformPixels)
  })

  it('is bit-identical across several _paintDabs calls of growing size (simulating multiple move-events), exercising the scratch instance buffer\'s grow-and-reuse path', () => {
    const dabs = spiralDabs(15, 15, 4, 60)
    const segments = [dabs.slice(0, 5), dabs.slice(5, 30), dabs.slice(30)]

    const batched = createTestEngine({ userId: 'user-a' }, { width: 30, height: 30 })
    batched.engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    for (const seg of segments) batched.engine.appendOperation(makeStroke('user-a', 'L1', seg))
    const batchedPixels = readLayerPixels(batched.engine, 'L1')!

    const uniform = createTestEngine({ userId: 'user-a' }, { width: 30, height: 30 })
    forceUniformPath(uniform.engine)
    uniform.engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    for (const seg of segments) uniform.engine.appendOperation(makeStroke('user-a', 'L1', seg))
    const uniformPixels = readLayerPixels(uniform.engine, 'L1')!

    expectPixelsEqual(batchedPixels, uniformPixels)
  })
})
