import { expect, test, type Page } from '@playwright/test'

import { activeLayerId, contentBounds, createRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** (#493) The tool in hand reaching the engine — written when every
 *  `engine.setX` that reflects it moved out of Room into useToolSync.
 *
 *  The suite's own `drawStroke` sets the brush size on the engine directly,
 *  so the path a person takes — a setting changed in the store, pushed into
 *  the engine by an effect — was never exercised: with that effect deleted,
 *  every drawing spec still passed. Here size and tool are changed only
 *  through the store, and the stroke is drawn with raw mouse input. */

async function drawHorizontal(page: Page, y: number): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box')
  const cx = box.width / 2
  await page.mouse.move(box.x + cx - 120, box.y + y)
  await page.mouse.down()
  await page.mouse.move(box.x + cx + 120, box.y + y, { steps: 12 })
  await page.mouse.up()
}

function setPencilSize(page: Page, size: number): Promise<void> {
  return page.evaluate(n => window.__roomStore!.getState().setToolSetting('pencil', 'size', n), size)
}

test('a size set in the store reaches the engine — a bigger brush lays a taller mark', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
  await createRoom(page)
  await waitForRoomReady(page)
  const layer = await activeLayerId(page)

  await setPencilSize(page, 4)
  await drawHorizontal(page, 300)
  await waitForOperations(page, 'stroke', 1)
  const thin = await contentBounds(page, layer)

  // On a layer of its own, so each stroke's height is measured alone.
  await page.getByRole('button', { name: 'Add layer' }).click()
  await waitForOperations(page, 'layer_add', 1)
  const second = await activeLayerId(page)
  expect(second).not.toBe(layer)
  await setPencilSize(page, 60)
  await drawHorizontal(page, 500)
  await waitForOperations(page, 'stroke', 2)

  const thick = await contentBounds(page, second)
  if (!thin || !thick) throw new Error('e2e: no content bounds')
  expect(thick.height).toBeGreaterThan(thin.height * 3)

  // Both strokes were recorded, not only painted.
  const ops = await operations(page)
  expect(ops.filter(op => op.type === 'stroke')).toHaveLength(2)
})

test('a tool set in the store reaches the engine — the next stroke is the eraser’s', async ({ page }) => {
  await createRoom(page)
  await waitForRoomReady(page)
  await setPencilSize(page, 40)
  await drawHorizontal(page, 300)
  await waitForOperations(page, 'stroke', 1)

  await page.evaluate(() => {
    const s = window.__roomStore!.getState()
    s.setToolSetting('eraser', 'size', 120)
    s.setTool('eraser')
  })
  await drawHorizontal(page, 300)
  await waitForOperations(page, 'stroke', 2)
  const erase = (await operations(page)).filter(op => op.type === 'stroke').at(-1)
  // The operation carries the tool the engine actually drew with.
  expect(erase && 'tool' in erase ? erase.tool : null).toBe('eraser')
})
