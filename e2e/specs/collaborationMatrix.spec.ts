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
