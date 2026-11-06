import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import { packDabs, type ClientToServerEvents, type Dab, type ServerToClientEvents } from '../../packages/shared/src'
import { activeLayerId, contentBounds, createRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

async function inkHashes(page: Page, layerId: string) {
  return page.evaluate(async id => {
    const engine = window.__engine as unknown as { _layers: Map<string, { allResident(): Array<{ originX: number; originY: number; buffer: { readPixels(): Uint8Array } }> }> }
    const hashes: string[] = []
    for (const tile of engine._layers.get(id)!.allResident()) {
      const pixels = tile.buffer.readPixels()
      if (!pixels.some((value, i) => i % 4 === 3 && value > 0)) continue
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pixels)))
      hashes.push(`${tile.originX},${tile.originY}:` + [...digest].map(v => v.toString(16).padStart(2, '0')).join(''))
    }
    return hashes.sort()
  }, layerId)
}

test('terminal refusal after ordinary UP removes live pixels and preserves accepted chunks', async ({ page, playwright }) => {
  test.setTimeout(180_000)
  const request = await playwright.request.newContext({ baseURL: new URL(test.info().project.use.baseURL!).origin })
  let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined
  const errors: string[] = []
  const cancellations: string[] = []
  page.on('websocket', wire => wire.on('framereceived', ({ payload }) => {
    const raw = String(payload)
    if (!raw.startsWith('42')) return
    const event = JSON.parse(raw.slice(raw.indexOf('['))) as [string, { strokeId?: string; cancelled?: boolean }]
    if (event[0] === 'peer_stroke_live_end' && event[1].cancelled && event[1].strokeId) cancellations.push(event[1].strokeId)
  }))
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (/\/thumbnail$/.test(message.location().url) && /status of (403|429)/.test(message.text())) {
      test.info().annotations.push({ type: 'expected-thumbnail-refusal', description: message.text() })
    } else errors.push(`${message.location().url}: ${message.text()}`)
  })
  try {
    const room = await createRoom(page)
    await waitForRoomReady(page)
    const layerId = await activeLayerId(page)
    expect((await request.get('/api/me')).status()).toBe(200)
    const cookie = (await request.storageState()).cookies.map(c => `${c.name}=${c.value}`).join('; ')
    socket = io(new URL(page.url()).origin, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, forceNew: true, autoConnect: false })
    const sender = socket
    await new Promise<void>((resolve, reject) => { sender.once('connect', resolve); sender.once('connect_error', reject); sender.connect() })
    const joined = await sender.timeout(10_000).emitWithAck('join_room', { roomId: room, name: 'Raw live author' })
    if (!joined.ok) throw new Error(joined.error)
    const strokeId = randomUUID()
    const dabs = (x: number, y: number): Dab[] => Array.from({ length: 16 }, (_, i) => ({ x: x + i * 8, y, pressure: 0.9, tiltX: 0, tiltY: 0, size: 36, aspectRatio: 1, angle: 0, opacity: 0.9, t: i * 20 }))
    const first = dabs(300, 400), tail = dabs(900, 1100)
    const common = { strokeId, layerId, tool: 'pencil' as const, preset: 'HB', color: [0.1, 0.1, 0.1] as [number, number, number] }
    sender.emit('stroke_live', { ...common, packetSeq: 0, dabsPacked: packDabs(first) })
    await expect.poll(() => contentBounds(page, layerId)).not.toBeNull()
    const accepted = { ...common, id: randomUUID(), type: 'stroke' as const, userId: joined.userId, timestamp: Date.now(), dabs: first }
    expect(await sender.timeout(10_000).emitWithAck('operation', accepted)).toMatchObject({ ok: true })
    await waitForOperations(page, 'stroke')
    const canonical = await inkHashes(page, layerId)
    expect(canonical.length).toBeGreaterThan(0)
    sender.emit('stroke_live', { ...common, packetSeq: 1, dabsPacked: packDabs(tail) })
    await expect.poll(() => inkHashes(page, layerId)).not.toEqual(canonical)
    sender.emit('stroke_live_end', { strokeId })
    const frozen = new Promise<void>(resolve => sender.once('room_frozen_changed', () => resolve()))
    await page.getByRole('button', { name: 'Open Class' }).click()
    await page.getByRole('button', { name: 'Freeze project' }).click()
    await frozen
    const refused = { ...accepted, id: randomUUID(), dabs: tail }
    expect(await sender.timeout(10_000).emitWithAck('operation', refused)).toEqual({ ok: false, reason: 'room_frozen' })
    // Room freeze already has a client resync fallback. Pixel cleanup alone
    // would pass before the fix; require the explicit terminal wire verdict.
    await expect.poll(() => cancellations).toContain(strokeId)
    await expect.poll(() => inkHashes(page, layerId)).toEqual(canonical)
    const ids = (await operations(page)).map(op => op.id)
    expect(ids).toContain(accepted.id)
    expect(ids).not.toContain(refused.id)
    expect(sender.connected).toBe(true)
    expect(errors).toEqual([])
  } finally { socket?.close(); await request.dispose() }
})
