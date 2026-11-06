import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinRoom, operations, waitForRoomReady } from '../support/room'
import type { PencilEngine } from '../../apps/web/src/engine'

async function exportImage(page: Page) {
  return page.evaluate(async () => {
    const blob = await window.__engine!.exportPNG(true)
    if (!blob) throw new Error('No canonical export')
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No image URL'))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  })
}
async function compareImages(page: Page, before: string, after: string) {
  return page.evaluate(async ([aURL, bURL]) => {
    const read = async (url: string) => {
      const image = await createImageBitmap(await (await fetch(url)).blob())
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, canvas.width, canvas.height)
      } finally { image.close() }
    }
    const a = await read(aURL), b = await read(bURL)
    if (a.width !== b.width || a.height !== b.height) throw new Error('Export dimensions changed')
    let pixels = 0, components = 0, maxDelta = 0
    for (let i = 0; i < a.data.length; i += 4) {
      let changed = false
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(a.data[i + c] - b.data[i + c])
        if (delta) { changed = true; components++; maxDelta = Math.max(maxDelta, delta) }
      }
      if (changed) pixels++
    }
    return { pixels, components, maxDelta }
  }, [before, after])
}

test('100 snapshot strokes plus six native chunked charcoal/pencil gestures survive both cold joins', async ({ page, browser }) => {
  test.setTimeout(300_000)
  const pageErrors: string[] = [], responses: Array<{ status: number; path: string; error: unknown; ready: boolean }> = []
  const checks: Promise<void>[] = []
  const observe = (target: Page) => {
    let ready = false
    target.on('pageerror', error => pageErrors.push(error.message))
    target.on('response', response => {
      const path = new URL(response.url()).pathname
      if (!path.startsWith('/api/') || response.status() < 400) return
      const joined = ready
      checks.push((async () => {
        const body = await response.json() as { error?: unknown }
        responses.push({ status: response.status(), path, error: body.error, ready: joined })
      })())
    })
    return () => { ready = true }
  }
  const authorReady = observe(page)
  const roomId = await createRoom(page, 'QA673 long stroke rejoin')
  await waitForRoomReady(page); authorReady()
  // Native pointer pipeline emits packed operations through the real room's
  // onLocalOperation/socket/ACK path. It does not inject fabricated log entries.
  await page.evaluate(async () => {
    await window.__engine!.paperReady()
    const engine = window.__engine as PencilEngine
    const pointer = engine as unknown as { _onStart(p: object): void; _onMove(p: object): void; _onEnd(p: object): void }
    engine.setTool('pencil'); engine.setPencil('HB'); engine.setSize(8)
    let tick = 0
    const sample = (x: number, y: number) => ({ x, y, pressure: .73, tiltX: 0, tiltY: 0, speed: .8, pointerType: 'pen', timeStamp: performance.now() + tick++ * 4 })
    for (let i = 0; i < 100; i++) {
      const x = 150.1234567 + (i % 10) * 45, y = 150.2345678 + Math.floor(i / 10) * 22
      pointer._onStart(sample(x, y)); pointer._onMove(sample(x + 10, y + .1)); pointer._onEnd(sample(x + 20, y + .2))
    }
  })
  await expect.poll(async () => (await operations(page)).filter(op => op.type === 'stroke').length).toBe(100)
  await expect.poll(async () => {
    const response = await page.request.get(`/api/rooms/${roomId}/snapshots/index`)
    return response.status() === 200 ? (await response.json() as { seq: number }).seq : 0
  }, { timeout: 90_000 }).toBe(100)
  console.log('QA673 prefix: snapshot100, strokes100')
  const chunks = await page.evaluate(() => {
    const engine = window.__engine as PencilEngine
    const pointer = engine as unknown as { _onStart(p: object): void; _onMove(p: object): void; _onEnd(p: object): void }
    const counts: number[] = []
    let tick = 0
    const sample = (x: number, y: number) => ({ x, y, pressure: .68 + .12 * Math.sin(tick / 7), tiltX: 3.2, tiltY: -2.3, speed: .8, pointerType: 'pen', timeStamp: performance.now() + tick++ * 4 })
    for (const tool of ['charcoal', 'pencil'] as const) for (let i = 0; i < 3; i++) {
      engine.setTool(tool); engine.setPencil(tool === 'charcoal' ? 'vine' : 'HB'); engine.setSize(8)
      const before = engine.getOperations().filter(op => op.type === 'stroke').length
      const row = 450 + (tool === 'pencil' ? 160 : 0) + i * 40
      let x = 120.123456789, y = row + .23456789, n = 0
      pointer._onStart(sample(x, y))
      // Stop after the engine itself emits its first 800-dab chunk; pen-up
      // then supplies the second operation. Exactly six gestures,12 tail ops.
      while (engine.getOperations().filter(op => op.type === 'stroke').length === before) {
        if (++n > 2000) throw new Error('Native long gesture did not chunk')
        const phase = (n * 7) % 1400
        x = 120.123456789 + (phase <= 700 ? phase : 1400 - phase)
        y = row + .23456789 + n * .035
        pointer._onMove(sample(x, y))
      }
      pointer._onEnd(sample(x + .5, y + .1))
      counts.push(engine.getOperations().filter(op => op.type === 'stroke').length - before)
    }
    return counts
  })
  console.log('QA673 native gesture chunks:', JSON.stringify(chunks))
  expect(chunks).toEqual([2, 2, 2, 2, 2, 2])
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  const original = (await operations(page)).filter(op => op.type === 'stroke')
  expect(original).toHaveLength(112)
  expect(new Set(original.slice(100).map(op => op.strokeId)).size).toBe(6)
  const before = await exportImage(page)
  await joinRoom(page, roomId, 'Teacher')
  await expect.poll(async () => (await operations(page)).filter(op => op.type === 'stroke').length).toBe(112)
  expect((await operations(page)).filter(op => op.type === 'stroke').map(op => op.id)).toEqual(original.map(op => op.id))
  expect(await page.evaluate(() => window.__engine!.getOperationsSinceRestore().filter(op => op.type === 'stroke').length)).toBe(12)
  const authorDiff = await compareImages(page, before, await exportImage(page))
  console.log('QA673 native long rejoin:', JSON.stringify({ role: 'author', chunks, ...authorDiff }))
  expect.soft(authorDiff).toEqual({ pixels: 0, components: 0, maxDelta: 0 })
  const observer = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const peer = await observer.newPage(); const peerReady = observe(peer); await joinRoom(peer, roomId, 'Observer'); peerReady()
    await expect.poll(async () => (await operations(peer)).filter(op => op.type === 'stroke').length).toBe(112)
    expect((await operations(peer)).filter(op => op.type === 'stroke').map(op => op.id)).toEqual(original.map(op => op.id))
    expect(await peer.evaluate(() => window.__engine!.getOperationsSinceRestore().filter(op => op.type === 'stroke').length)).toBe(12)
    const peerDiff = await compareImages(peer, before, await exportImage(peer))
    console.log('QA673 native long rejoin:', JSON.stringify({ role: 'observer', ...peerDiff }))
    expect.soft(peerDiff).toEqual({ pixels: 0, components: 0, maxDelta: 0 })
    await Promise.all(checks)
    console.log('QA673 HTTP diagnostics:', JSON.stringify(responses))
    expect(pageErrors).toEqual([])
    // A bootstrap attempt from a cold reader may race an existing checkpoint.
    // Verify that specific refusal; never treat arbitrary API errors as success.
    for (const result of responses) {
      if (result.path.endsWith('/thumbnail')) {
        // StrictMode startup cleanup can finish before create_room/join_room;
        // thumbnail authorization correctly refuses it. Live previews also
        // have an explicit server-side3s interval (ADR015).
        expect([403, 429]).toContain(result.status)
        expect(result.error).toBe(result.status === 429 ? 'rate_limited' : 'forbidden')
        if (result.status === 403) expect(result.ready).toBe(false)
        continue
      }
      expect(result.status).toBe(400)
      expect(result.path).toMatch(/\/snapshots$/)
      expect(result.error).toBe('not_a_checkpoint_seq')
    }
  } finally { await observer.close() }
})
