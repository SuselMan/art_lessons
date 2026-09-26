import { expect, test } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

/** (#493) The side panel's "Tool settings" tab, written when its content
 *  moved out of Room into ToolSettingsTab. It shows every field of the tool
 *  in hand — and follows the hand. Nothing in the suite had opened it. */
test('the Tool settings tab shows the tool in hand, and follows it', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
  await createRoom(page)
  await waitForRoomReady(page)

  await page.getByRole('button', { name: /Tool settings/ }).click()
  const empty = page.getByText('This tool has no settings yet.')
  // The pencil has settings: fields, not the empty note.
  await expect(empty).toHaveCount(0)
  const fields = page.locator('[class*="toolSettingsPanel"] input')
  await expect.poll(() => fields.count()).toBeGreaterThan(0)

  // The hand has none — the tab says so instead of going blank.
  await page.evaluate(() => window.__roomStore!.getState().setTool('hand'))
  await expect(empty).toBeVisible()

  // And back.
  await page.evaluate(() => window.__roomStore!.getState().setTool('pencil'))
  await expect(empty).toHaveCount(0)
})
