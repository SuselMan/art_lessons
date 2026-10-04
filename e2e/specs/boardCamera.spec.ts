import { expect, test } from '@playwright/test'

import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

async function frame(page: import('@playwright/test').Page): Promise<number> {
  return page.locator('canvas').first().evaluate(el => {
    const png = (el as HTMLCanvasElement).toDataURL()
    let hash = 2166136261
    for (let i = 0; i < png.length; i++) hash = Math.imul(hash ^ png.charCodeAt(i), 16777619)
    return hash >>> 0
  })
}

test('zoom and rotation redraw the canvas after creating and switching boards (#715)', async ({ page }) => {
  const glErrors: string[] = []
  page.on('console', message => {
    if (message.text().includes('INVALID_OPERATION')) glErrors.push(message.text())
  })
  await createRoom(page)
  await waitForRoomReady(page)
  await drawStroke(page, [[320, 300], [520, 300]])
  await waitForOperations(page, 'stroke')
  const first = await page.evaluate(() => window.__roomStore!.getState().boardId)
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await page.waitForFunction(id => window.__roomStore!.getState().boardId !== id, first)
  await waitForRoomReady(page)
  const second = await page.evaluate(() => window.__roomStore!.getState().boardId)
  for (const index of [1, 0, 1]) {
    const tiles = page.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]')
    await tiles.nth(index).click()
    await page.waitForFunction(id => window.__roomStore!.getState().boardId === id, index === 0 ? first : second)
    await waitForRoomReady(page)
    const beforeZoom = await frame(page)
    await page.evaluate(() => {
      const store = window.__roomStore!.getState()
      store.setViewport({ ...store.viewport, zoom: store.viewport.zoom * 1.3 })
    })
    await expect.poll(() => frame(page), { message: 'zoom must change the rendered sheet' }).not.toBe(beforeZoom)
    const beforeRotation = await frame(page)
    await page.evaluate(() => {
      const store = window.__roomStore!.getState()
      store.setViewport({ ...store.viewport, angle: 0.3 })
    })
    await expect.poll(() => frame(page), { message: 'rotation must change the rendered sheet' }).not.toBe(beforeRotation)
  }
  expect(glErrors).toEqual([])
})
