import { expect, test } from '@playwright/test'

import { strokeDabs } from '../../packages/shared/src/index'

import { createRoom, drawStroke, operations, waitForOperations, waitForRoomReady } from '../support/room'

// #865: first input must work before a viewport gesture happens to synchronize
// the deferred engine. Device density magnifies the old fallback-coordinate error.
for (const dpr of [1, 1.5, 2]) {
  test.describe(`pen alignment at DPR ${dpr}`, () => {
    test.use({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: dpr })
    test('first stroke follows the pointer after entry and a board change', async ({ page }) => {
      await createRoom(page)
      await waitForRoomReady(page)
      for (const board of [0, 1]) {
        if (board) {
          const old = await page.evaluate(() => window.__roomStore!.getState().boardId)
          await page.getByRole('button', { name: 'Boards', exact: true }).click()
          await page.getByRole('button', { name: 'New board', exact: true }).click()
          await page.waitForFunction(id => window.__roomStore!.getState().boardId !== id, old)
          await waitForRoomReady(page)
          // Close the strip so it cannot intercept the measured input.
          await page.getByRole('button', { name: 'Boards', exact: true }).click()
        }
        const expected = await page.evaluate(() => {
          const s = window.__roomStore!.getState()
          const v = s.viewport
          const dx = (650 - v.cx) / v.zoom, dy = (350 - v.cy) / v.zoom
          return {
            zoom: v.zoom,
            x: (s.room!.width / 2) + dx * Math.cos(v.angle) + dy * Math.sin(v.angle),
            y: (s.room!.height / 2) - dx * Math.sin(v.angle) + dy * Math.cos(v.angle),
          }
        })
        await drawStroke(page, [[650, 350], [720, 350], [780, 350]])
        await waitForOperations(page, 'stroke')
        const stroke = (await operations(page)).find(op => op.type === 'stroke')
        if (!stroke || stroke.type !== 'stroke') throw new Error('No recorded stroke')
        const first = strokeDabs(stroke)[0]
        // The backing-store pixel budget rounds dimensions independently.
        // Measure alignment in CSS pixels, allowing at most half a pixel.
        const error = Math.hypot(first.x - expected.x, first.y - expected.y) * expected.zoom
        expect(error).toBeLessThan(0.5)
      }
    })
  })
}
