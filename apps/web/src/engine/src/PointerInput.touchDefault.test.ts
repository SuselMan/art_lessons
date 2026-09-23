import { describe, expect, it } from 'vitest'

import { PointerInput } from './PointerInput'

// (#517) The canvas takes `touchstart` non-passively and calls preventDefault
// on it. That listener is one line long and looks like a no-op, which is
// exactly why it needs a test: without one, the next cleanup pass deletes it
// and iPad silently goes back to losing about one hatching stroke in fifteen.
// See _handleCanvasTouchStart's own comment for the measurement behind it.
//
// Two things are pinned here, and both are load-bearing:
//
//  - that the listener is registered at all, and on `touchstart`;
//  - that it is registered with `{ passive: false }`. A passive listener is
//    forbidden from calling preventDefault, so registering it passively would
//    leave the subscription present, silent, and useless — the failure this
//    test is most likely to actually catch.

interface Registered {
  type: string
  fn: (e: Event) => void
  options?: boolean | AddEventListenerOptions
}

function fakeCanvas(): { canvas: HTMLCanvasElement; registered: Registered[] } {
  const registered: Registered[] = []
  const canvas = {
    width: 100,
    height: 100,
    style: {} as CSSStyleDeclaration,
    addEventListener(type: string, fn: (e: Event) => void, options?: boolean | AddEventListenerOptions) {
      registered.push({ type, fn, options })
    },
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, registered }
}

describe('#517 — the canvas claims touchstart', () => {
  it('subscribes to touchstart non-passively', () => {
    const { canvas, registered } = fakeCanvas()
    new PointerInput(canvas)

    const touch = registered.find(r => r.type === 'touchstart')
    expect(touch, 'no touchstart listener on the canvas').toBeDefined()
    expect(touch?.options).toEqual({ passive: false })
  })

  it('calls preventDefault on the touchstart it receives', () => {
    const { canvas, registered } = fakeCanvas()
    new PointerInput(canvas)

    const touch = registered.find(r => r.type === 'touchstart')!
    let prevented = false
    touch.fn({ preventDefault: () => { prevented = true } } as unknown as Event)
    expect(prevented, 'the listener exists but forgoes the default action it was added for').toBe(true)
  })
})
