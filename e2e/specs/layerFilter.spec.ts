import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, joinRoom, maxDarknessOverRect, operations,
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

// QA-007: a remote stroke arrives while the author is considering a filter.
// Cancel must leave it intact; Apply, author undo/redo and history replay
// must all converge on the same actual framebuffer.
for (const [kind, label, field, value] of [
  ['gaussian_blur', 'Gaussian Blur', 'Radius', 6],
  ['motion_blur', 'Motion Blur', 'Distance', 12],
  ['hsl', 'Hue / Saturation', 'Lightness', 30],
  ['curves', 'Curves', '', 0],
  ['color_balance', 'Color Balance', 'Cyan — Red', 40],
] as const) {
  test(`${kind}: remote drawing during preview survives Cancel, Apply and undo/redo`, { tag: '@two-browsers' }, async ({ page, browser }) => {
    test.setTimeout(120_000)
    const roomId = await createRoom(page, `QA concurrent ${kind}`)
    await waitForRoomReady(page)
    const layerId = await activeLayerId(page)
    const peerContext = await browser.newContext({ ignoreHTTPSErrors: true })
    const lateContext = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      const peer = await peerContext.newPage()
      await joinRoom(peer, roomId)
      await drawStroke(page, [[450, 300], [650, 300]], { size: 60 })
      await waitForOperations(peer, 'stroke')
      const sample = async (p: Page) => p.evaluate(() => {
        const room = window.__roomStore!.getState().room!
        const out: number[] = []
        for (let x = 0; x < 24; x++) for (let y = 0; y < 24; y++) out.push(...(window.__engine!.pickColor(room.width * (x + 0.5) / 24, room.height * (y + 0.5) / 24) ?? []))
        return out
      })
      const converge = async (p: Page) => {
        await expect.poll(async () => {
          const a = await sample(page), b = await sample(p)
          expect(b.length).toBe(a.length)
          return Math.max(...b.map((v, i) => Math.abs(v - a[i])))
        }, { timeout: 30_000 }).toBeLessThan(0.02)
      }
      const edit = async () => {
        await chooseFilter(page, label)
        if (field) await setNumber(page, field, value)
        else {
          const graph = page.getByRole('dialog', { name: 'Filter' }).getByRole('img')
          const box = await graph.boundingBox()
          if (!box) throw new Error('curve editor missing')
          await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.3)
        }
      }
      await openFilters(page, layerId)
      await edit()
      await drawStroke(peer, [[450, 450], [650, 450]], { size: 60 })
      await waitForOperations(page, 'stroke', 2)
      expect((await operations(peer)).filter(o => o.type === 'layer_filter')).toHaveLength(0)
      await page.getByRole('dialog', { name: 'Filter' }).getByRole('button', { name: 'Cancel' }).click()
      await converge(peer)
      await openFilters(page, layerId)
      await edit()
      await page.getByRole('dialog', { name: 'Filter' }).getByRole('button', { name: 'Apply' }).click()
      await waitForOperations(peer, 'layer_filter')
      expect((await operations(peer)).filter(o => o.type === 'layer_filter')).toHaveLength(1)
      expect((await operations(peer)).find(o => o.type === 'layer_filter')).toMatchObject({ filter: { kind } })
      await converge(peer)
      await page.evaluate(() => window.__engine!.undo())
      await waitForOperations(peer, 'operation_undo')
      await converge(peer)
      await page.evaluate(() => window.__engine!.redo())
      await waitForOperations(peer, 'operation_redo')
      await converge(peer)
      const late = await lateContext.newPage()
      await joinRoom(late, roomId, 'Filter history witness')
      await waitForOperations(late, 'layer_filter')
      await converge(late)
    } finally {
      await peerContext.close()
      await lateContext.close()
    }
  })
}

// QA-015: deleting the target ends a dialog, rather than merely hiding it
// until another participant restores the layer with their own undo.
test('a deleted filter target stays dismissed when its owner undoes the deletion', { tag: '@two-browsers' }, async ({ page, browser }) => {
  const { layerId } = await strokedLayer(page)
  const roomId = page.url().split('/room/')[1]
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const peer = await context.newPage()
    await joinRoom(peer, roomId)
    await openFilters(page, layerId)
    await setNumber(page, 'Radius', 6)
    await peer.evaluate(id => window.__engine!.appendOperation({
      id: crypto.randomUUID(), type: 'layer_delete', layerIds: [id],
      userId: window.__roomStore!.getState().userId, timestamp: Date.now(),
    }), layerId)
    await waitForOperations(page, 'layer_delete')
    await expect(page.getByRole('dialog', { name: 'Filter' })).toBeHidden()
    await peer.evaluate(() => window.__engine!.undo())
    await waitForOperations(page, 'operation_undo')
    await expect.poll(() => page.evaluate(id => !!window.__roomStore!.getState().layerState.items[id], layerId)).toBe(true)
    await expect(page.getByRole('dialog', { name: 'Filter' })).toBeHidden()
    expect((await operations(page)).filter(op => op.type === 'layer_filter')).toHaveLength(0)
  } finally {
    await context.close()
  }
})
