import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, INK, joinRoom, maxDarknessOverRect,
  operations, waitForOperations, waitForRoomReady,
} from '../support/room'

type Rect = { x: number; y: number; width: number; height: number }

/** Moves the active row the way clicking a layer does — through the store,
 *  because a row's only stable handle is a generated, translated name. */
async function makeActive(page: Page, layerId: string): Promise<void> {
  await page.evaluate(id => {
    const store = window.__roomStore!
    store.setState({ layerState: { ...store.getState().layerState, activeId: id, selectedIds: [id] } })
  }, layerId)
  await expect.poll(() => activeLayerId(page)).toBe(layerId)
}

/** The panel row for `layerId`: the innermost element holding both the
 *  layer's name and its "More" menu. `last()` picks the innermost because a
 *  plain element locator lists ancestors first. */
async function rowFor(page: Page, layerId: string) {
  const name = await page.evaluate(
    id => window.__roomStore!.getState().layerState.items[id]?.name,
    layerId,
  )
  if (!name) throw new Error(`e2e: no layer ${layerId} in the store`)
  return page
    .locator('div', { has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'More' }) })
    .last()
}

function soloIds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__roomStore!.getState().soloIds)
}

/** The darkest pixel of `rect` in what `exportPNG()` produces.
 *
 *  A bounded room exports its sheet at 1:1, so the export's pixel grid *is*
 *  world space and a content rect reads straight off it. Decoded in the page
 *  because that is where the blob is; the darkness formula is the one the
 *  harness uses on the live composite, so the two readings compare. */
async function maxDarknessInExport(page: Page, rect: Rect): Promise<number> {
  return page.evaluate(async r => {
    const blob = await window.__engine!.exportPNG()
    if (!blob) throw new Error('e2e: exportPNG produced nothing')
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const steps = 12
    let max = 0
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const x = Math.round(r.x + (r.width * i) / steps)
        const y = Math.round(r.y + (r.height * j) / steps)
        const [red, g, b] = ctx.getImageData(x, y, 1, 1).data
        max = Math.max(max, 1 - (red + g + b) / (3 * 255))
      }
    }
    return max
  }, rect)
}

/** (#557) Solo: see one layer alone, then everything again — as a private
 *  filter, never as a change to the room. Unit tests cover the set arithmetic
 *  and the engine's filtered composite; what only a browser can show is the
 *  chain from a menu item to the pixels, and the three promises a person
 *  would notice being broken:
 *
 *   - the other layer's ink is gone from *my* screen while soloed, and back
 *     the moment it ends, with nothing in the log and nothing in undo;
 *   - a peer's screen never changes;
 *   - the exported picture (and so the room thumbnail) never changes.
 *
 *  The two marks are side by side, as in eraseThroughLayers.spec.ts, so that
 *  reading the composite over one layer's own bounds reads only that layer. */
test.describe('layer solo', () => {
  async function twoInkedLayers(page: Page) {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    const lower = await activeLayerId(page)

    await page.getByRole('button', { name: 'Add layer' }).click()
    await waitForOperations(page, 'layer_add', 1)
    const upper = await activeLayerId(page)
    expect(upper).not.toBe(lower)

    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('e2e: the canvas has no box')
    const cx = box.width / 2
    const cy = box.height / 2

    await makeActive(page, lower)
    await drawStroke(page, [[cx - 260, cy], [cx - 200, cy], [cx - 140, cy]])
    await waitForOperations(page, 'stroke', 1)

    await makeActive(page, upper)
    await drawStroke(page, [[cx + 140, cy], [cx + 200, cy], [cx + 260, cy]])
    await waitForOperations(page, 'stroke', 2)

    const lowerInk = await contentBounds(page, lower)
    const upperInk = await contentBounds(page, upper)
    expect(lowerInk).not.toBeNull()
    expect(upperInk).not.toBeNull()
    expect(lowerInk!.x + lowerInk!.width).toBeLessThan(upperInk!.x)
    expect(await maxDarknessOverRect(page, lowerInk!)).toBeGreaterThan(INK)
    expect(await maxDarknessOverRect(page, upperInk!)).toBeGreaterThan(INK)

    return { roomId, lower, upper, lowerInk: lowerInk!, upperInk: upperInk!, cx, cy }
  }

  test('the row menu shows one layer alone, the toolbar brings the rest back, and the room never knew', async ({ page, browser }) => {
    const { roomId, lower, upper, lowerInk, upperInk } = await twoInkedLayers(page)
    const opsBefore = (await operations(page)).length

    // A second participant, watching. Their screen is the test of "private".
    const student = await browser.newContext()
    try {
      const studentPage = await student.newPage()
      await joinRoom(studentPage, roomId)
      await expect
        .poll(() => maxDarknessOverRect(studentPage, upperInk), { message: 'student sees the upper mark' })
        .toBeGreaterThan(INK)

      // Solo the *lower* layer from its own row, with the upper one active:
      // the solo has to both hide the other mark and hand the pencil over.
      const row = await rowFor(page, lower)
      await row.getByRole('button', { name: 'More' }).click()
      await page.getByRole('menuitem', { name: 'Show only this layer' }).click()

      await expect.poll(() => soloIds(page)).toEqual([lower])
      expect(await activeLayerId(page)).toBe(lower)
      await expect
        .poll(() => maxDarknessOverRect(page, upperInk), { message: 'upper mark out of view' })
        .toBeLessThan(INK)
      expect(await maxDarknessOverRect(page, lowerInk)).toBeGreaterThan(INK)

      // Nothing shared moved: the upper layer's eye is still open, the log
      // is exactly as long as it was, and the export still has both marks.
      expect(await page.evaluate(id => window.__roomStore!.getState().layerState.items[id].visible, upper)).toBe(true)
      expect((await operations(page)).length).toBe(opsBefore)
      expect(await maxDarknessInExport(page, upperInk)).toBeGreaterThan(INK)
      expect(await maxDarknessInExport(page, lowerInk)).toBeGreaterThan(INK)

      // And the student is still looking at both marks. Polled to give a
      // hypothetical broadcast the time to arrive and be wrong.
      await studentPage.waitForTimeout(500)
      expect(await maxDarknessOverRect(studentPage, upperInk)).toBeGreaterThan(INK)
      expect(await maxDarknessOverRect(studentPage, lowerInk)).toBeGreaterThan(INK)

      // Undo has nothing to say about it: a solo is not a step. Pressing it
      // here would take the last *stroke* off, which the test does not want,
      // so the claim is checked on the log rather than by pressing the key.

      // Off, from the toolbar switch — one press, wherever it was started.
      await page.getByRole('button', { name: 'Show all layers again' }).click()
      await expect.poll(() => soloIds(page)).toEqual([])
      await expect
        .poll(() => maxDarknessOverRect(page, upperInk), { message: 'upper mark back' })
        .toBeGreaterThan(INK)
      expect(await maxDarknessOverRect(page, lowerInk)).toBeGreaterThan(INK)
      expect((await operations(page)).length).toBe(opsBefore)
    } finally {
      await student.close()
    }
  })

  test('Alt+click on the eye solos, a long press on the same eye ends it', async ({ page }) => {
    const { upper, lowerInk, upperInk } = await twoInkedLayers(page)

    const row = await rowFor(page, upper)
    const eye = row.getByRole('button', { name: 'Hide' })
    await eye.click({ modifiers: ['Alt'] })
    await expect.poll(() => soloIds(page)).toEqual([upper])
    await expect
      .poll(() => maxDarknessOverRect(page, lowerInk), { message: 'lower mark out of view' })
      .toBeLessThan(INK)
    // The shared eye did not blink: Alt+click is not a click.
    expect(await page.evaluate(id => window.__roomStore!.getState().layerState.items[id].visible, upper)).toBe(true)
    expect((await operations(page)).filter(op => op.type === 'layer_visibility')).toHaveLength(0)

    // Hold the eye: the finger's Alt. On the row that is already soloed it is
    // the way out, and it must not double as the row's own long press (which
    // opens selection mode) nor fall through to a plain toggle on release.
    const box = await eye.boundingBox()
    if (!box) throw new Error('e2e: the eye has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(700)
    await page.mouse.up()
    await expect.poll(() => soloIds(page)).toEqual([])
    await expect
      .poll(() => maxDarknessOverRect(page, lowerInk), { message: 'lower mark back' })
      .toBeGreaterThan(INK)
    expect(await maxDarknessOverRect(page, upperInk)).toBeGreaterThan(INK)
    expect(await page.evaluate(id => window.__roomStore!.getState().layerState.items[id].visible, upper)).toBe(true)
    expect((await operations(page)).filter(op => op.type === 'layer_visibility')).toHaveLength(0)
    // No selection mode either: the toolbar's "Done" only exists inside it.
    await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0)
  })

  test('a solo whose layer is deleted ends itself instead of blanking the screen', async ({ page }) => {
    const { lower, upper, lowerInk } = await twoInkedLayers(page)

    const row = await rowFor(page, upper)
    await row.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Show only this layer' }).click()
    await expect.poll(() => soloIds(page)).toEqual([upper])
    await expect.poll(() => maxDarknessOverRect(page, lowerInk)).toBeLessThan(INK)

    // Delete the soloed layer, the way a peer might. There is ink on it, so
    // the panel asks first.
    await row.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await waitForOperations(page, 'layer_delete', 1)

    await expect.poll(() => soloIds(page)).toEqual([])
    await expect
      .poll(() => maxDarknessOverRect(page, lowerInk), { message: 'lower mark shows again' })
      .toBeGreaterThan(INK)
    expect(await activeLayerId(page)).toBe(lower)
  })
})
