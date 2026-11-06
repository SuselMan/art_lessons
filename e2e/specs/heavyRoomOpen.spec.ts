import { test, expect } from '@playwright/test'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { repoRoot } from '../support/database'
import { DATABASE_URL, BASE_URL } from '../support/stack'
import { androidPage } from '../support/androidPage'

type Database = typeof import('../../apps/server/src/db/prisma').prisma
type JsonInput = Parameters<Database['roomLayerState']['create']>[0]['data']['state']

type SourceRow =
  | { kind: 'room'; value: { paper: string; paperColor: string | null; width: number; height: number; infinite: boolean } }
  | { kind: 'structure'; value: { seq: number; state: JsonInput } }
  | { kind: 'snapshot'; value: { layerId: string; seq: number; hash: string; data: string } }
  | { kind: 'operation'; value: { id: string; seq: number; type: string; userId: string; layerId: string | null; tool: string | null; data: JsonInput } }

test('private heavy-room fixture: cold and warm joins retain pixels and cache immutable blobs', async ({ page }) => {
  test.skip(!process.env.E2E_ROOM_FIXTURE, 'Requires a private room export; production data is never committed')
  test.setTimeout(300_000)
  const req = createRequire(resolve(repoRoot, 'apps/server/package.json'))
  const { PrismaClient } = req('@prisma/client') as { PrismaClient: new (options: { datasources: { db: { url: string } } }) => Database }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })
  // DATABASE_URL is the isolated E2E stack, explicitly passed to Prisma.
  expect(new URL(DATABASE_URL).hostname).toBe('127.0.0.1')
  const roomId = randomBytes(6).toString('base64url')
  let mobile: Awaited<ReturnType<typeof androidPage>> | undefined
  try {
    await page.goto('/')
    const identity = await (await page.request.get('/api/me')).json() as { userId: string }
    const source: SourceRow[] = []
    for await (const line of createInterface({ input: createReadStream(process.env.E2E_ROOM_FIXTURE!), crlfDelay: Infinity })) source.push(JSON.parse(line) as SourceRow)
    const room = source.find((r): r is Extract<SourceRow, { kind: 'room' }> => r.kind === 'room')!.value
    const structure = source.find((r): r is Extract<SourceRow, { kind: 'structure' }> => r.kind === 'structure')!.value
    const snapshots = source.filter((r): r is Extract<SourceRow, { kind: 'snapshot' }> => r.kind === 'snapshot').map(r => r.value)
    const ops = source.filter((r): r is Extract<SourceRow, { kind: 'operation' }> => r.kind === 'operation').map(r => r.value)
    await db.room.create({ data: { id: roomId, ownerId: identity.userId, name: 'QA heavy room', paper: room.paper,
      paperColor: room.paperColor, canvasWidth: room.width, canvasHeight: room.height, infinite: room.infinite } })
    await db.roomLayerState.create({ data: { roomId, seq: structure.seq, state: structure.state } })
    for (let i = 0; i < ops.length; i += 50) await db.operation.createMany({ data: ops.slice(i, i + 50).map(op => ({ ...op, roomId })) })
    for (const snapshot of snapshots) await db.roomLayerSnapshot.create({ data: { roomId, layerId: snapshot.layerId, seq: snapshot.seq,
      hash: snapshot.hash, data: Uint8Array.from(Buffer.from(snapshot.data, 'base64')) } })
    console.log('QA425 source:', JSON.stringify({ operations: ops.length, snapshots: snapshots.length, compressedBytes: snapshots.reduce((n, s) => n + Buffer.from(s.data, 'base64').length, 0) }))
    const useMobile = process.env.E2E_DEVICE === 'samsung'
    let navigating = false, acceptedBeforeUnload = 0
    const dialogErrors: string[] = []
    if (useMobile) {
      if (!process.env.E2E_ANDROID_CDP) throw new Error('Samsung requires its paired CDP endpoint')
      mobile = await androidPage(process.env.E2E_ANDROID_CDP, `${BASE_URL}/?qa=room-open-425`)
      const target = mobile
      target.on('Page.javascriptDialogOpening', params => {
        if (navigating && params.type === 'beforeunload') {
          acceptedBeforeUnload++
          void target.call('Page.handleJavaScriptDialog', { accept: true }).catch(error => dialogErrors.push(String(error)))
        } else dialogErrors.push(`Unexpected dialog: ${String(params.type)}`)
      })
      await mobile.call('Page.enable')
      await mobile.call('Network.enable')
      await mobile.call('Network.setCacheDisabled', { cacheDisabled: false })
    }
    const cdp = useMobile ? undefined : await page.context().newCDPSession(page)
    if (cdp) {
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
      if (process.env.E2E_THROTTLE === '1') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100,
        downloadThroughput: 880 * 1024, uploadThroughput: 880 * 1024, connectionType: 'wifi' })
    }
    const evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => mobile ? await mobile.evaluate(fn) : await page.evaluate(fn)
    let previousImage: string | undefined
    const results = []
    let previousKeys: string[] | undefined, coldWire = 0, sawSteadyCache = false
    for (const phase of ['cold', 'repeat-1', 'repeat-2'] as const) {
      const started = performance.now()
      if (mobile) {
        navigating = true
        try { await mobile.call('Page.navigate', { url: `${BASE_URL}/room/${roomId}` }) }
        finally { navigating = false }
        await expect.poll(async () => await evaluate(() => !!document.querySelector('form input[type="text"]')), { timeout: 30_000 }).toBe(true)
        await evaluate(() => { const input = document.querySelector<HTMLInputElement>('form input[type="text"]')!; input.focus(); input.select() })
        await mobile.call('Input.insertText', { text: 'QA Samsung' })
        await evaluate(() => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click())
        await expect.poll(async () => await evaluate(() => !!window.__engine && !!document.querySelector('canvas')
          && getComputedStyle(document.querySelector('canvas')!).pointerEvents !== 'none'), { timeout: 120_000 }).toBe(true)
      } else {
        await page.goto(`/room/${roomId}`)
        await page.locator('form input[type="text"]').first().fill('QA owner')
        await page.locator('form button[type="submit"]').click()
        await page.waitForFunction(() => !!window.__engine && !!document.querySelector('canvas')
          && getComputedStyle(document.querySelector('canvas')!).pointerEvents !== 'none', undefined, { timeout: 120_000 })
      }
      const readyMs = performance.now() - started
      const result = await evaluate(async () => {
        await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
        const engine = window.__engine!, state = window.__roomStore!.getState()
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        const blobs = resources.filter(r => /\/snapshots\/[^/]+\/\d+(?:\?|$)/.test(new URL(r.name).pathname))
        const layers = Object.values(state.layerState.items).filter(l => l.kind === 'layer').map(l => ({ id: l.id, bounds: engine.getContentBounds(l.id) }))
        const image = await engine.exportPNG(true)
        if (!image) throw new Error('No complete export')
        const png = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No PNG'))
          reader.onerror = () => reject(reader.error); reader.readAsDataURL(image)
        })
        const gl = document.querySelector('canvas')!.getContext('webgl')!, ext = gl.getExtension('WEBGL_debug_renderer_info')
        return { png, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : 'unknown', blobKeys: blobs.map(r => new URL(r.name).pathname.split('/snapshots/')[1]).sort(), blobCount: blobs.length, blobWireBytes: blobs.reduce((n, r) => n + r.transferSize, 0), blobBodyBytes: blobs.reduce((n, r) => n + r.encodedBodySize, 0),
          blobCached: blobs.filter(r => r.transferSize === 0).length, layers, operations: engine.getOperations().length, tail: engine.getOperationsSinceRestore().length }
      })
      let changed = 0
      if (previousImage) changed = await page.evaluate(async ([aURL, bURL]) => {
        const read = async (url: string) => {
          const bitmap = await createImageBitmap(await (await fetch(url)).blob())
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close()
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data
        }
        const a = await read(aURL), b = await read(bURL)
        if (a.length !== b.length) throw new Error('Export dimensions changed')
        let count = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++
        return count
      }, [previousImage, result.png])
      previousImage = result.png
      const { png: _png, ...metrics } = result
      results.push({ device: useMobile ? 'samsung' : 'chromium', phase, readyMs, changed, acceptedBeforeUnload, ...metrics })
      console.log('QA425 open:', JSON.stringify(results.at(-1)))
      expect(result.layers.filter(l => l.bounds)).not.toHaveLength(0)
      expect(changed).toBe(0)
      expect(result.blobCount).toBeGreaterThan(0)
      if (phase === 'cold') {
        coldWire = result.blobWireBytes
        expect(coldWire).toBeGreaterThan(1_000_000)
      } else if (JSON.stringify(previousKeys) === JSON.stringify(result.blobKeys)) {
        expect(result.blobWireBytes).toBe(0)
        sawSteadyCache = true
      } else {
        // A first join may publish first coverage of the final merged layer.
        // That is a new immutable URL; its first fetch is not a cache miss.
        expect(result.blobWireBytes).toBeLessThan(coldWire)
      }
      previousKeys = result.blobKeys
    }
    expect(dialogErrors).toEqual([])
    expect(sawSteadyCache).toBe(true)
    await cdp?.detach()
    const timings = await db.roomOpenMeasurement.findMany({ where: { roomId }, orderBy: { createdAt: 'asc' }, select: {
      outcome: true, totalMs: true, joinMs: true, paperMs: true, snapshotMs: true, replayMs: true } })
    console.log('QA425 app timings:', JSON.stringify(timings))
  } finally { await mobile?.close(); await db.$disconnect() }
})
