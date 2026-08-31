import { expect, test, type Page } from '@playwright/test'

import type { AreaPasteOperation } from '../../packages/shared/src/index'
import { createRoom, drawStroke, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** (#521) Carrying a piece of a drawing from one room to another.
 *
 *  Only a real browser can answer this. The clipboard is now two browser
 *  storages — IndexedDB for the raster, localStorage for the rect — plus a
 *  `storage` event between tabs, and vitest runs in a Node environment that has
 *  none of the three. Everything below is therefore about the seam this issue
 *  actually built: does a copy survive leaving the room it was made in, and
 *  does the piece land somewhere the person can see.
 *
 *  English so the selection tool can be found by its accessible name — the
 *  same reason floatingPanel.spec.ts asks for it. */
async function inEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
}

interface Rect { x: number; y: number; width: number; height: number }

function centreOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** What the light half of the clipboard holds — read straight out of
 *  localStorage, because that is the contract another tab reads too. */
async function clipboardMeta(page: Page): Promise<(Rect & { roomId: string }) | null> {
  const raw = await page.evaluate(() => localStorage.getItem('al_clipboard'))
  return raw ? JSON.parse(raw) as Rect & { roomId: string } : null
}

async function pageSize(page: Page): Promise<{ width: number; height: number }> {
  const room = await page.evaluate(() => window.__roomStore!.getState().room)
  if (!room) throw new Error('e2e: no room in the store')
  return { width: room.width, height: room.height }
}

/** Draws a mark well away from the middle of the sheet, marks a rectangle
 *  round it with the selection tool, and copies. Leaves the room with one
 *  stroke in it and a full clipboard.
 *
 *  Deliberately off-centre: the whole question this file asks is *where* a
 *  paste lands, and a piece copied from the middle would answer it the same
 *  way whichever rule applied. */
async function drawAndCopy(page: Page): Promise<Rect & { roomId: string }> {
  await drawStroke(page, [[220, 180], [300, 200], [380, 260], [430, 320]])
  const layerId = await page.evaluate(() => window.__roomStore!.getState().layerState.activeId)
  await waitForOperations(page, 'stroke', 1)
  expect(await page.evaluate(id => window.__engine!.hasLayerContent(id), layerId)).toBe(true)

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box')
  await page.mouse.move(box.x + 180, box.y + 140)
  await page.mouse.down()
  await page.mouse.move(box.x + 470, box.y + 360, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() => page.evaluate(() => window.__roomStore!.getState().selection), { message: 'a selection' })
    .not.toBeNull()

  await page.keyboard.press('Control+c')
  await expect
    .poll(() => clipboardMeta(page), { message: 'the clipboard to be filled' })
    .not.toBeNull()
  const meta = await clipboardMeta(page)
  if (!meta) throw new Error('e2e: the clipboard is empty after Ctrl+C')
  return meta
}

/** Pastes and drops the float in one go. A paste floats above the layer until
 *  it is let go (ADR 008), and Enter is what lets go — nothing reaches the
 *  operation log before that. */
async function pasteAndDrop(page: Page): Promise<AreaPasteOperation> {
  await page.keyboard.press('Control+v')
  await expect
    .poll(() => page.evaluate(() => window.__roomStore!.getState().tool), { message: 'the transform tool' })
    .toBe('transform')
  await page.keyboard.press('Enter')
  await waitForOperations(page, 'area_paste', 1)
  const ops = await operations(page)
  const paste = ops.filter((op): op is AreaPasteOperation => op.type === 'area_paste').at(-1)
  if (!paste) throw new Error('e2e: no area_paste in the log')
  return paste
}

test.describe('the clipboard outlives the room it was filled in', () => {
  test('a piece copied in one room pastes into another, in front of the person', async ({ page }) => {
    await inEnglish(page)
    await createRoom(page, 'Clipboard source')
    await waitForRoomReady(page)
    const copied = await drawAndCopy(page)

    // A second room in the same tab — which is the case that used to fail
    // outright: `resetRoomStore()` runs on Room mount and took the clipboard
    // with it, so this arrived with nothing to paste.
    await createRoom(page, 'Clipboard target')
    await waitForRoomReady(page)
    expect(await clipboardMeta(page)).not.toBeNull()

    const paste = await pasteAndDrop(page)
    expect(paste.width).toBe(copied.width)
    expect(paste.height).toBe(copied.height)

    // Where it landed: on the middle of the view, not on the coordinates it
    // was copied at. A fresh room opens fitted and centred, so the middle of
    // the view is the middle of the sheet — that is what makes this checkable
    // without re-deriving the camera maths the app itself uses.
    const sheet = await pageSize(page)
    const sheetCentre = { x: sheet.width / 2, y: sheet.height / 2 }
    const landed = centreOf(paste)
    expect(Math.abs(landed.x - sheetCentre.x)).toBeLessThan(sheet.width * 0.05)
    expect(Math.abs(landed.y - sheetCentre.y)).toBeLessThan(sheet.height * 0.05)

    // And it genuinely moved: the copied rect sat in the top-left quadrant,
    // which is what the old "paste in place" rule would have reproduced here.
    const source = centreOf(copied)
    expect(Math.hypot(source.x - sheetCentre.x, source.y - sheetCentre.y))
      .toBeGreaterThan(sheet.width * 0.1)
  })

  test('a paste inside its own room still lands exactly where it was copied', async ({ page }) => {
    // ADR 008's rule, and the one the cross-room case must not have cost us.
    await inEnglish(page)
    await createRoom(page, 'Same room')
    await waitForRoomReady(page)
    const copied = await drawAndCopy(page)

    const paste = await pasteAndDrop(page)
    expect(paste.x).toBeCloseTo(copied.x, 5)
    expect(paste.y).toBeCloseTo(copied.y, 5)
    expect(paste.width).toBe(copied.width)
    expect(paste.height).toBe(copied.height)
  })

  test('a copy in one tab is pasteable in a room already open in another', async ({ page, context }) => {
    await inEnglish(page)
    await createRoom(page, 'Copy here')
    await waitForRoomReady(page)

    // Opened *before* the copy, and never reloaded: its clipboard was empty
    // when it started, so anything it can paste arrived through the `storage`
    // event while it was sitting there. That is the whole cross-tab mechanism,
    // and nothing short of two live pages can exercise it.
    const other = await context.newPage()
    await createRoom(other, 'Paste there')
    await waitForRoomReady(other)
    expect(await clipboardMeta(other)).toBeNull()

    await drawAndCopy(page)

    await expect
      .poll(() => clipboardMeta(other), { message: 'the other tab to notice the copy' })
      .not.toBeNull()
    // Not just the meta: the raster has to be reachable from the other tab
    // too, which is the half that lives in IndexedDB.
    const paste = await pasteAndDrop(other)
    expect(paste.image.startsWith('data:image/png')).toBe(true)
    await other.close()
  })
})
