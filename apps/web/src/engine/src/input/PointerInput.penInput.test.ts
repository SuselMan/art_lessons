import { expect, it } from 'vitest'

import { PointerInput, type PointerData } from './PointerInput'

// #475 — the calibration is applied here and nowhere else, because the value
// leaving this file goes on to be baked into a Dab and replayed on every other
// participant's screen. These tests pin the two halves of that: that pen input
// really is corrected before anyone downstream sees it, and that nothing else
// is. (#650) The engine is handed the calibration already compiled to a
// function, so these use a plain one; compiling a calibration is tested with
// the model, in lib/input/pressureCalibration.test.ts.

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

it('captures real pen zero signals without inventing them for mouse/missing events',()=>{for(const event of [{pointerType:'pen',twist:0,tangentialPressure:0},{pointerType:'pen',twist:359,tangentialPressure:-1},{pointerType:'pen',twist:1,tangentialPressure:1},{pointerType:'mouse',twist:20,tangentialPressure:.5},{pointerType:'pen'}]){const {canvas,fake}=fakeCanvas();const input=new PointerInput(canvas);const got:PointerData[]=[];input.on('start',d=>got.push(d));fake.dispatch('pointerdown',pointerEvent(event));expect(got).toHaveLength(1);if(event.pointerType==='pen'&&'twist'in event){expect(got[0].sourceTwist).toBe(event.twist);expect(got[0].sourceTangentialPressure).toBe(Math.fround((event.tangentialPressure!+1)/2))}else{expect(got[0]).not.toHaveProperty('sourceTwist');expect(got[0]).not.toHaveProperty('sourceTangentialPressure')}input.destroy()}})
it('rejects malformed hardware readings instead of clamping',()=>{const {canvas,fake}=fakeCanvas();const input=new PointerInput(canvas);const got:PointerData[]=[];input.on('start',d=>got.push(d));fake.dispatch('pointerdown',pointerEvent({twist:360,tangentialPressure:2}));expect(got[0]).not.toHaveProperty('sourceTwist');expect(got[0]).not.toHaveProperty('sourceTangentialPressure');input.destroy()})
