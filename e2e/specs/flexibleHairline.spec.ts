import { expect, test } from '@playwright/test'
import { slow } from '../support/pace'
import { strokeDabs } from '../../packages/shared/src/index'
import { createRoom, waitForRoomReady, waitForOperations, operations } from '../support/room'

for (const tool of ['brushPen', 'watercolor'] as const) {
  test(`${tool}: a large flexible nib draws a hairline with feather pressure`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('al_locale', 'en'))
    await createRoom(page)
    await waitForRoomReady(page)
    await page.evaluate(tool => {
      const s = window.__roomStore!.getState()
      s.setTool(tool)
      if (tool === 'watercolor') {
        s.setToolSetting(tool, 'nib', 'flex')
        s.setToolSetting(tool, 'water', 0.55)
        s.setToolSetting(tool, 'pigment', 1)
      }
      s.setToolSetting(tool, 'size', 100)
      const v = s.viewport
      s.setViewport({ ...v, zoom: 1, angle: 0 })
    }, tool)
    await page.waitForTimeout(200)
    await page.evaluate(() => { window.__engine!.setPaper('flat'); window.__engine!.setColor([0, 0, 0]) })
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('no canvas')
    const cdp = await page.context().newCDPSession(page)
    const x = box.x + box.width / 2 - 100
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.02 })
    for (let i = 1; i <= 40; i++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i * 5, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.02 })
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 200, y, button: 'left', buttons: 0, pointerType: 'pen', force: 0 })
    await waitForOperations(page, 'stroke', 1)
    const op = (await operations(page)).find(op => op.type === 'stroke')
    if (!op || op.type !== 'stroke') throw new Error('no stroke')
    expect(op.tool).toBe(tool)
    const dabs = strokeDabs(op)
    expect(dabs.length).toBeGreaterThan(2)
    console.log(tool, 'dab count / maximum size', dabs.length, Math.max(...dabs.map(d => d.size)))
    expect(Math.max(...dabs.map(d => d.size))).toBeLessThanOrEqual(2.05)
    // Read actual rendered pixels, at zoom 1. Use the middle of the gesture,
    // beyond its head taper and away from its end taper.
    const middle = dabs[Math.floor(dabs.length / 2)]
    const sample = async () => page.evaluate(({ x, y }) => {
      const result = []
      for (let dy = -12; dy <= 12; dy++) {
        const pixel = window.__engine!.pickColor(x, y + dy)!
        result.push(255 * (1 - (pixel[0] + pixel[1] + pixel[2]) / 3))
      }
      return result
    }, { x: middle.x, y: middle.y })
    // Pixel probes need the finished image; software GL can settle longer
    // than a fixed delay even though the operation is already recorded.
    await page.waitForFunction(() => {
      const e = window.__engine as unknown as {
        _settle: unknown; _opQueue: unknown[];
        _rebuildJobs: Map<string, unknown>; _pendingRebuilds: Set<string>;
      }
      return !e._settle && e._opQueue.length === 0
        && e._rebuildJobs.size === 0 && e._pendingRebuilds.size === 0
    }, undefined, { timeout: slow(30_000) })
    const live = await sample()
    console.log(tool, 'live cross-section', live)
    expect(Math.max(...live)).toBeGreaterThan(tool === 'brushPen' ? 25 : 3)
    expect(live.filter(v => v > Math.max(...live) * 0.25).length).toBeLessThanOrEqual(5)
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await operations(page)).filter(op => op.type === 'stroke').length).toBe(0)
    await page.keyboard.press('Control+Shift+z')
    await waitForOperations(page, 'stroke', 1)
    // Pixel probes need the finished image; software GL can settle longer
    // than a fixed delay even though the operation is already recorded.
    await page.waitForFunction(() => {
      const e = window.__engine as unknown as {
        _settle: unknown; _opQueue: unknown[];
        _rebuildJobs: Map<string, unknown>; _pendingRebuilds: Set<string>;
      }
      return !e._settle && e._opQueue.length === 0
        && e._rebuildJobs.size === 0 && e._pendingRebuilds.size === 0
    }, undefined, { timeout: slow(30_000) })
    const replay = await sample()
    console.log(tool, 'replay cross-section', replay)
    expect(Math.max(...replay)).toBeGreaterThan(tool === 'brushPen' ? 25 : 3)
    expect(replay.filter(v => v > Math.max(...replay) * 0.25).length).toBeLessThanOrEqual(5)
    await page.screenshot({ path: test.info().outputPath(`${tool}-hairline.png`) })
  })
}
