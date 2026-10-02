import { expect, test } from '@playwright/test'

import type { DrawingTool } from '../../apps/web/src/stores/slices/toolSlice'
import {
  activeLayerId, contentBounds, createRoom, drawStroke, joinRoom, maxDarknessOverRect, operations,
  waitForOperations, waitForRoomReady,
} from '../support/room'

// QA-003 (#689): every drawing tool through the actual input pipeline, the
// live channel, undo/redo, and a newly joined browser's history replay.
const tools: DrawingTool[] = ['pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'digitalBrush', 'eraser', 'smudge', 'watercolor']

for (const tool of tools) {
  test(`${tool}: live peer, undo/redo and history replay retain the mark`, { tag: '@two-browsers' }, async ({ page, browser }) => {
    test.setTimeout(90_000)
    const roomId = await createRoom(page, `QA ${tool}`)
    await waitForRoomReady(page)
    const peerContext = await browser.newContext({ ignoreHTTPSErrors: true })
    const lateContext = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      const peer = await peerContext.newPage()
      await joinRoom(peer, roomId)
      await drawStroke(page, [[450, 300], [650, 300]], { size: 60 })
      await waitForOperations(peer, 'stroke', 1)
      const layer = await activeLayerId(page)
      const markRect = await page.evaluate(() => {
        const { viewport: v, room } = window.__roomStore!.getState()
        return { x: room!.width / 2 + (500 - v.cx) / v.zoom, y: room!.height / 2 + (450 - v.cy) / v.zoom - 5, width: 100 / v.zoom, height: 10 }
      })
      const blank = await maxDarknessOverRect(page, markRect, 32)
      await page.evaluate(async selected => {
        window.__roomStore!.getState().setTool(selected)
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      }, tool)
      const modifies = tool === 'eraser' || tool === 'smudge'
      await drawStroke(page, modifies ? [[530, 280], [560, 340]] : [[450, 450], [650, 450]], { size: 60 })
      await waitForOperations(peer, 'stroke', 2)
      const stroke = (await operations(page)).filter(op => op.type === 'stroke').at(-1)
      expect(stroke).toMatchObject({ type: 'stroke', tool, layerId: layer })
      if (!modifies) {
        await expect.poll(() => maxDarknessOverRect(page, markRect, 32)).toBeGreaterThan(blank + 0.01)
      }
      await expect.poll(async () => (await operations(peer)).map(op => op.id)).toEqual((await operations(page)).map(op => op.id))

      await page.evaluate(() => window.__engine!.undo())
      await waitForOperations(peer, 'operation_undo')
      await page.evaluate(() => window.__engine!.redo())
      await waitForOperations(peer, 'operation_redo')

      const late = await lateContext.newPage()
      await joinRoom(late, roomId, 'History witness')
      await waitForOperations(late, 'operation_redo')
      const bounds = await contentBounds(page, layer)
      expect(bounds).not.toBeNull()
      const sample = async (target: typeof page) => target.evaluate(rect => {
        const out: number[] = []
        for (let x = 0; x <= 16; x++) for (let y = 0; y <= 16; y++) out.push(...(window.__engine!.pickColor(rect.x + rect.width * x / 16, rect.y + rect.height * y / 16) ?? []))
        return out
      }, bounds!)
      // Poll because watercolor rebuilds over frames; a log acknowledgement
      // does not claim that its pixels have already finished settling.
      for (const target of [peer, late]) {
        await expect.poll(async () => {
          const ref = await sample(page)
          const actual = await sample(target)
          return Math.max(...actual.map((v, i) => Math.abs(v - ref[i])))
        }, { timeout: 30_000 }).toBeLessThan(0.04)
      }
      expect(await page.evaluate(() => window.__engine!.gpuInfo().contextLost)).toBe(false)
    } finally {
      await peerContext.close()
      await lateContext.close()
    }
  })
}
