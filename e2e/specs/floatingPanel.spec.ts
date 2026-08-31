import { expect, test, type Page } from '@playwright/test'

import { SLOT_RADIUS } from '../../apps/web/src/components/FloatingToolPanel/slots'
import {
  activeLayerId, createRoom, drawStroke, hasLayerContent, waitForOperations, waitForRoomReady,
} from '../support/room'

const PANEL = '#floating-tool-panel'

/** The panel is normally only shown once minimal UI has hidden the chrome,
 *  and minimal UI is entered by a *touch* tap on the canvas — which Playwright
 *  cannot produce (its pointer is a mouse, see the e2e README). `always` is a
 *  real setting a user can pick, not a test-only door, and it puts the same
 *  panel with the same handlers on screen without needing that gesture. */
async function showFloatingPanel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('al_floating_panel', 'always')
    // The buttons are found by their accessible names below, so the run must
    // not depend on the machine's browser language.
    localStorage.setItem('al_locale', 'en')
  })
}

async function panelBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(PANEL).boundingBox()
  if (!box) throw new Error('e2e: the floating panel has no box — is it visible at all?')
  return { x: box.x, y: box.y }
}

/** A point on the panel's own body — bare disc, no button under it.
 *
 *  Aimed halfway between two neighbouring slots (22.5° off an axis, since the
 *  eight of them sit 45° apart) and at half the compass radius, which puts it
 *  clear of the slot ring on one side and of the centre colour dot on the
 *  other. Computed from the panel's own constants rather than as a fraction of
 *  the box: this used to be "78% along the diagonal", which was bare disc when
 *  the panel had four buttons at the compass points and became the middle of
 *  the south-east slot the moment it grew eight. A literal fraction cannot say
 *  why it is that fraction, so it cannot notice when it stops being true. */
async function panelBodyPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(PANEL).boundingBox()
  if (!box) throw new Error('e2e: the floating panel has no box — is it visible at all?')
  const angle = Math.PI / 8
  const radius = SLOT_RADIUS / 2
  return {
    x: box.x + box.width / 2 + Math.cos(angle) * radius,
    y: box.y + box.height / 2 + Math.sin(angle) * radius,
  }
}

/** Presses the panel's Undo button, drifts `drift` px to the *left*, and
 *  releases. Leftwards because the panel opens at its default corner against
 *  the right edge, where clampPanelPosition would absorb a rightward drag and
 *  make "the panel did not move" true for the wrong reason. */
async function pressUndoWithDrift(page: Page, drift: number): Promise<void> {
  const undo = page.locator(PANEL).getByRole('button', { name: 'Undo' })
  const box = await undo.boundingBox()
  if (!box) throw new Error('e2e: the panel has no Undo button')
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  // In steps, like a real hand: one jump would be a single pointermove, and
  // the threshold is checked per move.
  await page.mouse.move(x - drift, y, { steps: 4 })
  await page.mouse.up()
}

/** (#516) A press that lands on one of the floating panel's buttons drifts —
 *  4 CSS px is well under a millimetre of tip travel on a tablet digitiser,
 *  and that was all it took for the press to be re-read as a drag of the
 *  panel: the panel slid a few pixels and, because a started drag suppresses
 *  the click that ends the gesture, the button never fired. Reported from real
 *  use as "tapping the panel moves it instead of pressing".
 *
 *  Only a real browser can test this: the threshold is enforced against
 *  `clientX/clientY` deltas across live pointer events, and the failure is the
 *  *absence* of a synthetic click that the DOM produces on its own. */
test.describe('the floating tool panel tells a tap on its buttons from a drag', () => {
  test('a small drift still presses the button and leaves the panel where it was', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 300], [640, 300]])
    await waitForOperations(page, 'stroke')
    expect(await hasLayerContent(page, layer)).toBe(true)

    const before = await panelBox(page)
    await pressUndoWithDrift(page, 6)

    // The tap did what it was aimed at.
    await expect.poll(() => hasLayerContent(page, layer)).toBe(false)
    // ...and nothing else: the panel is exactly where it was.
    expect(await panelBox(page)).toEqual(before)
  })

  test('a press that travels off the button drags the panel and does not press it', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 300], [640, 300]])
    await waitForOperations(page, 'stroke')

    const before = await panelBox(page)
    // Far enough that the pointer has left the 44 px button entirely — the
    // other half of the rule, and the half a fix that simply stopped buttons
    // from dragging the panel would break.
    await pressUndoWithDrift(page, 60)

    const after = await panelBox(page)
    expect(before.x - after.x).toBeGreaterThan(40)
    expect(await hasLayerContent(page, layer)).toBe(true)
  })

  test('a press on the panel body drags it from the first pixels', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    const before = await panelBox(page)
    const grab = await panelBodyPoint(page)
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    // Deliberately short: the body has no other meaning, so it keeps the tight
    // tap budget and must not inherit the button one.
    await page.mouse.move(grab.x - 12, grab.y, { steps: 4 })
    await page.mouse.up()

    expect(before.x - (await panelBox(page)).x).toBeGreaterThan(8)
  })
})
