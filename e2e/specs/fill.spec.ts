import { expect, test, type Page } from '@playwright/test'

import type { AreaFillOperation } from '../../packages/shared/src/index'
import {
  activeLayerId, createRoom, drawStroke, hasLayerContent, operations, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#493) The fill tool's one gesture, written when it moved out of Room
 *  into useFillTool. A tap works the region out on the main thread and emits
 *  an `area_fill`; nothing in the suite had ever tapped with it.
 *
 *  Placement is stated in world (page) coordinates and turned into screen
 *  ones through the camera, because where on the page a tap lands is exactly
 *  what #607 was about: the fill's domain was the on-screen surface's size,
 *  not the sheet's, so the same gesture worked near the top-left of the page
 *  and did nothing below it. */

/** A bounded room's camera: `vp.cx/cy` is where the page's centre sits in the
 *  canvas element, `vp.zoom` its scale. The sheet opens unrotated. */
async function worldToCanvas(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.evaluate(([wx, wy]) => {
    const s = window.__roomStore!.getState()
    const { cx, cy, zoom } = s.viewport
    const room = s.room!
    return [cx + (wx - room.width / 2) * zoom, cy + (wy - room.height / 2) * zoom] as [number, number]
  }, [x, y] as const)
}

/** A closed square outline around a world point. The fill needs content to
 *  stop at; a seed inside the outline has a bounded region. */
async function outlineAround(page: Page, x: number, y: number): Promise<[number, number]> {
  const [cx, cy] = await worldToCanvas(page, x, y)
  const r = 50
  await drawStroke(page, [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r]])
  await waitForOperations(page, 'stroke', 1)
  return [cx, cy]
}

async function tapCanvas(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box')
  await page.mouse.click(box.x + x, box.y + y)
}

async function pickFill(page: Page): Promise<void> {
  await page.evaluate(() => window.__roomStore!.getState().setTool('fill'))
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().tool)).toBe('fill')
}

test.describe('the fill', () => {
  test('a tap inside an outline fills it on the active layer, and the fill is recorded', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)
    const [x, y] = await outlineAround(page, 500, 400)
    await pickFill(page)

    await tapCanvas(page, x, y)

    await waitForOperations(page, 'area_fill', 1)
    const fill = (await operations(page)).find((op): op is AreaFillOperation => op.type === 'area_fill')
    expect(fill?.layerId).toBe(layer)
    expect(fill!.width).toBeGreaterThan(0)
    await expect.poll(() => hasLayerContent(page, layer)).toBe(true)
  })

  test('a locked layer refuses the tap before any work is done', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const [x, y] = await outlineAround(page, 500, 400)
    await pickFill(page)
    await page.evaluate(() => {
      window.__roomStore!.getState().setLayerStateLocal(prev => {
        const id = prev.activeId
        if (!id || !prev.items[id]) return prev
        return { ...prev, items: { ...prev.items, [id]: { ...prev.items[id], locked: true } } }
      })
    })

    await tapCanvas(page, x, y)
    // Nothing to wait for but time: give a fill every chance to land.
    await page.waitForTimeout(800)
    expect((await operations(page)).filter(op => op.type === 'area_fill')).toHaveLength(0)
  })

  // (#607) The fill's domain was the on-screen surface rather than the sheet:
  // below the window-sized rectangle at the page's top-left, a tap did
  // nothing. This is the scenario that failed.
  test('a tap low on the sheet fills too', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)
    const [x, y] = await outlineAround(page, 877, 1800)
    await pickFill(page)

    await tapCanvas(page, x, y)
    await waitForOperations(page, 'area_fill', 1)
    const fill = (await operations(page)).find((op): op is AreaFillOperation => op.type === 'area_fill')
    expect(fill?.layerId).toBe(layer)
    // The region is the outline's inside, down there — not the window-sized
    // rectangle at the top of the page.
    expect(fill!.y).toBeGreaterThan(1500)
  })
})
