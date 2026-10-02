import { expect, test, type Page } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import { randomUUID } from 'node:crypto'

import { activeLayerId, createRoom, drawStroke, joinRoom, waitForOperations, waitForRoomReady } from '../support/room'

async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const e = window.__engine as unknown as { _rebuildJobs: Map<string, unknown>; _settle: unknown; _opQueue: unknown[] }
    return e._rebuildJobs.size === 0 && !e._settle && e._opQueue.length === 0
  }), { timeout: 90_000 }).toBe(true)
}

async function hashes(page: Page, layerId: string) {
  return page.evaluate(async id => {
    const e = window.__engine as unknown as { _layers: Map<string, { allResident(): Array<{ originX: number; originY: number; buffer: { readPixels(): Uint8Array } }> }> }
    const out: Array<{ x: number; y: number; hash: string }> = []
    for (const t of e._layers.get(id)!.allResident()) {
      const pixels = t.buffer.readPixels()
      if (!pixels.some((v, i) => i % 4 === 3 && v > 0)) continue
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pixels)))
      out.push({ x: t.originX, y: t.originY, hash: [...digest].map(v => v.toString(16).padStart(2, '0')).join('') })
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x)
  }, layerId)
}

test('five watercolor authors survive undo, late continuation, redo and fresh replay without finished-wash spills', { tag: '@two-browsers' }, async ({ page, browser, playwright }) => {
  test.setTimeout(180_000)
  const sockets: Socket[] = []
  const requests = []
  const contexts = []
  try {
    const roomId = await createRoom(page, 'QA five watercolor cache histories')
    await waitForRoomReady(page)
    const layerId = await activeLayerId(page)
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
    contexts.push(context)
    const peer = await context.newPage()
    await joinRoom(peer, roomId, 'Raster witness')
    const box = (await page.locator('canvas').first().boundingBox())!
    await drawStroke(page, [[box.width / 2 - 80, box.height / 2], [box.width / 2 + 80, box.height / 2]], { size: 30 })
    await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke')))
    const donors: Array<{ socket: Socket; userId: string; washId: string }> = []
    for (let i = 0; i < 5; i++) {
      const request = await playwright.request.newContext({ baseURL: new URL(page.url()).origin, ignoreHTTPSErrors: true })
      requests.push(request)
      expect((await request.get('/api/me')).ok()).toBe(true)
      const cookie = (await request.storageState()).cookies.map(c => `${c.name}=${c.value}`).join('; ')
      const socket = io(new URL(page.url()).origin, { transports: ['websocket'], rejectUnauthorized: false, extraHeaders: { Cookie: cookie }, forceNew: true, autoConnect: false })
      sockets.push(socket)
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect() })
      const joined = await socket.timeout(10_000).emitWithAck('join_room', { roomId, name: `Watercolor author ${i + 1}` }) as { ok: boolean; userId: string }
      expect(joined.ok).toBe(true)
      donors.push({ socket, userId: joined.userId, washId: randomUUID() })
    }
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().participants.length)).toBe(7)
    const paint = async (i: number, y: number) => {
      const donor = donors[i], id = randomUUID()
      const ack = await donor.socket.timeout(10_000).emitWithAck('operation', {
        id, type: 'stroke', strokeId: id, washId: donor.washId, userId: donor.userId, layerId, timestamp: Date.now(),
        tool: 'watercolor', preset: 'normal:55:60:PB29:round', color: [0.1 + i * 0.1, 0.2, 0.5],
        dabs: Array.from({ length: 8 }, (_, n) => ({ x: 780 + i * 10 + n * 16, y: y + n * 4, pressure: 0.8, tiltX: 0, tiltY: 0, size: 40, aspectRatio: 1, angle: 0, opacity: 0.5, t: n * 20 })),
      }) as { ok: boolean }
      expect(ack.ok).toBe(true)
    }
    await Promise.all(donors.map((_, i) => paint(i, 1100 + i * 30)))
    await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke', 6)))
    await Promise.all([page, peer].map(settled))
    const firstWash = await page.evaluate(() => window.__engine!.getOperations().find(o => o.type === 'stroke' && o.tool === 'watercolor')!)
    if (firstWash.type !== 'stroke') throw new Error('missing watercolor')
    const firstDonor = donors.findIndex(d => d.washId === firstWash.washId)
    expect(firstDonor).toBeGreaterThanOrEqual(0)
    for (const p of [page, peer]) await p.evaluate(() => {
      const e = window.__engine as unknown as { gl: WebGLRenderingContext; _inJobStep: boolean }
      const read = e.gl.readPixels.bind(e.gl)
      const probe = { readsInRebuild: 0 }
      Object.assign(window, { __qaSpill: probe })
      e.gl.readPixels = (...args: Parameters<WebGLRenderingContext['readPixels']>) => { if (e._inJobStep) probe.readsInRebuild++; return read(...args) }
    })
    // Hold one renderer after the first wash has been retired, then deliver
    // its continuation through the real server while that rebuild is live.
    await page.evaluate(washId => {
      const e = window.__engine as unknown as {
        _stepRebuildJob(job: { timer: ReturnType<typeof setTimeout> }): void;
        _swapRebuiltLayer(job: { timer: ReturnType<typeof setTimeout> }): void;
        _lostWashes: Map<string, unknown>; _rebuildJobs: Map<string, unknown>;
      }
      const swap = e._swapRebuiltLayer.bind(e)
      const gate = { held: false, released: false }
      Object.assign(window, { __qaRebuildGate: gate })
      e._swapRebuiltLayer = job => {
        if (!gate.released) {
          if (!e._lostWashes.has(washId)) throw new Error('fixture did not retire the first wash')
          gate.held = true
          job.timer = setTimeout(() => e._stepRebuildJob(job), 16)
          return
        }
        swap(job)
      }
    }, donors[firstDonor].washId)
    const undo = await page.evaluate(() => {
      const e = window.__engine! as typeof window.__engine & { _rebuildJobs: Map<string, unknown> }
      const target = e!.undo()
      return { type: target?.type, jobs: e!._rebuildJobs.size }
    })
    expect(undo.type).toBe('stroke')
    expect(undo.jobs).toBeGreaterThan(0)
    await Promise.all([page, peer].map(p => waitForOperations(p, 'operation_undo')))
    await expect.poll(() => page.evaluate(() => (window as unknown as { __qaRebuildGate: { held: boolean } }).__qaRebuildGate.held), { timeout: 30_000 }).toBe(true)
    await paint(firstDonor, 1350)
    await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke', 6)))
    await page.evaluate(() => { (window as unknown as { __qaRebuildGate: { released: boolean } }).__qaRebuildGate.released = true })
    await Promise.all([page, peer].map(settled))
    for (const p of [page, peer]) expect(await p.evaluate(() => (window as unknown as { __qaSpill: { readsInRebuild: number } }).__qaSpill.readsInRebuild)).toBe(0)
    const reference = await hashes(page, layerId)
    expect(reference.length).toBeGreaterThan(0)
    expect(await hashes(peer, layerId)).toEqual(reference)
    await page.evaluate(() => window.__engine!.redo())
    await Promise.all([page, peer].map(p => waitForOperations(p, 'operation_redo')))
    await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke', 7)))
    await Promise.all([page, peer].map(settled))
    expect(await hashes(peer, layerId)).toEqual(await hashes(page, layerId))
    const lateContext = await browser.newContext({ ignoreHTTPSErrors: true })
    contexts.push(lateContext)
    const late = await lateContext.newPage()
    await joinRoom(late, roomId, 'Fresh replay witness')
    await waitForOperations(late, 'operation_redo')
    await settled(late)
    expect(await hashes(late, layerId)).toEqual(await hashes(page, layerId))
  } finally {
    for (const socket of sockets) socket.disconnect()
    for (const request of requests) await request.dispose()
    for (const context of contexts) await context.close()
  }
})
