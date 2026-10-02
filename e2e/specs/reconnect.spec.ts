import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

import {
  activeLayerId, createRoom, drawStroke, INK, joinRoom, maxDarknessOverContent,
  operations, waitForOperations, waitForRoomReady,
} from '../support/room'
import { slow } from '../support/pace'

/** (#690) Offline emulation does not reliably close an already-open WebSocket.
 * Cut the actual transport too, and refuse new sockets until the network is
 * restored. Without this the tests can pass while both people remain online. */
async function interruptTransport(page: Page): Promise<{ cut(): Promise<void>; restore(): void }> {
  let offline = false
  const sockets = new Set<WebSocketRoute>()
  await page.routeWebSocket(/socket\.io/, ws => {
    if (offline) { void ws.close(); return }
    const server = ws.connectToServer()
    sockets.add(ws)
    ws.onClose(() => { sockets.delete(ws); void server.close() })
    server.onClose(() => { sockets.delete(ws); void ws.close() })
  })
  return {
    async cut() {
      offline = true
      await Promise.all([...sockets].map(ws => ws.close()))
      sockets.clear()
    },
    restore() { offline = false },
  }
}

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
  test('work drawn offline reaches the server once the connection returns', { tag: '@two-browsers' }, async ({ page, browser, context }) => {
    const transport = await interruptTransport(page)
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    await drawStroke(page, [[320, 260], [640, 260]])
    await waitForOperations(page, 'stroke', 1)

    await context.setOffline(true)
    await transport.cut()
    await expect(page.getByRole('status').filter({ hasText: 'No connection' })).toBeVisible()

    // Painted locally with no server in reach — the optimistic local island.
    // If this stopped working, a dropped wifi would mean a pen that does
    // nothing, which is the failure everything else here exists to prevent.
    await drawStroke(page, [[320, 420], [640, 420]])
    await waitForOperations(page, 'stroke', 2)
    const layer = await activeLayerId(page)
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)

    transport.restore()
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
        { timeout: slow(45_000), message: 'the offline stroke should reach the server after reconnecting' },
      ).toBe(2)

      const witnessLayer = await activeLayerId(witnessPage)
      expect(await maxDarknessOverContent(witnessPage, witnessLayer)).toBeGreaterThan(INK)
    } finally {
      await witness.close()
    }
  })

  // (#493) The other direction, and until now the untested one. The student's
  // wifi drops, the teacher keeps drawing, the wifi comes back: the rejoin's
  // `room_state` carries what the student missed, and it has to land in an
  // engine that is already open — the catch-up path, not the join one.
  //
  // Found by breaking it on purpose: with the tail replay disabled for
  // catch-ups only, every other scenario in this suite still passed. The join
  // path is covered many times over, because every test opens a room; the
  // catch-up path is only reached by a reconnect *while someone else draws*,
  // and nothing did that.
  test('what was drawn while a student was offline reaches them when they return', { tag: '@two-browsers' }, async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    const transport = await interruptTransport(studentPage)
    try {
      await joinRoom(studentPage, roomId)
      await drawStroke(page, [[320, 260], [640, 260]])
      await waitForOperations(page, 'stroke', 1)
      await waitForOperations(studentPage, 'stroke', 1)

      await student.setOffline(true)
      await transport.cut()
      await expect(studentPage.getByRole('status').filter({ hasText: 'No connection' })).toBeVisible()
      // Drawn while the student cannot hear about it: no live packet, no
      // `operation_confirmed`. The only way it reaches them is the tail of the
      // `room_state` their rejoin will be answered with.
      await drawStroke(page, [[320, 420], [640, 420]])
      await waitForOperations(page, 'stroke', 2)
      // Long enough for the student's socket to notice it is gone; otherwise
      // the packet could still be sitting in a buffer that survives.
      await studentPage.waitForTimeout(3000)
      expect((await operations(studentPage)).filter(op => op.type === 'stroke')).toHaveLength(1)

      transport.restore()
      await student.setOffline(false)
      await expect.poll(
        async () => (await operations(studentPage)).filter(op => op.type === 'stroke').length,
        { timeout: slow(45_000), message: 'the stroke drawn while offline should arrive with the rejoin' },
      ).toBe(2)
      const layer = await activeLayerId(studentPage)
      expect(await maxDarknessOverContent(studentPage, layer)).toBeGreaterThan(INK)
    } finally {
      await student.close()
    }
  })

  // (#289 §17, #493) The one thing a dropped connection is allowed to refuse.
  // A structural change to a layer that is already shared — deleting it here —
  // can only be settled by the server, so offline it is refused up front and
  // said so, rather than queued to land minutes later against a room that has
  // moved on. The branch lives in dispatchOp and nothing reached it until the
  // dispatch code was about to move out of Room.
  test('deleting a shared layer offline is refused, visibly, and nothing is queued', async ({ page, context }) => {
    const transport = await interruptTransport(page)
    await createRoom(page)
    await waitForRoomReady(page)
    await page.getByRole('button', { name: 'Add layer' }).click()
    await waitForOperations(page, 'layer_add', 1)
    const upper = await activeLayerId(page)
    // Confirmed by the server first — a layer still waiting on its own
    // layer_add is this client's local island, and deleting that works offline
    // on purpose.
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()

    await context.setOffline(true)
    await transport.cut()
    await expect(page.getByRole('status').filter({ hasText: 'No connection' })).toBeVisible({ timeout: slow(20_000) })

    const name = await page.evaluate(id => window.__roomStore!.getState().layerState.items[id]?.name, upper)
    if (!name) throw new Error('e2e: the new layer is not in the store')
    const row = page
      .locator('div', { has: page.getByText(name, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'More' }) })
      .last()
    await row.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    await expect(page.getByText(/No connection to the project/)).toBeVisible()
    expect((await operations(page)).filter(op => op.type === 'layer_delete')).toHaveLength(0)
    expect(await page.evaluate(id => !!window.__roomStore!.getState().layerState.items[id], upper)).toBe(true)

    transport.restore()
    await context.setOffline(false)
  })
})
