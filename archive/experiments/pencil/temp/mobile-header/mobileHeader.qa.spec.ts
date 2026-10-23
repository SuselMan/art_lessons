import { expect, test } from '@playwright/test'
import { createRoom, waitForRoomReady } from '../support/room'

test('header on phone, tablet and desktop; fullscreen from menu', async ({ page }) => {
  test.setTimeout(60000)
  page.on('console', msg => { if (msg.text().startsWith('QA')) console.log(msg.text()) })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
  await createRoom(page)
  await waitForRoomReady(page)
  for (const [width, height] of [[390, 844], [844, 390], [320, 740], [1000, 800], [1400, 900]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(500)
    const header = page.locator('header')
    await expect(header.getByRole('button', { name: /Lock canvas rotation/ })).toHaveCount(Math.min(width, height) <= 600 ? 0 : 1)
    await expect(header.locator('button', { hasText: '0°' })).toHaveCount(Math.min(width, height) <= 600 ? 0 : 1)
    await expect(header.getByRole('button', { name: /Full.?screen|Minimal UI/i })).toHaveCount(0)
    await expect(header.getByRole('button', { name: 'Menu', exact: true })).toBeInViewport()
    await page.evaluate(() => {
      for (const type of ['click', 'scroll', 'resize']) window.addEventListener(type, e => console.log('QA', type, e.target instanceof Element ? e.target.tagName + '.' + e.target.className : 'window'), { capture: true, once: true })
    })
    await page.screenshot({ path: `temp/mobile-header/${width}x${height}.png` })
    const menuBox = await header.getByRole('button', { name: 'Menu', exact: true }).boundingBox()
    if (!menuBox) throw new Error('Menu missing')
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width)
    await page.mouse.click(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2)
    await expect(header.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'true', { timeout: 3000 })
    await expect(page.getByRole('menuitemcheckbox', { name: 'Fullscreen', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Fullscreen', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Fullscreen', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemcheckbox', { name: 'Fullscreen', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  expect(errors).toEqual([])
})
