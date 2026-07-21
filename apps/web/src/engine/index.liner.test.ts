// Engine-level integration tests for the fineliner tool (#241, ADR 003):
// drives the real pointer pipeline (_onStart/_onMove/_onEnd) rather than
// appending pre-built dabs, so these exercise the actual code paths a live
// stroke uses — DabSystem's per-tool shaping (#240), the deposit-pressure
// floor, _bakeDabOpacity's liner branch, and the end-of-stroke taper — the
// same way index.ruler.test.ts verifies live snapping rather than just
// testing snapToRuler() in isolation.
import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import type { PencilEngine } from './index'
import { createTestEngine, makeLayerAdd, lastPaperDabUniform, paperReady, simulateStroke } from './testing/engineTestUtils'

async function setupLayer() {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 160, height: 160 })
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('user-a', 'L1'))
  engine.setActiveLayer('L1')
  return engine
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

// Six points, 25px apart — comfortably longer than DabSystem's default
// spacing (baseSize 24 * spacingFactor 0.22 ≈ 5px), so each test's stroke
// produces well more dabs than applyLinerEndTaper's own 4-dab window —
// dabs[0] is guaranteed to come from _onStart, untouched by the end taper.
const PATH_A = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 10 }))
const PATH_B = [10, 35, 60, 85, 110, 135].map(x => ({ x, y: 40 }))

describe('liner tool (#241, ADR 003)', () => {
  it('keeps dab width within a narrow ~±10% band across the full pressure range, unlike pencil', async () => {
    const engine = await setupLayer()

    engine.setTool('liner')
    simulateStroke(engine, PATH_A, { pressure: 0 })
    const linerLow = lastStroke(engine).dabs[0].size
    simulateStroke(engine, PATH_B, { pressure: 1 })
    const linerHigh = lastStroke(engine).dabs[0].size

    expect(linerLow).toBeGreaterThan(0)
    // ADR 003 §1: width = baseWidth * lerp(0.94, 1.08, pressureCurve) -> ratio ~1.15.
    expect(linerHigh / linerLow).toBeLessThan(1.2)

    engine.setTool('pencil')
    simulateStroke(engine, PATH_A.map(p => ({ x: p.x, y: p.y + 60 })), { pressure: 0 })
    const pencilLow = lastStroke(engine).dabs[0].size
    simulateStroke(engine, PATH_B.map(p => ({ x: p.x, y: p.y + 60 })), { pressure: 1 })
    const pencilHigh = lastStroke(engine).dabs[0].size

    // Pencil's own pre-existing curve (0.3 + 0.7*pressure) swings well over
    // 3x — confirms the liner profile is actually a different curve, not
    // coincidentally similar at these two sample points.
    expect(pencilHigh / pencilLow).toBeGreaterThan(3)
  })

  it('never tapers deposit to nothing at near-zero pressure (ADR §6: no pencil-style fade)', async () => {
    const engine = await setupLayer()
    engine.setTool('liner')
    simulateStroke(engine, PATH_A, { pressure: 0, speed: 1 })

    const stroke = lastStroke(engine)
    expect(stroke.dabs.length).toBeGreaterThan(0)
    for (const d of stroke.dabs) {
      // Deposit-gate floor from DabShapingProfile.depositPressure — DAB_FRAG
      // multiplies this directly into ink deposit, so it must never collapse
      // toward 0 even though the real reported pressure here is 0.
      expect(d.pressure).toBeGreaterThan(0.85)
      // preset.opacity(0.95) * userOpacity(1) * linerSpeedFlow(~1.08 at
      // speed 1... actually near the low-speed end) * linerTiltFlow(1) —
      // comfortably nonzero regardless of the exact speed curve value.
      expect(d.opacity).toBeGreaterThan(0.5)
    }
  })

  it('narrows only the last few dabs on a fast release, and leaves a slow release untouched', async () => {
    const engine = await setupLayer()
    engine.setTool('liner')

    simulateStroke(engine, PATH_A, { pressure: 1, speed: 3 })
    const fast = lastStroke(engine).dabs
    expect(fast.at(-1)!.size).toBeLessThan(fast[0].size)
    // ADR: "сужение на 5-15%" — bounded, not a taper to a sliver.
    expect(fast.at(-1)!.size / fast[0].size).toBeGreaterThan(0.8)

    simulateStroke(engine, PATH_B, { pressure: 1, speed: 0.2 })
    const slow = lastStroke(engine).dabs
    expect(slow.at(-1)!.size).toBeCloseTo(slow[0].size, 5)
  })

  it('records a liner stroke with the recorded tool tag', async () => {
    const engine = await setupLayer()
    engine.setTool('liner')
    simulateStroke(engine, PATH_A, { pressure: 0.6 })
    expect(lastStroke(engine).tool).toBe('liner')
  })

  // #242: DAB_FRAG's liner branch (weak paper reaction + wick halo, no
  // computeGrain dither) is gated by u_inkMode — verifies the engine
  // actually flips it per-tool. MockGL never compiles/runs the GLSL itself
  // (compileShader always "succeeds", see mockGL.ts), so this only proves
  // the uniform wiring is correct, not that the shader math renders as
  // intended — that still needs a real WebGL context (browser QA).
  it('sets u_inkMode for a liner stroke and clears it for a pencil stroke', async () => {
    const engine = await setupLayer()

    engine.setTool('liner')
    simulateStroke(engine, PATH_A, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_inkMode')).toBe(1)

    engine.setTool('pencil')
    simulateStroke(engine, PATH_B, { pressure: 0.6 })
    expect(lastPaperDabUniform(engine, 'u_inkMode')).toBe(0)
  })
})
