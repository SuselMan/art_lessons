import { expect, test } from '@playwright/test'
import type { Operation } from '../../packages/shared/src'
import { createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

// The exact disconnect/move races are deterministic real Socket.IO tests in
// socketHandlers.test.ts. This browser check covers ordinary forced evacuation
// and drawing afterward, using the real DELETE, room_state and Postgres writes.
test('deleting an occupied board moves its participant to main with working drawing', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const guest = await context.newPage()
  const errors: string[] = []
  for (const tab of [page, guest]) {
    tab.on('pageerror', error => errors.push(error.message))
    tab.on('console', message => {
      if (message.type() !== 'error') return
      if (/\/thumbnail$/.test(message.location().url) && /status of (403|429)/.test(message.text())) {
        test.info().annotations.push({ type: 'expected-thumbnail-refusal', description: message.text() })
      } else errors.push(`${message.location().url}: ${message.text()}`)
    })
  }
  try {
    const room = await createRoom(page)
    await waitForRoomReady(page)
    const response = await page.request.post(`/api/rooms/${room}/boards`, { data: { name: 'Delete me' } })
    expect(response.status()).toBe(201)
    const board = await response.json() as { id: string }
    await joinRoom(guest, room, 'Board participant')
    const toggle = guest.getByRole('button', { name: 'Boards', exact: true })
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
    const tiles = guest.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]')
    await expect(tiles).toHaveCount(2)
    await tiles.nth(1).click()
    await guest.waitForFunction(id => window.__roomStore!.getState().boardId === id, board.id)
    await waitForRoomReady(guest)
    await toggle.click()
    const deleted = await page.request.delete(`/api/rooms/${room}/boards/${board.id}`)
    expect(deleted.status()).toBe(200)
    await guest.waitForFunction(id => window.__roomStore!.getState().boardId === id, room)
    await waitForRoomReady(guest)
    await drawStroke(guest, [[500, 250], [580, 280]])
    await waitForOperations(guest, 'stroke')
    await expect(guest.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
    const stroke = (await operations(guest)).find(op => op.type === 'stroke')!
    await expect.poll(async () => {
      const history = await guest.request.get(`/api/rooms/${room}/operations?beforeSeq=10000&limit=500`)
      expect(history.status()).toBe(200)
      return (await history.json() as Operation[]).some(op => op.id === stroke.id)
    }).toBe(true)
    await waitForOperations(page, 'stroke')
    expect((await operations(page)).some(op => op.id === stroke.id)).toBe(true)
    expect(errors).toEqual([])
  } finally { await context.close() }
})
