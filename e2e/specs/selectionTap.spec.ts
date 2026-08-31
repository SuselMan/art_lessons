import { expect, test, type Page } from '@playwright/test'

import type { SelectionShape } from '../../packages/shared/src/index'
import { createRoom, waitForRoomReady } from '../support/room'

/** (#519) Touch, for the whole file — Playwright's `touchscreen` needs it, and
 *  it is the entire subject here: everything about this gesture is decided by
 *  `pointerType`, so a run without real touch events would assert nothing.
 *
 *  This is the first spec in the suite to use it. The README's "touch is not
 *  covered" still holds for the gestures it was written about — two-finger
 *  pan, palm rejection, pressure — none of which a single emulated finger can
 *  stand in for. A tap is the one touch gesture that *is* fully described by
 *  its down and its up, which is why it can be tested here at all. */
test.use({ hasTouch: true })

/** The canvas is laid out for a tablet on purpose: this bug was reported from
 *  one, and `deviceType` decides presentation only (see lib/deviceType.ts), so
 *  pinning it keeps the layout the same on every machine that runs this
 *  instead of leaving it to whatever touch emulation does to `pointer:
 *  coarse`. English for the same reason floatingPanel.spec.ts asks for it: the
 *  tool is found by its accessible name. */
async function tabletInEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('al_device_type', 'tablet')
    localStorage.setItem('al_locale', 'en')
  })
}

function selection(page: Page): Promise<SelectionShape | null> {
  return page.evaluate(() => window.__roomStore!.getState().selection)
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box — is the room still loading?')
  return box
}

/** Picks up the selection tool and marks a rectangle with the mouse — the pen
 *  half of the tool, which is the only way to *draw* a region and is untouched
 *  by any of this. */
async function markRectangle(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const box = await canvasBox(page)
  await page.mouse.move(box.x + 300, box.y + 250)
  await page.mouse.down()
  await page.mouse.move(box.x + 600, box.y + 500, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => selection(page), { message: 'a rectangle to be selected' }).not.toBeNull()
}

/** Drags one finger across the canvas: a pan, and the gesture this must never
 *  be confused with. Playwright's `touchscreen` has only `tap`, so the moves
 *  go through CDP directly — the same transport `tap` itself uses. */
async function touchDrag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => ({ x, y, radiusX: 12, radiusY: 12, force: 1 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(...from)] })
  for (let i = 1; i <= 8; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / 8
    const y = from[1] + ((to[1] - from[1]) * i) / 8
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(x, y)] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** (#519) A selection could only be put down with the pen: `handleSelectionDown`
 *  ignored every touch outright, so on a tablet the only way to clear an
 *  outline was to poke the canvas with the stylus — the drawing hand doing a
 *  piece of UI work, while the same tap past a transform gizmo has meant "I am
 *  done here" since #407. Reported as "лассо не сбрасывается тапом мимо
 *  выделения" (Ilya, 31.08).
 *
 *  Only a real browser can test this: it is entirely a question of what
 *  `pointerType` a live pointer event carries and which of three listeners on
 *  the same element claims it. */
test.describe('a finger past the selection puts it down', () => {
  test('a tap clears the selection', async ({ page }) => {
    await tabletInEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await markRectangle(page)

    const box = await canvasBox(page)
    await page.touchscreen.tap(box.x + 900, box.y + 650)

    await expect.poll(() => selection(page), { message: 'the tap to clear the selection' }).toBeNull()
  })

  test('a tap inside the selection clears it too, exactly as the pen does', async ({ page }) => {
    await tabletInEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await markRectangle(page)

    // The selection tool has no drag-the-region gesture of its own — that is
    // the transform tool's job — so a press with it in hand means the same
    // thing wherever it lands, and the pen has always cleared here as well.
    const box = await canvasBox(page)
    await page.touchscreen.tap(box.x + 450, box.y + 375)

    await expect.poll(() => selection(page), { message: 'the tap to clear the selection' }).toBeNull()
  })

  test('a one-finger pan leaves the selection alone', async ({ page }) => {
    await tabletInEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await markRectangle(page)
    const marked = await selection(page)

    const box = await canvasBox(page)
    await touchDrag(page, [box.x + 900, box.y + 650], [box.x + 700, box.y + 400])

    // The view moved and the region did not: a pan is how a tablet is driven
    // with the other hand, and losing the selection to one would make the tool
    // unusable exactly where it is most needed.
    expect(await selection(page)).toEqual(marked)
  })
})
