import { expect, test, type Page } from '@playwright/test'

import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

test.use({ actionTimeout: 15_000 })

async function chooseHand(page: Page, hand: 'Left-handed' | 'Right-handed') {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  await page.getByRole('radio', { name: hand, exact: true }).click()
  await page.keyboard.press('Escape')
}

async function expectDocks(page: Page, leftHanded: boolean) {
  const tools = page.locator('aside[class*="toolbar"]')
  const side = page.locator('[class*="layerPanelWrap"]')
  await expect.poll(async () => {
    const a = await tools.boundingBox()
    const b = await side.boundingBox()
    return a && b ? a.x > b.x : null
  }).toBe(leftHanded)
  const toolBox = (await tools.boundingBox())!
  const sideBox = (await side.boundingBox())!
  expect(leftHanded ? sideBox.x : toolBox.x).toBe(0)
  expect(Math.round(leftHanded ? toolBox.x + toolBox.width : sideBox.x + sideBox.width))
    .toBe(page.viewportSize()!.width)
}

test('handedness swaps live docks, keeps drawing coordinates, and survives reload', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await createRoom(page)
  await waitForRoomReady(page)
  await expectDocks(page, false)
  const canvas = page.locator('canvas').first()
  const originalCanvas = await canvas.boundingBox()

  await chooseHand(page, 'Left-handed')
  await expectDocks(page, true)
  expect(await canvas.boundingBox()).toEqual(originalCanvas)

  const openLayers = page.getByRole('button', { name: 'Open Layers', exact: true })
  if (await openLayers.isVisible()) await openLayers.click()
  const strip = (await page.locator('[class*="tabStrip"]').boundingBox())!
  const panel = (await page.locator('[class*="layerPanelWrap"]').boundingBox())!
  expect(strip.x).toBeGreaterThan(panel.x)
  await page.screenshot({ path: info.outputPath('left-handed.png') })
  await page.getByRole('button', { name: 'Collapse Layers', exact: true }).click()
  await page.locator('aside[class*="toolbar"]').getByRole('button', { name: 'Color', exact: true }).click()
  const flyout = page.getByRole('dialog', { name: 'Color', exact: true })
  await expect(flyout).toBeVisible()
  const colorBox = (await flyout.boundingBox())!
  expect(colorBox.x).toBeGreaterThanOrEqual(0)
  const wellBox = (await page.locator('aside[class*="toolbar"]').getByRole('button', { name: 'Color', exact: true }).boundingBox())!
  expect(colorBox.x + colorBox.width).toBeLessThan(wellBox.x)
  await page.keyboard.press('Escape')

  await drawStroke(page, [[500, 350], [700, 350]])
  await waitForOperations(page, 'stroke', 1)
  await page.reload()
  await page.locator('form button[type="submit"]').click()
  await waitForRoomReady(page)
  await expectDocks(page, true)
  await chooseHand(page, 'Right-handed')
  await expectDocks(page, false)
  await page.screenshot({ path: info.outputPath('right-handed.png') })
  expect(errors).toEqual([])
})

test('global settings persist the choice into the compact editor', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: 'Right-handed', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Left-handed', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Left-handed', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  await createRoom(page)
  const rail = page.locator('[class*="toolRailCompact"]')
  await expect(rail).toBeVisible()
  const box = (await rail.boundingBox())!
  expect(Math.round(box.x + box.width)).toBe(390)
  expect(await page.locator('[class*="layerPanelWrap"]').count()).toBe(0)
  await chooseHand(page, 'Right-handed')
  expect((await rail.boundingBox())!.x).toBe(0)
})
