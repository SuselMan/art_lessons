import { describe, expect, it } from 'vitest'

import { IDENTITY_PRESSURE_CALIBRATION, type PressureCalibration } from '../../lib/pressureCalibration'
import { PointerInput, type PointerData } from './PointerInput'

// #475 — the calibration is applied here and nowhere else, because the value
// leaving this file goes on to be baked into a Dab and replayed on every other
// participant's screen. These tests pin the two halves of that: that pen input
// really is corrected before anyone downstream sees it, and that nothing else
// is.

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

function pointerEvent(overrides: Partial<PointerEvent>): Partial<PointerEvent> {
  return {
    button: 0,
    pointerId: 1,
    pointerType: 'pen',
    pressure: 0.3,
    clientX: 10,
    clientY: 10,
    tiltX: 0,
    tiltY: 0,
    timeStamp: 0,
    ...overrides,
  }
}

/** Presses once and reports the pressure the rest of the engine would have
 *  seen for that sample. */
function pressureSeenBy(input: PointerInput, fake: FakeCanvas, event: Partial<PointerEvent>): number {
  let seen: PointerData | null = null
  input.on('start', data => { seen = data })
  fake.dispatch('pointerdown', pointerEvent(event))
  fake.dispatch('pointerup', pointerEvent({ ...event, pressure: 0 }))
  if (seen === null) throw new Error('no start event was emitted')
  return (seen as PointerData).pressure
}

describe('PointerInput pressure calibration', () => {
  const cal: PressureCalibration = { inMin: 0.1, inMax: 0.5, points: [] }

  it('corrects pen pressure before anything downstream sees it', () => {
    const { canvas, fake } = fakeCanvas()
    const input = new PointerInput(canvas)
    input.setPressureCalibration(cal)
    // A press this person considers firm reported 0.5 by their driver, and
    // reaches the engine as a full 1.
    expect(pressureSeenBy(input, fake, { pressure: 0.5 })).toBeCloseTo(1, 6)
    expect(pressureSeenBy(input, fake, { pressure: 0.3 })).toBeCloseTo(0.5, 6)
  })

  it('leaves the mouse alone', () => {
    const { canvas, fake } = fakeCanvas()
    const input = new PointerInput(canvas)
    input.setPressureCalibration(cal)
    // A mouse has no pressure to correct: it sits on the substituted 0.5, and
    // running a stylus's correction over that would silently change what
    // mouse drawing looks like on a calibrated machine.
    expect(pressureSeenBy(input, fake, { pointerType: 'mouse', pressure: 0 })).toBeCloseTo(0.5, 6)
    expect(pressureSeenBy(input, fake, { pointerType: 'mouse', pressure: 0.5 })).toBeCloseTo(0.5, 6)
  })

  it('is off until a calibration is set, and off again once cleared', () => {
    const { canvas, fake } = fakeCanvas()
    const input = new PointerInput(canvas)
    expect(pressureSeenBy(input, fake, { pressure: 0.3 })).toBeCloseTo(0.3, 6)

    input.setPressureCalibration(cal)
    expect(pressureSeenBy(input, fake, { pressure: 0.3 })).toBeCloseTo(0.5, 6)

    input.setPressureCalibration(null)
    expect(pressureSeenBy(input, fake, { pressure: 0.3 })).toBeCloseTo(0.3, 6)
  })

  it('treats an identity calibration as no calibration', () => {
    const { canvas, fake } = fakeCanvas()
    const input = new PointerInput(canvas)
    input.setPressureCalibration({ ...IDENTITY_PRESSURE_CALIBRATION })
    expect(pressureSeenBy(input, fake, { pressure: 0.37 })).toBeCloseTo(0.37, 6)
  })

  it('corrects every coalesced sample of a move, not just the reported one', () => {
    // A 240 Hz stylus delivers most of its samples through
    // getCoalescedEvents(); a correction applied only to the outer event
    // would leave the majority of a stroke uncalibrated.
    const { canvas, fake } = fakeCanvas()
    const input = new PointerInput(canvas)
    input.setPressureCalibration(cal)

    const seen: number[] = []
    input.on('move', data => { seen.push(data.pressure) })
    fake.dispatch('pointerdown', pointerEvent({ pressure: 0.1 }))
    fake.dispatch('pointermove', pointerEvent({
      pressure: 0.5,
      getCoalescedEvents: () => [
        pointerEvent({ pressure: 0.2, clientX: 11 }),
        pointerEvent({ pressure: 0.4, clientX: 12 }),
      ] as PointerEvent[],
    }))
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBeCloseTo(0.25, 6)
    expect(seen[1]).toBeCloseTo(0.75, 6)
  })
})
