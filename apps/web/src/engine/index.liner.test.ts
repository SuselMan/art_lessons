// Engine-level integration tests for the fineliner tool (#241, ADR 003):
// drives the real pointer pipeline (_onStart/_onMove/_onEnd) rather than
// appending pre-built dabs, so these exercise the actual code paths a live
// stroke uses — DabSystem's per-tool shaping (#240), the deposit-pressure
// floor, _bakeDabOpacity's liner branch, and the end-of-stroke taper — the
// same way index.ruler.test.ts verifies live snapping rather than just
// testing snapToRuler() in isolation.
import { describe, expect, it, vi } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import type { PencilEngine } from './index'
import {
  createTestEngine, makeLayerAdd, lastPaperDabUniform, paperReady, simulateStroke,
  simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd, inProgressStrokeDabs,
} from './testing/engineTestUtils'

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
      // #245: the deposit-pressure floor (ADR §6) now lives entirely in
      // DAB_FRAG's liner branch, computed from the real per-fragment
      // pressure — MockGL never runs that GLSL (see mockGL.ts's own
      // compileShader comment), so it isn't observable here. Dab.pressure
      // itself is the true, unfloored value for every tool (reverted from
      // an earlier JS-side remap — see dabShaping.ts's own comment).
      expect(d.pressure).toBeCloseTo(0)
      // preset.opacity(0.95) * userOpacity(1) * linerSpeedFlow(1.0 at
      // speed 1, the new formula's own reference point) * linerTiltFlow(1)
      // — comfortably nonzero regardless of the exact speed curve value.
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

  // #245: a stylus resting in place should keep depositing ink there — real
  // engine-level check (not just the pure dwellFlow()/DwellConfig unit
  // tests in linerPresets.test.ts) that the timer actually fires and paints
  // through the real _onStart/_paintDwellDab/_onEnd lifecycle. Fake timers
  // are required since _paintDwellDab is driven by a real setInterval keyed
  // off performance.now() — vitest's fake-timer clock replaces both
  // together, so advancing it advances what _paintDwellDab measures too.
  describe('dwell (#245, ADR 003 §3/§9): a resting stylus keeps pooling ink', () => {
    it('paints extra dabs at the same spot the longer the stylus rests, for liner', async () => {
      vi.useFakeTimers()
      try {
        const engine = await setupLayer()
        engine.setTool('liner')
        simulateStrokeStart(engine, 50, 50, { pressure: 1 })
        // No _onMove at all — DabSystem itself can't paint anything further
        // without real movement; only the dwell timer can.
        await vi.advanceTimersByTimeAsync(1000)
        simulateStrokeEnd(engine, 50, 50, { pressure: 1 })

        const stroke = lastStroke(engine)
        // 1 real dab from _onStart + several from the dwell timer (every
        // ~70ms past the ~150ms grace period, over 1000ms).
        expect(stroke.dabs.length).toBeGreaterThan(3)
        for (const d of stroke.dabs) {
          expect(d.x).toBeCloseTo(50)
          expect(d.y).toBeCloseTo(50)
        }
        // dabs[0] is the _onStart dab, opacity-baked from *speed* — a fresh
        // pointerdown reports speed 0 (pointerSample's own default, same as
        // a real touch-down with no prior sample to diff against), which
        // linerSpeedFlow already treats as "not moving" too, so it isn't a
        // useful baseline here (it can start near the same ceiling dwell
        // eventually reaches). Compare the *dwell timer's own* dabs instead
        // — dabs[1] is the first one past minDwellMs (least elapsed time),
        // dabs.at(-1) the last (most elapsed) — to isolate dwellFlow's own
        // ramp from the separate speed-based mechanism.
        expect(stroke.dabs.at(-1)!.opacity).toBeGreaterThan(stroke.dabs[1].opacity)
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not pool ink while genuinely idle for pencil — dwell is liner-only today', async () => {
      vi.useFakeTimers()
      try {
        const engine = await setupLayer()
        engine.setTool('pencil')
        simulateStrokeStart(engine, 50, 50, { pressure: 1 })
        await vi.advanceTimersByTimeAsync(1000)
        simulateStrokeEnd(engine, 50, 50, { pressure: 1 })

        // Only the initial _onStart dab — no dwell timer exists for pencil.
        expect(lastStroke(engine).dabs.length).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('stops pooling once the stroke ends — no leaked timer painting after _onEnd', async () => {
      vi.useFakeTimers()
      try {
        const engine = await setupLayer()
        engine.setTool('liner')
        simulateStrokeStart(engine, 50, 50, { pressure: 1 })
        await vi.advanceTimersByTimeAsync(300)
        simulateStrokeEnd(engine, 50, 50, { pressure: 1 })
        const countAtEnd = lastStroke(engine).dabs.length

        // Advancing further after the stroke ended must not append more
        // dabs to the already-recorded (and now closed) operation.
        await vi.advanceTimersByTimeAsync(2000)
        expect(lastStroke(engine).dabs.length).toBe(countAtEnd)
      } finally {
        vi.useRealTimers()
      }
    })

    it('resets the dwell clock on real movement — moving away and stopping again starts a fresh ramp', async () => {
      vi.useFakeTimers()
      try {
        const engine = await setupLayer()
        engine.setTool('liner')
        simulateStrokeStart(engine, 50, 50, { pressure: 1 })
        await vi.advanceTimersByTimeAsync(600) // let it ramp up substantially
        const highOpacityBeforeMove = inProgressStrokeDabs(engine).at(-1)!.opacity

        // Real movement well past stillThresholdPx resets the anchor. Reads
        // _strokeDabs live (never calling _onEnd) rather than through
        // lastStroke() — ending the stroke here would run DabSystem's own
        // endStroke()/applyLinerEndTaper on the real path just moved, whose
        // opacity comes from _onEnd's own speed param (a separate mechanism
        // from dwellFlow), confounding exactly what this test isolates.
        simulateStrokeMove(engine, 200, 200, { pressure: 1, speed: 5 })
        // minDwellMs (150) + intervalMs (70) margin: the timer's own tick
        // cadence started at _onStart, not at this reset, so the very next
        // tick or two after resetting the anchor can still land under
        // minDwellMs relative to the new anchor — this needs to cover at
        // least one full interval past minDwellMs to guarantee a repaint.
        await vi.advanceTimersByTimeAsync(250)
        const freshDwellOpacity = inProgressStrokeDabs(engine).at(-1)!.opacity

        expect(freshDwellOpacity).toBeLessThan(highOpacityBeforeMove)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
