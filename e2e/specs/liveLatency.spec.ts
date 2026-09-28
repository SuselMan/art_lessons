import { expect, test } from '@playwright/test'

import { createRoom, joinRoom, setBrushSize, waitForRoomReady } from '../support/room'

/** (#432, трек #314 §11) The pen-to-ink meter, end to end: a teacher draws a
 *  slow stroke, the student's meter times every live packet on the frame that
 *  paints it. On localhost the network is nearly free, so what this pins is
 *  that the instrument works — clock synced, packets stamped, samples taken,
 *  numbers plausible — not the production figure, which has to be taken
 *  between two real devices on the real deploy. */

const BUDGET_MS = 200

test('a peer’s live stroke is timed pen to ink, and on localhost it is within budget',
  { tag: '@two-browsers' }, async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)
      // Both clocks have to be in step before a packet can be timed.
      for (const p of [page, studentPage]) {
        await expect.poll(() => p.evaluate(() => window.__liveLatency !== undefined)).toBe(true)
      }

      await setBrushSize(page, 24)
      const box = (await page.locator('canvas').first().boundingBox())!
      await page.mouse.move(box.x + 300, box.y + 300)
      await page.mouse.down()
      // Slow enough for many 60 ms packets.
      for (let i = 1; i <= 30; i++) {
        await page.mouse.move(box.x + 300 + i * 12, box.y + 300 + (i % 2) * 6)
        await page.waitForTimeout(40)
      }
      await page.mouse.up()

      await expect.poll(() => studentPage.evaluate(() => window.__liveLatency!.stats()?.count ?? 0))
        .toBeGreaterThan(5)
      const stats = (await studentPage.evaluate(() => window.__liveLatency!.stats()))!
      // Plausible: never negative beyond the clocks' own error, and pen to ink
      // is never less than its network-and-paint part.
      expect(stats.p50).toBeGreaterThan(-5)
      expect(stats.p95).toBeGreaterThanOrEqual(stats.sendP95)
      expect(stats.p95, `pen→ink p95 ${stats.p95} ms`).toBeLessThan(BUDGET_MS)
    } finally {
      await student.close()
    }
  })
