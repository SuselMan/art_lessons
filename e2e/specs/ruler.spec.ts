import { expect, test, type Page } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

/** (#493) The ruler's one gesture, written when it moved out of Room into
 *  useRulerTool. What a press means is decided by where it lands relative to
 *  the line (rulerGestureAt): off it, a new line; on the body, a slide; on an
 *  end, a swing of that end. Nothing in the suite drew a ruler at all.
 *
 *  Positions are compared in the store's own space (room coordinates), and
 *  only as differences, so the camera's scale cancels out of every claim. */

interface Line { a: { x: number; y: number }; b: { x: number; y: number } }

function rulerLine(page: Page): Promise<Line | null> {
  return page.evaluate(() => window.__roomStore!.getState().rulerLine)
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box')
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 10 })
  await page.mouse.up()
}

async function withRuler(page: Page): Promise<void> {
  await createRoom(page)
  await waitForRoomReady(page)
  await page.evaluate(() => window.__roomStore!.getState().setTool('ruler'))
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().tool)).toBe('ruler')
}

test.describe('the ruler', () => {
  test('a drag off any line lays a new one from the press to the release', async ({ page }) => {
    await withRuler(page)
    await drag(page, [300, 300], [600, 300])
    const line = await rulerLine(page)
    expect(line).not.toBeNull()
    // Horizontal, pointing right, and long.
    expect(Math.abs(line!.b.y - line!.a.y)).toBeLessThan(1)
    expect(line!.b.x - line!.a.x).toBeGreaterThan(100)
  })

  test('a drag on its body slides the whole line', async ({ page }) => {
    await withRuler(page)
    await drag(page, [300, 300], [600, 300])
    const before = (await rulerLine(page))!

    await drag(page, [450, 300], [450, 400])
    const after = (await rulerLine(page))!
    const dA = { x: after.a.x - before.a.x, y: after.a.y - before.a.y }
    const dB = { x: after.b.x - before.b.x, y: after.b.y - before.b.y }
    // Both ends moved, by the same amount, straight down.
    expect(dA.y).toBeGreaterThan(20)
    expect(Math.abs(dA.x - dB.x)).toBeLessThan(1)
    expect(Math.abs(dA.y - dB.y)).toBeLessThan(1)
  })

  test('a drag on an end swings that end and leaves the other where it was', async ({ page }) => {
    await withRuler(page)
    await drag(page, [300, 300], [600, 300])
    const before = (await rulerLine(page))!

    await drag(page, [600, 300], [600, 450])
    const after = (await rulerLine(page))!
    expect(after.a).toEqual(before.a)
    expect(after.b.y - before.b.y).toBeGreaterThan(20)
  })
})
