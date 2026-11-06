import { expect, test } from '@playwright/test'
import type { Operation } from '../../packages/shared/src'
import { createRoom, drawStroke, operations, waitForOperations, waitForRoomReady } from '../support/room'

test('a rapid B-C-B UI turn emits only the newest B intent and saves ink on B', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const wires: { joins: string[] }[] = []
  let ready = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const expected = /\/thumbnail$/.test(message.location().url) && (/status of 429/.test(message.text()) || !ready && /status of 403/.test(message.text()))
    if (expected) test.info().annotations.push({ type: 'expected-thumbnail-refusal', description: message.text() })
    else errors.push(`${message.location().url}: ${message.text()}`)
  })
  page.on('websocket', socket => {
    if (!socket.url().includes('/socket.io/')) return
    const wire = { joins: [] as string[] }; wires.push(wire)
    socket.on('framesent', ({ payload }) => {
      const raw = String(payload)
      if (!raw.startsWith('42')) return
      try {
        const data = JSON.parse(raw.slice(raw.indexOf('['))) as [string, { roomId?: string }]
        if (data[0] === 'join_room' && data[1].roomId) wire.joins.push(data[1].roomId)
      } catch { /* Engine.IO control/binary frames are not join requests. */ }
    })
  })
  const room = await createRoom(page)
  await waitForRoomReady(page); ready = true
  const add = async (name: string) => {
    const response = await page.request.post(`/api/rooms/${room}/boards`, { data: { name } })
    expect(response.status()).toBe(201)
    return await response.json() as { id: string }
  }
  const b = await add('B'), c = await add('C')
  const toggle = page.getByRole('button', { name: 'Boards', exact: true })
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
  await expect(page.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]')).toHaveCount(3)
  await expect.poll(() => wires.length).toBeGreaterThan(0)
  const source = wires.at(-1)!
  const before = source.joins.length
  // Real React handlers in one task: each turn waits for the same idle
  // outbox. Matching the final board string cannot distinguish B1 from B3.
  await page.getByRole('region', { name: 'Boards' }).evaluate(region => {
    const tiles = [...region.querySelectorAll<HTMLElement>('[role="button"][aria-pressed]')]
    for (const index of [1, 2, 1]) tiles[index].click()
  })
  await page.waitForFunction(id => window.__roomStore!.getState().boardId === id, b.id)
  await waitForRoomReady(page)
  expect(source.joins.slice(before)).toEqual([b.id])
  await toggle.click()
  await expect(page.getByRole('region', { name: 'Boards' })).not.toBeVisible()
  await drawStroke(page, [[500, 250], [580, 280]])
  await waitForOperations(page, 'stroke')
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  const stroke = (await operations(page)).find(op => op.type === 'stroke')!
  const history = async (id: string) => {
    const response = await page.request.get(`/api/rooms/${id}/operations?beforeSeq=10000&limit=500`)
    expect(response.status()).toBe(200)
    return await response.json() as Operation[]
  }
  await expect.poll(async () => (await history(b.id)).some(op => op.id === stroke.id)).toBe(true)
  expect((await history(c.id)).filter(op => op.type === 'stroke')).toHaveLength(0)
  expect(errors).toEqual([])
})
