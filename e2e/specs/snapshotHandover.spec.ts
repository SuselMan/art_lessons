import { expect, test, type Page } from '@playwright/test'
import { activeLayerId, createRoom, drawStroke, joinRoom, setBrushSize, waitForOperations, waitForRoomReady } from '../support/room'

interface Handover {
  done: boolean
  error: string | null
  depth: number
  deferred: boolean
  wait: Promise<void>
}
declare global { interface Window { __handover?: Handover } }

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    // Thumbnail uploads are intentionally throttled to one per 3s. This
    // fixture replaces the bitmap repeatedly; record that expected HTTP
    // response separately, while keeping all JS/GL/other HTTP errors fatal.
    if (/\/api\/rooms\/[^/]+\/thumbnail$/.test(message.location().url) && /status of 429/.test(message.text())) {
      test.info().annotations.push({ type: 'expected-thumbnail-rate-limit', description: message.location().url })
    } else errors.push(message.text())
  })
  return errors
}

async function screen(page: Page, rect: [number, number, number, number]) {
  return page.evaluate(([x, y, w, h]) => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl')!
    const bytes = new Uint8Array(w * h * 4)
    gl.readPixels(x, canvas.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    return Array.from(bytes)
  }, rect)
}
async function baked(page: Page, id: string, full = false) {
  return page.evaluate(async ({ id, full }) => {
    const url = '/src/engine/snapshots.ts'
    const { decodeLayerTiles } = await import(url) as typeof import('../../apps/web/src/engine/snapshots')
    const e = window.__engine!, raw = full ? e.bakeLayerByFullReplay(id) : e.bakeNetworkSnapshot(id)
    if (!raw) return null
    return Promise.all(decodeLayerTiles(raw, 0).tiles.map(async t => ({
      x: t.originX, y: t.originY, w: t.width, h: t.height,
      hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(t.pixels)))).join(','),
    })))
  }, { id, full })
}

/** Real public Room restore, real gzip decode and live engine; only HTTP data
 *  and the UI notification callbacks are controlled to force the interleaving. */
async function startRestore(page: Page, layer: string) {
  await page.evaluate(async layer => {
    const stateUrl = '/src/pages/Room/restoreRoomState.ts'
    const netUrl = '/src/pages/Room/net/snapshotRestore.ts'
    const gateUrl = '/src/pages/Room/replayGate.ts'
    const pendingUrl = '/src/pages/Room/net/pendingPreviews.ts'
    const codecUrl = '/src/engine/src/oplog/snapshotCodec.ts'
    const { restoreRoomState } = await import(stateUrl) as typeof import('../../apps/web/src/pages/Room/restoreRoomState')
    const { restoreLatestSnapshot } = await import(netUrl) as typeof import('../../apps/web/src/pages/Room/net/snapshotRestore')
    const { createReplayGate } = await import(gateUrl) as typeof import('../../apps/web/src/pages/Room/replayGate')
    const { createPendingPreviews } = await import(pendingUrl) as typeof import('../../apps/web/src/pages/Room/net/pendingPreviews')
    const { compressLayerTiles, encodeLayerTiles } = await import(codecUrl) as typeof import('../../apps/web/src/engine/src/oplog/snapshotCodec')
    const engine = window.__engine!, layerState = window.__roomStore!.getState().layerState
    const blob = await compressLayerTiles(encodeLayerTiles([{ originX: 0, originY: 0, width: 1024, height: 1024, pixels: new Uint8Array(1024 * 1024 * 4) }]))
    const original = window.fetch
    window.fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('/api/rooms/handover-fixture/snapshots/index')) return new Response(JSON.stringify({ seq: 0, layerState, layers: [{ layerId: layer, seq: 0 }] }), { headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/api/rooms/handover-fixture/snapshots/')) return new Response(new Uint8Array(blob))
      return original(input, init)
    }
    const qa: Handover = { done: false, error: null, deferred: false, depth: 0, wait: Promise.resolve() }
    window.__handover = qa
    qa.wait = restoreRoomState(engine, { latestSnapshotSeq: 1, tailOperations: [], participants: [], palette: [], frozen: false }, { mode: 'catchup', alreadyHadSeq: 0 }, {
      boardId: 'handover-fixture',
      restoreFromSnapshot: async (e, room, signal) => (await restoreLatestSnapshot(room, {
        beginLayers: () => {},
        applyLayer: (id, tiles, seq) => e.restoreLayerFromSnapshot(id, tiles, seq, signal),
      }, { signal })).status,
      backfillHistory: async () => {}, applyRemoteOp: op => engine.appendOperation(op, 'remote'),
      syncFromLogNow: () => {}, markJoinRestoreDone: () => {}, dispatchParticipants: () => {},
      setRestoreFailure: reason => { qa.error = reason }, setRoomContentReady: () => {}, finishOpenTimer: () => {},
      notifyReplayIncomplete: () => {}, getSnapshotUploader: () => null,
      latestKnownSeqRef: { current: 0 }, replayIncompleteRef: { current: false },
      pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null }, replayGate: createReplayGate(),
    }).then(() => { qa.done = true }).catch(error => { qa.error = String(error); qa.done = true }).finally(() => { window.fetch = original })
  }, layer)
  await expect.poll(() => page.evaluate(layer => {
    const e = window.__engine! as unknown as { _deferredSnapshotInstalls?: Map<string, unknown>; _displaySuspendDepth: number }
    const qa = window.__handover!
    qa.depth = e._displaySuspendDepth; qa.deferred = e._deferredSnapshotInstalls?.has(layer) ?? false
    return qa.deferred || qa.done
  }, layer)).toBe(true)
}

test('empty and sparse snapshots replace old tiles, including the baseline used by Undo', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = watchErrors(page)
  await createRoom(page); await waitForRoomReady(page)
  const layer = await activeLayerId(page)
  await drawStroke(page, [[500, 250], [580, 280]])
  await drawStroke(page, [[750, 250], [800, 280]])
  await waitForOperations(page, 'stroke', 2)
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  const removed = await page.evaluate(async id => {
    const url = '/src/engine/snapshots.ts'
    const { decodeLayerTiles } = await import(url) as typeof import('../../apps/web/src/engine/snapshots')
    const e = window.__engine!, raw = e.bakeNetworkSnapshot(id)!
    const tiles = decodeLayerTiles(raw, 0).tiles
    if (tiles.length < 2) throw new Error('fixture must paint at least two tiles')
    e.restoreLayerFromSnapshot(id, [tiles[0]], 2)
    return tiles.length
  }, layer)
  expect(removed).toBeGreaterThan(1)
  expect(await baked(page, layer)).toHaveLength(1)
  await page.evaluate(id => window.__engine!.restoreLayerFromSnapshot(id, [], 2), layer)
  expect(await baked(page, layer)).toBeNull()
  await drawStroke(page, [[500, 400], [580, 430]])
  await waitForOperations(page, 'stroke')
  await page.keyboard.press('Control+z')
  await waitForOperations(page, 'operation_undo')
  await expect.poll(() => baked(page, layer)).toBeNull()
  expect(errors).toEqual([])
})

for (const target of ['author', 'peer'] as const) {
  test(`public restore preserves held ${target} pixels and displays new MOVE before UP`, async ({ page, browser }) => {
    test.setTimeout(180_000)
    const room = await createRoom(page); await waitForRoomReady(page)
    const layer = await activeLayerId(page)
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    try {
      const peer = await context.newPage(); await joinRoom(peer, room, 'Observer')
      const receiver = target === 'author' ? page : peer
      const errors = watchErrors(page), peerErrors = watchErrors(peer)
      await setBrushSize(page, 48)
      const box = (await page.locator('canvas').first().boundingBox())!
      await page.mouse.move(box.x + 500, box.y + 250); await page.mouse.down()
      await page.mouse.move(box.x + 580, box.y + 280, { steps: 12 })
      if (target === 'peer') await expect.poll(() => receiver.evaluate(() => window.__engine!.getContentBounds(window.__roomStore!.getState().layerState.activeId))).not.toBeNull()
      // Wait for a real frame; reads below never force engine display/export.
      await receiver.waitForTimeout(200)
      const early: [number, number, number, number] = [500, 245, 35, 25]
      const far: [number, number, number, number] = [625, 315, 35, 45]
      const before = await screen(receiver, early), beforeFar = await screen(receiver, far)
      await startRestore(receiver, layer)
      expect(await receiver.evaluate(() => window.__handover!.deferred)).toBe(true)
      expect(await receiver.evaluate(() => window.__handover!.depth)).toBe(1)
      expect(await receiver.evaluate(() => window.__handover!.done)).toBe(false)
      await page.mouse.move(box.x + 660, box.y + 360, { steps: 12 })
      await expect.poll(async () => (await screen(receiver, far)).filter((v, i) => v !== beforeFar[i]).length).toBeGreaterThan(20)
      expect(await screen(receiver, early)).toEqual(before)
      expect(await receiver.evaluate(() => window.__handover!.done)).toBe(false)
      await page.mouse.up()
      await expect.poll(() => receiver.evaluate(() => window.__handover!.done)).toBe(true)
      expect(await receiver.evaluate(() => window.__handover!.error)).toBeNull()
      await expect.poll(() => baked(receiver, layer)).not.toBeNull()
      expect(await baked(receiver, layer)).toEqual(await baked(receiver, layer, true))
      expect(errors).toEqual([])
      expect(peerErrors).toEqual([])
    } finally { await page.mouse.up(); await context.close() }
  })
}
