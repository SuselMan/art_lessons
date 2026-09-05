import { describe, expect, it } from 'vitest'

import { PointerInput, SPEED_SMOOTHING_TAU_MS, smoothSpeed, type PointerData } from './PointerInput'

// #532 — `PointerData.speed` is canvas content, not telemetry: it decides every
// liner/marker dab's ink flow and every graphite/smudge dab's, and the result
// is baked into the recorded operation. These tests pin the two properties
// that were missing when it was measured against `performance.now()` instead
// of the sample's own timestamp — see PointerInput's own Speed section for the
// measurement that found it (80% of real dabs pinned to the "very fast" clamp
// while the hand was hatching at 0.24-1.17 px/ms).
//
// All of them are written against a *coalesced* batch, because that is the
// only case where the two clocks disagree, and it is the normal case on a
// stylus: one handler call, several real samples.

interface FakeCanvas {
  dispatch(type: string, event: Partial<PointerEvent>): void
}

function fakeCanvas(): { canvas: HTMLCanvasElement; fake: FakeCanvas } {
  const listeners = new Map<string, ((e: PointerEvent) => void)[]>()
  const canvas = {
    width: 100,
    height: 100,
    style: {} as CSSStyleDeclaration,
    addEventListener(type: string, fn: (e: PointerEvent) => void) {
      const list = listeners.get(type) ?? []
      list.push(fn)
      listeners.set(type, list)
    },
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  }
  const fake: FakeCanvas = {
    dispatch(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event as PointerEvent)
    },
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, fake }
}

interface Sample { x: number; t: number }

function sampleEvent({ x, t }: Sample, coalesced?: Sample[]): Partial<PointerEvent> {
  return {
    button: 0,
    pointerId: 1,
    pointerType: 'pen',
    pressure: 0.5,
    clientX: x,
    clientY: 0,
    tiltX: 0,
    tiltY: 0,
    timeStamp: t,
    getCoalescedEvents: coalesced
      ? () => coalesced.map(s => sampleEvent(s) as PointerEvent)
      : undefined,
  }
}

/** Presses at the first sample, then delivers the rest as one coalesced batch
 *  — the shape a stylus actually arrives in — and returns the speed reported
 *  for each move sample. */
function speedsFor(samples: Sample[]): number[] {
  const { canvas, fake } = fakeCanvas()
  const input = new PointerInput(canvas)
  const seen: number[] = []
  input.on('move', (data: PointerData) => seen.push(data.speed))

  const [down, ...moves] = samples
  fake.dispatch('pointerdown', sampleEvent(down))
  fake.dispatch('pointermove', sampleEvent(moves[moves.length - 1], moves))
  return seen
}

/** A straight drag at a constant speed, sampled every `dtMs`. */
function steadyDrag(speedPxPerMs: number, dtMs: number, count: number): Sample[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * speedPxPerMs * dtMs, t: i * dtMs }))
}

describe('PointerInput speed (#532)', () => {
  it('reports the hand\'s real speed for a coalesced batch, not the handler\'s clock', () => {
    // 0.25 px/ms — squarely inside the range Ilya's own hatching measured at,
    // and the range the liner's flow curve is flat across.
    //
    // This is the assertion that fails on the pre-#532 code: every sample in
    // the batch was differenced against a `performance.now()` that barely
    // moves across one synchronous loop, so the reported speed came out as
    // the sample's distance over ~0-1 ms — off by the better part of an order
    // of magnitude, and in the direction that pinned the ink to its floor.
    const speeds = speedsFor(steadyDrag(0.25, 4, 8))

    expect(speeds.length).toBe(7)
    for (const speed of speeds) expect(speed).toBeCloseTo(0.25, 2)
  })

  it('gives the same answer whatever rate the device reports at', () => {
    // The same hand, at the same speed, sampled at 240 Hz / 120 Hz / 60 Hz.
    // A fixed per-sample smoothing weight would have made these three differ;
    // a time-derived one is what makes the tool behave the same on an iPad and
    // on a mouse.
    const fast = speedsFor(steadyDrag(0.8, 4, 24)).at(-1)!
    const mid = speedsFor(steadyDrag(0.8, 8, 12)).at(-1)!
    const slow = speedsFor(steadyDrag(0.8, 16, 6)).at(-1)!

    for (const speed of [fast, mid, slow]) expect(speed).toBeCloseTo(0.8, 2)
  })

  it('survives a batch whose samples all carry one timestamp', () => {
    // Some devices stamp a whole coalesced batch identically. Dividing by that
    // gap is a division by zero; the previous code's `|| 1` turned it into a
    // fabricated 1 ms instead, which is where the 1.40 "stopped" clamp in the
    // measured data came from. Nothing here may produce a non-finite speed,
    // and once real time passes the answer has to be the batch's true average.
    const speeds = speedsFor([
      { x: 0, t: 0 },
      { x: 2, t: 0 }, { x: 4, t: 0 }, { x: 6, t: 0 }, { x: 8, t: 0 },
      { x: 10, t: 20 }, // 10 px over 20 ms = 0.5 px/ms across the whole run
    ])

    for (const speed of speeds) expect(Number.isFinite(speed)).toBe(true)
    expect(speeds.at(-1)).toBeCloseTo(0.5, 2)
  })

  it('measures the first move from the press, not from the previous stroke', () => {
    // The reference point is seeded at pointerdown precisely because
    // `_extract` no longer advances it when no time has passed. Without that
    // seeding a second stroke's opening sample would be differenced against
    // wherever the first one ended.
    const { canvas, fake } = fakeCanvas()
    const input = new PointerInput(canvas)
    const seen: number[] = []
    input.on('move', (data: PointerData) => seen.push(data.speed))

    fake.dispatch('pointerdown', sampleEvent({ x: 0, t: 0 }))
    fake.dispatch('pointermove', sampleEvent({ x: 4, t: 10 }, [{ x: 4, t: 10 }]))
    fake.dispatch('pointerup', sampleEvent({ x: 4, t: 12 }))

    // Second stroke starts 90 px away, and its own first move is 4 px in 10 ms.
    fake.dispatch('pointerdown', sampleEvent({ x: 94, t: 500 }))
    fake.dispatch('pointermove', sampleEvent({ x: 98, t: 510 }, [{ x: 98, t: 510 }]))

    expect(seen.at(-1)).toBeCloseTo(0.4, 2) // 4 px / 10 ms, not 94 px / anything
  })

  it('smooths per-sample digitizer jitter without lagging a real change of pace', () => {
    // A steady 0.5 px/ms hand whose reported positions wobble by ±0.5 px, at
    // 4 ms — i.e. an instantaneous speed swinging between roughly 0.25 and
    // 0.75 while nothing about the hand changed.
    const jittery: Sample[] = Array.from({ length: 45 }, (_, i) => ({
      x: i * 2 + (i % 2 === 0 ? 0.5 : -0.5),
      t: i * 4,
    }))
    // Dropped while the average is still walking away from its seed — the
    // smoother is deliberately a filter with memory, so the first few tau are
    // convergence, not jitter.
    const settled = speedsFor(jittery).slice(30)
    const spread = Math.max(...settled) - Math.min(...settled)
    const mean = settled.reduce((s, v) => s + v, 0) / settled.length

    // Raw per-sample speed alternates 0.25 / 0.75 here — a 0.5 swing on a hand
    // that is doing exactly one thing.
    expect(spread).toBeLessThan(0.1)
    expect(mean).toBeCloseTo(0.5, 2)
  })
})

describe('smoothSpeed (#532)', () => {
  it('seeds on the first sample rather than ramping up from zero', () => {
    // Every stroke would otherwise open a few dabs' worth of falsely-slow —
    // which for the liner is falsely-*more* ink, i.e. a blob at the start of
    // every mark.
    expect(smoothSpeed(-1, 1.7, 4)).toBe(1.7)
  })

  it('weights a sample by how long it covers, not by being a sample', () => {
    // The same total elapsed time reaches the same place whether it arrived as
    // one long step or several short ones — that is the property that makes
    // the smoother report-rate independent.
    const oneStep = smoothSpeed(0, 1, 16)
    let manySteps = 0
    for (let i = 0; i < 4; i++) manySteps = smoothSpeed(manySteps, 1, 4)

    expect(manySteps).toBeCloseTo(oneStep, 2)
  })

  it('barely moves for a sample that covers almost no time', () => {
    // The robustness the old code needed a clamp for: a huge quotient off a
    // 0.1 ms gap is self-limiting here, because its weight is 0.1/tau.
    expect(smoothSpeed(1, 1000, 0.1)).toBeLessThan(1 + 1000 * (0.1 / SPEED_SMOOTHING_TAU_MS))
    expect(smoothSpeed(1, 1000, 0.1)).toBeLessThan(5)
  })
})
