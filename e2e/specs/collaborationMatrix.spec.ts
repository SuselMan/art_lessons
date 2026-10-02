import { expect, test, type Page } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, joinRoom, operations,
  waitForOperations, waitForRoomReady,
} from '../support/room'

/** QA-002/006/011 (#689): separate identities, concurrent real input, then
 * each author's undo/redo. Log equality alone cannot prove pixel convergence. */
async function pixels(page: Page, rect: { x: number; y: number; width: number; height: number }): Promise<number[]> {
  return page.evaluate(r => {
    const out: number[] = []
    for (let x = 0; x <= 12; x++) for (let y = 0; y <= 12; y++) {
      out.push(...(window.__engine!.pickColor(r.x + r.width * x / 12, r.y + r.height * y / 12) ?? []))
    }
    return out
  }, rect)
}

for (const count of [2, 5, 10, 20]) {
  test(`${count} participants converge after simultaneous strokes and author undo/redo`, { tag: '@two-browsers' }, async ({ page, browser }) => {
    test.setTimeout(240_000)
    await createRoom(page, `QA ${count} participants`)
    await waitForRoomReady(page)
    const roomId = new URL(page.url()).pathname.split('/').pop()!
    const contexts = []
    const pages = [page]
    try {
      for (let i = 1; i < count; i++) {
        const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
        contexts.push(context)
        const peer = await context.newPage()
        await joinRoom(peer, roomId, `QA participant ${i + 1}`)
        pages.push(peer)
      }
      await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().participants.length)).toBe(count)
      const userIds = await Promise.all(pages.map(p => p.evaluate(() => window.__roomStore!.getState().userId)))
      expect(new Set(userIds).size, 'contexts must represent different people').toBe(count)

      await Promise.all(pages.map(async (p, i) => {
        const box = await p.locator('canvas').first().boundingBox()
        if (!box) throw new Error('no canvas')
        const x = box.width / 2
        const y = box.height / 2 + (i % 5 - 2) * 20
        await drawStroke(p, [[x - 100, y], [x, y + 15], [x + 100, y]], { size: 32 })
      }))
      await Promise.all(pages.map(p => waitForOperations(p, 'stroke', count)))
      const ids = async (p: Page) => (await operations(p)).map(o => o.id)
      const expected = await ids(page)
      for (const p of pages) await expect.poll(() => ids(p)).toEqual(expected)

      const layer = await activeLayerId(page)
      const bounds = await contentBounds(page, layer)
      expect(bounds).not.toBeNull()
      const comparePixels = async (): Promise<void> => {
        const ref = await pixels(page, bounds!)
        expect(ref.length).toBe(13 * 13 * 3)
        for (const p of pages.slice(1)) {
          await expect.poll(async () => {
            const actual = await pixels(p, bounds!)
            return Math.max(...actual.map((v, i) => Math.abs(v - ref[i])))
          }, { message: 'same operations must produce the same pixels' }).toBeLessThan(0.03)
        }
      }
      await comparePixels()
      // Every author cancels their own stroke while the others do the same.
      await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.undo())))
      await Promise.all(pages.map(p => waitForOperations(p, 'operation_undo', count)))
      await comparePixels()
      await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.redo())))
      await Promise.all(pages.map(p => waitForOperations(p, 'operation_redo', count)))
      await comparePixels()
      for (const p of pages) expect(await p.evaluate(() => window.__engine!.gpuInfo().contextLost)).toBe(false)
    } finally {
      for (const context of contexts) await context.close()
    }
  })
}

// QA-017: additive ink, watercolor, erasure and smudge overlap in the same
// server sequence; identical journals still need identical actual pixels.
for (const tools of [
  ['pencil', 'marker', 'watercolor', 'eraser', 'smudge'],
  ['pencil', 'marker'], ['watercolor', 'eraser'], ['watercolor', 'smudge'],
] as const) {
test(`${tools.length} mixed-tool authors (${tools.join(', ')}) converge after drawing and undo/redo`, { tag: '@two-browsers' }, async ({ page, browser }) => {
  test.setTimeout(180_000)
  const roomId = await createRoom(page, 'QA mixed-tool conflict')
  await waitForRoomReady(page)
  const contexts = []
  const pages = [page]
  try {
    for (let i = 1; i < tools.length; i++) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
      contexts.push(context)
      const peer = await context.newPage()
      await joinRoom(peer, roomId, `Mixed ${tools[i]}`)
      pages.push(peer)
    }
    const box = (await page.locator('canvas').first().boundingBox())!
    await drawStroke(page, [[box.width / 2 - 120, box.height / 2], [box.width / 2 + 120, box.height / 2]], { size: 60 })
    await Promise.all(pages.map(p => waitForOperations(p, 'stroke')))
    await Promise.all(pages.map(async (p, i) => {
      await p.evaluate(async tool => {
        window.__roomStore!.getState().setTool(tool)
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      }, tools[i])
      const b = (await p.locator('canvas').first().boundingBox())!
      await drawStroke(p, [[b.width / 2 - 100, b.height / 2 - 30 + i * 15], [b.width / 2, b.height / 2 + 20], [b.width / 2 + 100, b.height / 2 - 30 + i * 15]], { size: 48 })
    }))
    await Promise.all(pages.map(p => waitForOperations(p, 'stroke', tools.length + 1)))
    expect(new Set(await Promise.all(pages.map(p => p.evaluate(() => window.__roomStore!.getState().userId)))).size).toBe(tools.length)
    const layerId = await activeLayerId(page)
    const bounds = (await contentBounds(page, layerId))!
    expect(bounds).not.toBeNull()
    const compare = async (targets: Page[]) => {
      for (const target of targets) {
        await expect.poll(async () => {
          const reference = await pixels(page, bounds)
          const actual = await pixels(target, bounds)
          expect(actual.length).toBe(13 * 13 * 3)
          return Math.max(...actual.map((v, i) => Math.abs(v - reference[i])))
        }, { timeout: 120_000, message: 'mixed tools must reproduce the confirmed order' }).toBeLessThan(0.03)
        await expect.poll(async () => (await operations(target)).map(o => o.id)).toEqual((await operations(page)).map(o => o.id))
      }
    }
    await compare(pages.slice(1))
    await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.undo())))
    await Promise.all(pages.map(p => waitForOperations(p, 'operation_undo', tools.length)))
    await compare(pages.slice(1))
    await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.redo())))
    await Promise.all(pages.map(p => waitForOperations(p, 'operation_redo', tools.length)))
    await compare(pages.slice(1))
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    contexts.push(context)
    const late = await context.newPage()
    await joinRoom(late, roomId, 'Mixed history witness')
    await waitForOperations(late, 'operation_redo', tools.length)
    await compare([late])
  } catch (error) {
    const diagnostics = await Promise.allSettled(pages.map(p => p.evaluate(() => {
      const engine = window.__engine!
      const internal = engine as unknown as {
        _wash: { endedAt: number } | null; _unsettledLayers: Set<string>;
        _rebuildJobs: Map<string, unknown>; _peerLiveStrokes: Map<string, unknown>;
        _resettleCount: number;
      }
      return {
        journal: engine.getOperations(), gpu: engine.gpuInfo(), perf: engine.getWatercolorPerf(),
        wash: internal._wash ? { age: performance.now() - internal._wash.endedAt } : null,
        unsettled: [...internal._unsettledLayers], rebuilds: [...internal._rebuildJobs.keys()],
        live: [...internal._peerLiveStrokes], resettles: internal._resettleCount,
      }
    })))
    await test.info().attach('mixed-tool diagnostics', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' })
    const snapshotChecks = await Promise.allSettled(pages.map(p => p.evaluate(async () => {
      const engine = window.__engine!
      const layer = window.__roomStore!.getState().layerState.activeId
      const hash = async (bytes: Uint8Array | null) => bytes
        ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('') : null
      return { incremental: await hash(engine.bakeNetworkSnapshot(layer)), fullReplay: await hash(engine.bakeLayerByFullReplay(layer)) }
    })))
    await test.info().attach('mixed-tool snapshot hashes', { body: JSON.stringify(snapshotChecks, null, 2), contentType: 'application/json' })
    const diagnosticBounds = await contentBounds(page, await activeLayerId(page))
    const frameChecks = await Promise.allSettled(pages.map(p => p.evaluate(rect => {
      const e = window.__engine! as unknown as { _camera: { screenToWorldMatrix(): unknown }; _display(): void; _paperWet: { peak(t: number): number }; canvas: HTMLCanvasElement }
      const sample = () => { const out: number[] = []; for (let x = 0; x <= 12; x++) for (let y = 0; y <= 12; y++) out.push(...(window.__engine!.pickColor(rect.x + rect.width * x / 12, rect.y + rect.height * y / 12) ?? [])); return out }
      const before = sample(); e._display(); return { before, after: sample(), camera: e._camera.screenToWorldMatrix(), canvas: [e.canvas.width, e.canvas.height], wetPeak: e._paperWet.peak(performance.now()) }
    }, diagnosticBounds ?? { x: 0, y: 0, width: 1, height: 1 })))
    await test.info().attach('mixed-tool frame checks', { body: JSON.stringify(frameChecks, null, 2), contentType: 'application/json' })
    throw error
  } finally {
    for (const context of contexts) await context.close()
  }
})
}
