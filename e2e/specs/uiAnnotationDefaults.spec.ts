import { expect, test, type Page } from '@playwright/test'

import { createRoom } from '../support/room'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

async function ready(page: Page): Promise<void> {
  // Hand intentionally disables canvas input: waitForRoomReady's drawing
  // signal would never become true for this navigation-first shell.
  await expect(page.getByRole('button', { name: 'Hand', exact: true })).toBeVisible()
  await page.waitForFunction(() => !!window.__engine && !!window.__roomStore?.getState().room)
}

async function tool(page: Page): Promise<string> {
  return page.evaluate(() => window.__roomStore!.getState().tool)
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('al_locale', 'en'))
})

test('phone and preview start with hand, deliberate annotation choices survive updates', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const id = await createRoom(page)
  await ready(page)
  await expect.poll(() => tool(page)).toBe('hand')
  const hand = page.getByRole('button', { name: 'Hand', exact: true })
  await expect(hand).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Note', exact: true }).tap()
  await expect.poll(() => tool(page)).toBe('annotateText')
  await expect(page.getByRole('slider', { name: 'Size', exact: true })).toHaveCount(0)
  // Changing the room toolset recreates selectTool; this used to rerun the
  // compact default effect and silently take a selected tool away.
  await page.evaluate(() => {
    const store = window.__roomStore!
    store.setState({ room: { ...store.getState().room!, enabledTools: ['hand', 'pencil'] } })
  })
  await expect.poll(() => tool(page)).toBe('annotateText')
  await page.getByRole('button', { name: 'Annotation pen', exact: true }).tap()
  await expect(page.getByRole('slider', { name: 'Size', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const store = window.__roomStore!
    store.setState({ room: { ...store.getState().room!, enabledTools: undefined } })
  })
  await expect.poll(() => tool(page)).toBe('annotatePen')
  await page.screenshot({ path: 'temp/qa-ui-annotations/phone-pen.png' })

  await page.goto(`/room/${id}?preview`)
  await page.locator('form button[type="submit"]').click()
  await ready(page)
  await expect.poll(() => tool(page)).toBe('hand')
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'temp/qa-ui-annotations/phone-preview-hand.png' })
  expect(errors).toEqual([])
})

test('minimal UI defaults on and saved false survives reopening settings', async ({ page }) => {
  await createRoom(page)
  await ready(page)
  expect(await page.evaluate(() => localStorage.getItem('al_minimal_ui'))).toBeNull()
  await openSettings(page)
  const minimal = page.getByRole('checkbox', { name: /^Minimal UI/ })
  await expect(minimal).toBeChecked()
  await minimal.uncheck()
  expect(await page.evaluate(() => localStorage.getItem('al_minimal_ui'))).toBe('false')
  await page.reload()
  await page.locator('form button[type="submit"]').click()
  await ready(page)
  await openSettings(page)
  await expect(minimal).not.toBeChecked()
  await page.screenshot({ path: 'temp/qa-ui-annotations/saved-minimal-false.png' })
})
