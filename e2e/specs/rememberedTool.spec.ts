import { expect, test, type Page } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

const GROUP = 'aside button[aria-label="Drawing tool"]'
const LIST = '[role="listbox"]'

async function englishRoom(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('al_locale', 'en'))
}

/** A fresh room opens with the pencil in hand, so one tap on the group is the
 *  second tap that opens its chooser. */
async function takeMaterial(page: Page, name: string): Promise<void> {
  await page.locator(GROUP).click()
  await page.locator(`${LIST} [role="option"]`, { hasText: name }).click()
  await expect(page.locator(GROUP)).toHaveAttribute('title', new RegExp(`^${name}`))
}

/** Back into the same room on the same device. A reload may stop at the name
 *  prompt, the way a returning joiner does; answer it if it is there. */
async function reenter(page: Page): Promise<void> {
  await page.reload()
  const name = page.locator('form input[type="text"]').first()
  await Promise.race([
    name.waitFor({ state: 'visible', timeout: 5_000 }).then(async () => {
      await name.fill('Teacher')
      await page.locator('form button[type="submit"]').click()
    }).catch(() => {}),
    waitForRoomReady(page),
  ])
  await waitForRoomReady(page)
}

/** (#682) The tool in hand is remembered per room on this device, next to the
 *  colour and the rest of each tool's settings that already were. Only a
 *  reload can check it: the whole subject is what survives one. */
test.describe('the remembered tool (#682)', () => {
  test('a room reopens with the material it was left with', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await takeMaterial(page, 'Marker')
    await reenter(page)

    await expect(page.locator(GROUP)).toHaveAttribute('title', /^Marker/)
    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'true')
    // The engine was built for it too, not only the button: the quick column
    // shows the marker's own nib picker.
    await expect(page.locator('aside').nth(1).locator('[aria-label="Nib"]')).toBeVisible()
  })

  test('a passing gesture is not what the room remembers', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await takeMaterial(page, 'Charcoal')
    await page.locator('aside button[aria-label="Ruler"]').click()
    await expect(page.locator('aside button[aria-label="Ruler"]')).toHaveAttribute('aria-pressed', 'true')
    await reenter(page)

    await expect(page.locator(GROUP)).toHaveAttribute('title', /^Charcoal/)
    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('aside button[aria-label="Ruler"]')).not.toHaveAttribute('aria-pressed', 'true')
  })
})
