import { expect, test } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

/** (#377, #493) The ways out of a room, written when they moved out of Room
 *  into useLeaveGuard. Leaving asks first; Back does nothing while the editor
 *  is on screen (Chrome's edge-swipe fires it by accident while drawing).
 *  Nothing in the suite had tried to leave a room. */
test.describe('leaving a room', () => {
  test('asks first — Stay keeps the room, Leave goes home', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
    const id = await createRoom(page)
    await waitForRoomReady(page)

    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('menuitem', { name: 'Leave project' }).click()
    await expect(page.getByText('Leave this project?')).toBeVisible()
    await page.getByRole('button', { name: 'Stay' }).click()
    await expect(page).toHaveURL(new RegExp(`/room/${id}$`))

    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('menuitem', { name: 'Leave project' }).click()
    await page.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(page).not.toHaveURL(/\/room\//)
  })

  test('Back does nothing while the editor is on screen', async ({ page }) => {
    const id = await createRoom(page)
    await waitForRoomReady(page)
    await page.goBack()
    // Give a navigation every chance to happen.
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(new RegExp(`/room/${id}$`))
    expect(await page.evaluate(() => window.__roomStore!.getState().room)).not.toBeNull()
  })
})
