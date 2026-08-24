import { expect, test } from '@playwright/test'

import {
  activeLayerId, createRoom, drawStroke, INK, joinRoom, maxDarknessOverContent,
  operations, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#491) Drawing through a dropped connection, and what happens to it after.
 *
 *  This is the scenario the room has the most machinery for and the least
 *  evidence about: the outbox persists unsent operations to IndexedDB, retries
 *  them with backoff, parks the queue until a join completes, and re-arms
 *  everything on reconnect (#296, #298, #313, #358). All of that is unit
 *  tested against a fake `send`. None of it has ever been run against a real
 *  socket dropping underneath a real canvas.
 *
 *  The assertion is deliberately made from *another* browser rather than from
 *  the drawing one: the teacher's own screen shows the stroke either way,
 *  because it was painted optimistically the moment it was drawn. Whether it
 *  reached the server is a question only somebody else can answer. */
test.describe('a connection that drops mid-lesson', () => {
  test('work drawn offline reaches the server once the connection returns', async ({ page, browser, context }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    await drawStroke(page, [[320, 260], [640, 260]])
    await waitForOperations(page, 'stroke', 1)

    await context.setOffline(true)

    // Painted locally with no server in reach — the optimistic local island.
    // If this stopped working, a dropped wifi would mean a pen that does
    // nothing, which is the failure everything else here exists to prevent.
    await drawStroke(page, [[320, 420], [640, 420]])
    await waitForOperations(page, 'stroke', 2)
    const layer = await activeLayerId(page)
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)

    await context.setOffline(false)

    // Somebody else's browser, arriving after the reconnection. What it can
    // rebuild is exactly what the server kept.
    const witness = await browser.newContext()
    const witnessPage = await witness.newPage()
    try {
      await joinRoom(witnessPage, roomId)
      // Polled rather than awaited once: the socket reconnects on its own
      // backoff, then rejoins, and only then does the outbox drain. The point
      // is that it gets there, not how fast.
      await expect.poll(
        async () => (await operations(witnessPage)).filter(op => op.type === 'stroke').length,
        { timeout: 45_000, message: 'the offline stroke should reach the server after reconnecting' },
      ).toBe(2)

      const witnessLayer = await activeLayerId(witnessPage)
      expect(await maxDarknessOverContent(witnessPage, witnessLayer)).toBeGreaterThan(INK)
    } finally {
      await witness.close()
    }
  })
})
