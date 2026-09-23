import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, maxDarknessOverRect, operations,
  waitForOperations, waitForRoomReady, type Rect,
} from '../support/room'

/** Opens the filter dialog on `layerId` through its row's "More" menu — the
 *  only way in a person has. */
async function openFilters(page: Page, layerId: string): Promise<void> {
  const name = await page.evaluate(
    id => window.__roomStore!.getState().layerState.items[id]?.name,
    layerId,
  )
  if (!name) throw new Error(`e2e: no layer ${layerId} in the store`)
  const row = page
    .locator('div', { has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'More' }) })
    .last()
  await row.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Filters…' }).click()
  await expect(page.getByRole('dialog', { name: 'Filter' })).toBeVisible()
}

async function chooseFilter(page: Page, label: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Filter' })
  await dialog.getByRole('button', { name: 'Filter', exact: true }).click()
  await page.getByRole('option', { name: label }).click()
}

async function setNumber(page: Page, label: string, value: number): Promise<void> {
  const input = page.getByRole('dialog', { name: 'Filter' }).getByRole('textbox', { name: label })
  await input.fill(String(value))
  await input.press('Enter')
}

async function strokedLayer(page: Page): Promise<{ layerId: string; stroke: Rect }> {
  await createRoom(page)
  await waitForRoomReady(page)
  const layerId = await activeLayerId(page)
  await drawStroke(page, [[200, 250], [420, 260], [600, 250]])
  await waitForOperations(page, 'stroke', 1)
  const stroke = await contentBounds(page, layerId)
  if (!stroke) throw new Error('e2e: the stroke left no content')
  return { layerId, stroke }
}

/** (#574) The chain from a layer's menu to its pixels and back. Unit tests
 *  cover the arithmetic byte for byte and the engine's operation lifecycle
 *  under MockGL; what only a browser can show is that a filter chosen in the
 *  dialog reaches the real framebuffer, is one undoable operation, and that
 *  the preview changes nothing until Apply. */
test.describe('layer filters', () => {
  test('a Gaussian blur softens the stroke, and undo takes it back', async ({ page }) => {
    const { layerId, stroke } = await strokedLayer(page)
    // A thin graphite line: blurring spreads its ink sideways, so its darkest
    // pixel gets lighter. That drop is what the assertions read.
    const before = await maxDarknessOverRect(page, stroke)

    await openFilters(page, layerId)
    await setNumber(page, 'Radius', 6)
    // The preview floats over the layer; nothing is in the log yet.
    await expect.poll(async () => maxDarknessOverRect(page, stroke)).toBeLessThan(before * 0.8)
    expect((await operations(page)).some(op => op.type === 'layer_filter')).toBe(false)

    await page.getByRole('dialog', { name: 'Filter' }).getByRole('button', { name: 'Apply' }).click()
    await waitForOperations(page, 'layer_filter', 1)
    await expect(page.getByRole('dialog', { name: 'Filter' })).toBeHidden()
    expect(await maxDarknessOverRect(page, stroke)).toBeLessThan(before * 0.8)

    await page.evaluate(() => window.__engine!.undo())
    await expect.poll(async () => maxDarknessOverRect(page, stroke)).toBeCloseTo(before, 2)
  })

  test('Cancel leaves the layer exactly as it was', async ({ page }) => {
    const { layerId, stroke } = await strokedLayer(page)
    const before = await maxDarknessOverRect(page, stroke)

    await openFilters(page, layerId)
    await chooseFilter(page, 'Hue / Saturation')
    await setNumber(page, 'Lightness', 100)
    await expect.poll(async () => maxDarknessOverRect(page, stroke)).toBeLessThan(before / 2)

    await page.getByRole('dialog', { name: 'Filter' }).getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(async () => maxDarknessOverRect(page, stroke)).toBeCloseTo(before, 2)
    expect((await operations(page)).some(op => op.type === 'layer_filter')).toBe(false)
  })

  test('lightness +100 turns graphite white once applied', async ({ page }) => {
    const { layerId, stroke } = await strokedLayer(page)
    const before = await maxDarknessOverRect(page, stroke)

    await openFilters(page, layerId)
    await chooseFilter(page, 'Hue / Saturation')
    await setNumber(page, 'Lightness', 100)
    await page.getByRole('dialog', { name: 'Filter' }).getByRole('button', { name: 'Apply' }).click()
    await waitForOperations(page, 'layer_filter', 1)

    const op = (await operations(page)).find(o => o.type === 'layer_filter')
    expect(op).toMatchObject({ layerId, filter: { kind: 'hsl', hue: 0, saturation: 0, lightness: 100 } })
    expect(await maxDarknessOverRect(page, stroke)).toBeLessThan(before / 2)
  })
})
