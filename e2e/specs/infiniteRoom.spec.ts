import { expect, test, type Page } from '@playwright/test'

import { drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

/** (#493) An infinite room — the mode #436 took off the create screen but
 *  kept end to end, and that rooms made before it still use in production.
 *  Nothing in the suite had ever opened one.
 *
 *  Written when the canvas overlays were folded into one fragment: they used
 *  to be the same hundred lines twice, one copy for a bounded room and one,
 *  camera-transformed, for an infinite room — so only this spec says the
 *  second placement still works.
 *
 *  The room is entered the way CreateRoom enters it: navigation state
 *  carrying the creator's draft. Its card is disabled, so the state is put
 *  in place directly and handed to the router with a popstate. */
async function createInfiniteRoom(page: Page): Promise<string> {
  await page.goto('/create')
  const id = `e2einf${Date.now().toString(36)}`
  await page.evaluate(roomId => {
    const draft = { room: { id: roomId, name: 'Infinite', paper: 'flat', infinite: true } }
    history.pushState({ usr: draft, key: 'e2e-infinite', idx: 1 }, '', `/room/${roomId}`)
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  }, id)
  await page.waitForURL(new RegExp(`/room/${id}$`))
  return id
}

test.describe('an infinite room', () => {
  test('opens, takes a stroke, and draws its overlays over the world', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
    await createInfiniteRoom(page)
    await waitForRoomReady(page)
    expect(await page.evaluate(() => window.__roomStore!.getState().room?.infinite)).toBe(true)

    await drawStroke(page, [[500, 400], [700, 420]])
    await waitForOperations(page, 'stroke', 1)

    // An overlay in the world wrapper: the ruler's line, laid by a drag.
    await page.evaluate(() => window.__roomStore!.getState().setTool('ruler'))
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('e2e: the canvas has no box')
    await page.mouse.move(box.x + 450, box.y + 550)
    await page.mouse.down()
    await page.mouse.move(box.x + 750, box.y + 550, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().rulerLine)).not.toBeNull()
    await expect(page.locator('[class*="worldOverlayWrap"] svg').first()).toBeVisible()

    // And another: the transform gizmo over the stroke.
    await page.evaluate(() => window.__roomStore!.getState().setTool('transform'))
    await expect(page.locator('[data-transform-gizmo] polygon').first()).toBeVisible()
  })
})
