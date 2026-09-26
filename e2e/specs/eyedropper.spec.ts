import { expect, test, type Page } from '@playwright/test'

import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

/** (#493) The eyedropper's one-shot pick, written when it moved out of Room
 *  into useEyedropper. It reads what is on screen under the pointer, writes
 *  it into the tool the canvas is handed back to, and hands it back — a pick
 *  is the whole gesture. Nothing in the suite had ever picked a colour. */

function pencilColor(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__roomStore!.getState().toolSettings.pencil.color as number[])
}

test('the eyedropper takes the colour under the pointer and hands the pencil back', async ({ page }) => {
  await createRoom(page)
  await waitForRoomReady(page)
  await drawStroke(page, [[300, 300], [600, 300]])
  await waitForOperations(page, 'stroke', 1)

  // Pure white in the pencil's slot, so any real pick from graphite on paper
  // is a visible change.
  await page.evaluate(() => window.__roomStore!.getState().setToolSetting('pencil', 'color', [1, 1, 1]))
  await page.evaluate(() => window.__roomStore!.getState().setTool('eyedropper'))

  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box')
  await page.mouse.click(box.x + 450, box.y + 300)

  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().tool)).toBe('pencil')
  const picked = await pencilColor(page)
  // Darker than white: it came off the stroke, not out of nowhere.
  expect(picked.reduce((a, b) => a + b, 0) / 3).toBeLessThan(0.95)
})
