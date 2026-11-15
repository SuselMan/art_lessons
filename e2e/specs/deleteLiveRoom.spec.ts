import { expect, test, type Page } from '@playwright/test'
import { createRoom, drawStroke, joinRoom, waitForOperations, waitForRoomReady } from '../support/room'

test('deleting a live lesson revokes owner and board viewers while preserving their visible draft', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  let deleting = false
  let creatorReady = false
  const watch = (target: Page) => {
    target.on('pageerror', error => errors.push(error.message))
    target.on('response', response => { if (response.status() >= 500) errors.push(`HTTP ${response.status()} ${response.url()}`) })
    target.on('console', message => {
      if (message.type() !== 'error') return
      // The initial empty thumbnail can race create_room before an owner
      // exists. Deliberate throttle and revoked in-flight uploads are also
      // expected HTTP refusals; JS errors and HTTP5xx remain fatal.
      const expected = /\/thumbnail$/.test(message.location().url) && (/status of 429/.test(message.text())
        || !creatorReady && /status of 403/.test(message.text()))
        || deleting && /\/api\/rooms\/[^/]+\/(snapshots|thumbnail)/.test(message.location().url) && /status of 403/.test(message.text())
      if (expected) test.info().annotations.push({ type: 'expected-http-refusal', description: message.text() })
      else errors.push(`${message.location().url}: ${message.text()}`)
    })
  }
  watch(page)
  const room = await createRoom(page, 'Delete live lesson')
  await waitForRoomReady(page)
  creatorReady = true
  const created = await page.request.post(`/api/rooms/${room}/boards`, { data: { name: 'Student board' } })
  expect(created.status()).toBe(201)
  const board = await created.json() as { id: string }
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  try {
    const peer = await context.newPage()
    watch(peer)
    await joinRoom(peer, room, 'Student')
    const toggle = peer.getByRole('button', { name: 'Boards', exact: true })
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
    await peer.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]').filter({ hasText: 'Student board' }).click()
    await peer.waitForFunction(id => window.__roomStore!.getState().boardId === id, board.id)
    await waitForRoomReady(peer)
    await drawStroke(peer, [[500, 250], [580, 280]])
    await waitForOperations(peer, 'stroke')
    await expect(peer.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
    const painted = () => peer.evaluate(() => window.__engine!.liveLayerIds().some(id => window.__engine!.hasLayerContent(id)))
    expect(await painted()).toBe(true)
    deleting = true
    expect((await page.request.delete(`/api/rooms/${room}`)).status()).toBe(200)
    const warning = 'The host has removed your access to this project. Nothing you draw from now on will be saved.'
    await expect(page.getByText(warning, { exact: true })).toBeVisible()
    await expect(peer.getByText(warning, { exact: true })).toBeVisible()
    expect(await painted()).toBe(true)
    expect((await page.request.get(`/api/rooms/${room}/snapshots/index`)).status()).toBe(403)
    expect((await peer.request.get(`/api/rooms/${board.id}/snapshots/index`)).status()).toBe(403)
    expect(errors).toEqual([])
  } finally { await context.close() }
})
