import { expect, test, type Page } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

/** (#493) The editor's header, written when it moved out of Room into
 *  RoomHeader. What the suite already did with it was press undo and read
 *  the sync dot; nothing renamed a lesson in place, locked the rotation,
 *  reset the zoom from the readout, or checked that a narrow header folds its
 *  toggles into the menu (#575) instead of losing them.
 *
 *  English so controls are found by their accessible names. */
async function inEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
}

test.describe('the room header', () => {
  test('Share for review sends the current board link and opens annotation mode', async ({ page }) => {
    await inEnglish(page)
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { sessionStorage.setItem('review-link', text) } },
      })
    })
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Share for review', exact: true }).click()
    let expected = new URL(`/room/${roomId}?preview`, page.url()).href
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('review-link'))).toBe(expected)
    await expect(page.getByText('Link copied', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Boards', exact: true }).click()
    await page.getByRole('button', { name: 'New board', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().boardId)).not.toBe(roomId)
    await waitForRoomReady(page)
    const boardId = await page.evaluate(() => window.__roomStore!.getState().boardId)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Share for review', exact: true }).click()
    expected = new URL(`/room/${boardId}?preview`, page.url()).href
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('review-link'))).toBe(expected)
    await page.goto(expected)
    await page.locator('form button[type="submit"]').click()
    await waitForRoomReady(page)
    await expect(page.getByRole('button', { name: 'Annotations', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('annotateText')
  })

  test('the owner renames the lesson in place, and the server keeps it', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page, 'Cube')
    await waitForRoomReady(page)

    await page.getByRole('button', { name: 'Cube', exact: true }).click()
    const field = page.getByRole('textbox', { name: 'Rename this project' })
    await field.fill('Still life')
    const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/api/rooms/'))
    await field.press('Enter')

    expect((await saved).ok()).toBe(true)
    await expect(page.getByRole('button', { name: 'Still life', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.__roomStore!.getState().room?.name)).toBe('Still life')
  })

  test('Esc abandons a rename and leaves the name as it was', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page, 'Cube')
    await waitForRoomReady(page)

    await page.getByRole('button', { name: 'Cube', exact: true }).click()
    await page.getByRole('textbox', { name: 'Rename this project' }).fill('Sphere')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Cube', exact: true })).toBeVisible()
  })

  // (#458) The lock beside the readout: the readout stops being a control.
  test('the rotation lock pins the angle readout', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await page.getByRole('button', { name: 'Lock canvas rotation' }).click()
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().rotationLocked)).toBe(true)
    await expect(page.getByRole('button', { name: 'Unlock canvas rotation' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('button[aria-disabled="true"]', { hasText: '0°' })).toBeVisible()
  })

  test('clicking the zoom readout puts the zoom back to 100%', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)

    // Named by its number; the title carries the instructions.
    const readout = page.locator('button[title^="Zoom"]')
    const before = await readout.textContent()
    await page.keyboard.press('Control+Equal')
    await expect(readout).not.toHaveText(before ?? '')
    await readout.click()
    await expect(readout).toHaveText('100%')
  })

  // (#575) Below the breakpoint the toggles move into ≡, not away.
  test('a narrow header folds its toggles into the menu', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await expect(page.getByRole('button', { name: 'Annotations', exact: true })).toBeVisible()

    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(page.getByRole('button', { name: 'Annotations', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).click()
    // A toggle folds in as a checkable item, carrying the pressed state.
    await expect(page.getByRole('menuitemcheckbox', { name: 'Annotations' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Share', exact: true })).toBeVisible()
  })
})
