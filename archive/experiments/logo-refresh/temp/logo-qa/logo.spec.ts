import { expect, test } from '@playwright/test'
import { createRoom, waitForRoomReady } from '../../e2e/support/room'

test('full logo, themes, compact room header, landing and icons', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en'); localStorage.setItem('al_theme', 'dark') })
  await page.goto('/settings')
  const logo = page.getByRole('img', { name: 'Grafetto', exact: true })
  await expect(logo).toBeVisible()
  await expect(logo.locator('svg')).toHaveAttribute('viewBox', '0.00 0.00 1166.00 388.00')
  await expect(logo.locator('image')).toHaveAttribute('href', '/brand/grafetto-g.png')
  await page.screenshot({ path: 'temp/logo-qa/settings-dark.png' })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await page.screenshot({ path: 'temp/logo-qa/settings-light.png' })
  await logo.screenshot({ path: 'temp/logo-qa/logo-aligned.png', scale: 'css' })
  await createRoom(page, 'Logo QA')
  await waitForRoomReady(page)
  await page.screenshot({ path: 'temp/logo-qa/room-full.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(logo.locator('svg')).toHaveAttribute('viewBox', '40 0 316 388')
  await expect(logo.locator('#logo-wordmark')).toHaveCount(0)
  await page.screenshot({ path: 'temp/logo-qa/room-mark.png' })
  await page.goto('/landing/index.html')
  await expect(page.locator('.wordmark svg image')).toHaveAttribute('href', '/brand/grafetto-g.png')
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    await page.screenshot({ path: `temp/logo-qa/landing-${theme}.png` })
  }
  for (const path of ['/favicon.svg', '/favicon-96.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png', '/brand/grafetto-g.png']) {
    const response = await page.request.get(path)
    expect(response.ok(), path).toBe(true)
  }
  expect(errors).toEqual([])
})
