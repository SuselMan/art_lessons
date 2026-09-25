import { expect, test, type Page } from '@playwright/test'

import type { AreaClearOperation } from '../../packages/shared/src/index'
import {
  INK, contentBounds, createRoom, drawStroke, maxDarknessOverRect, operations, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#493) What a selection does to a layer — Delete and Cut — and the one
 *  outline shape nothing drew yet, the point-by-point lasso.
 *
 *  Written when the selection's Room side moved into its own hook and it
 *  turned out only half of it was covered: selectionTap draws a rectangle and
 *  clears it, clipboardAcrossRooms copies and pastes. Nothing pressed Delete,
 *  nothing cut, and nothing placed a polygon vertex — with any of the three
 *  broken the suite stayed green.
 *
 *  English so the tool is found by its accessible name, the same reason the
 *  other two selection specs ask for it. */
async function inEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
}

async function canvasBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box — is the room still loading?')
  return box
}

function selection(page: Page): Promise<{ points: number[] } | null> {
  return page.evaluate(() => window.__roomStore!.getState().selection)
}

/** A stroke to act on, then the selection tool in hand with a rectangle
 *  dragged round it. */
async function drawAndMark(page: Page): Promise<void> {
  await drawStroke(page, [[320, 280], [420, 320], [500, 300]])
  await waitForOperations(page, 'stroke', 1)
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const box = await canvasBox(page)
  await page.mouse.move(box.x + 280, box.y + 240)
  await page.mouse.down()
  await page.mouse.move(box.x + 560, box.y + 380, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => selection(page), { message: 'a rectangle to be selected' }).not.toBeNull()
}

async function lastAreaClear(page: Page): Promise<AreaClearOperation> {
  const op = (await operations(page)).filter((o): o is AreaClearOperation => o.type === 'area_clear').at(-1)
  if (!op) throw new Error('e2e: no area_clear in the log')
  return op
}

test.describe('what a selection does', () => {
  test('Delete clears the selected region of the active layer', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await drawAndMark(page)
    const layerId = await page.evaluate(() => window.__roomStore!.getState().layerState.activeId)
    const inked = await contentBounds(page, layerId)
    if (!inked) throw new Error('e2e: the stroke left no content')
    expect(await maxDarknessOverRect(page, inked)).toBeGreaterThan(INK)

    await page.keyboard.press('Delete')

    await waitForOperations(page, 'area_clear', 1)
    const op = await lastAreaClear(page)
    expect(op.layerId).toBe(layerId)
    expect(op.selection).toEqual(await selection(page))
    // The whole stroke was inside the rectangle, so none of it is left on
    // screen. Read as pixels rather than hasLayerContent, which answers "was
    // this layer ever painted" and stays true after a clear.
    await expect.poll(() => maxDarknessOverRect(page, inked)).toBeLessThan(INK)
  })

  test('Cut fills the clipboard and then clears the region', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await drawAndMark(page)

    await page.keyboard.press('Control+x')

    await waitForOperations(page, 'area_clear', 1)
    // Only after the copy took — a cut that erased first would lose the work
    // whenever the clipboard refused it.
    expect(await page.evaluate(() => localStorage.getItem('al_clipboard'))).not.toBeNull()
  })

  test('a locked layer refuses Delete', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await drawAndMark(page)
    // The local lock — a per-user view field, which is what the row's padlock
    // sets for a participant — straight through the store.
    await page.evaluate(() => {
      window.__roomStore!.getState().setLayerStateLocal(prev => {
        const id = prev.activeId
        if (!id || !prev.items[id]) return prev
        return { ...prev, items: { ...prev.items, [id]: { ...prev.items[id], locked: true } } }
      })
    })

    // Two gates refuse this — the selection's own check and the lock gate in
    // dispatchOp (#518) — and either alone is enough, so this goes red only
    // with both gone. That is the contract: the layer stays untouched.
    await page.keyboard.press('Delete')
    // Nothing to wait for but time: give a dispatch every chance to land.
    await page.waitForTimeout(500)
    expect((await operations(page)).filter(o => o.type === 'area_clear')).toHaveLength(0)
  })

  test('the point-by-point lasso places vertices and closes on a double-click', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.evaluate(() => window.__roomStore!.getState().setToolSetting('selection', 'shape', 'polygon'))

    const box = await canvasBox(page)
    await page.mouse.click(box.x + 300, box.y + 250)
    await page.mouse.click(box.x + 550, box.y + 260)
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().pendingSelection?.length ?? 0))
      .toBe(4)
    // Still open: two vertices are a line, and a line is not a region.
    expect(await selection(page)).toBeNull()

    await page.mouse.dblclick(box.x + 420, box.y + 450)

    await expect.poll(() => selection(page), { message: 'the lasso to close' }).not.toBeNull()
    expect(await page.evaluate(() => window.__roomStore!.getState().pendingSelection)).toBeNull()
  })
})
