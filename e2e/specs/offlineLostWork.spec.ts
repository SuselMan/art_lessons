import { expect, test } from '@playwright/test'

import { interruptTransport } from '../support/network'
import { activeLayerId, createRoom, hasLayerContent, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** QA-005/008: a student draws while offline and the teacher deletes the
 * target layer. The student's new content must come back on a fresh layer. */
for (const kind of ['shape', 'area_fill', 'area_paste'] as const) {
  test(`offline ${kind} is recovered when its layer was deleted by another participant`, { tag: '@two-browsers' }, async ({ page, browser }) => {
    test.setTimeout(90_000)
    const roomId = await createRoom(page, 'QA lost offline content')
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)
    const student = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      const peer = await student.newPage()
      const transport = await interruptTransport(peer)
      await joinRoom(peer, roomId)
      await student.setOffline(true)
      await transport.cut()
      await expect(peer.getByRole('status').filter({ hasText: 'No connection' })).toBeVisible()

      await peer.getByRole('button', { name: 'Shape', exact: true }).click()
      const box = await peer.locator('canvas').first().boundingBox()
      if (!box) throw new Error('no canvas')
      await peer.mouse.move(box.x + 350, box.y + 300)
      await peer.mouse.down()
      await peer.mouse.move(box.x + 450, box.y + 350)
      await peer.mouse.move(box.x + 550, box.y + 400)
      await peer.mouse.up()
      await peer.keyboard.press('Enter')
      await waitForOperations(peer, 'shape')
      expect(await hasLayerContent(peer, layer)).toBe(true)
      if (kind === 'area_fill') {
        await peer.evaluate(async () => {
          window.__roomStore!.getState().setTool('fill')
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        })
        await peer.mouse.click(box.x + 450, box.y + 350)
        await waitForOperations(peer, 'area_fill')
      } else if (kind === 'area_paste') {
        await peer.getByRole('button', { name: 'Select', exact: true }).click()
        await peer.mouse.move(box.x + 320, box.y + 270)
        await peer.mouse.down()
        await peer.mouse.move(box.x + 580, box.y + 430, { steps: 8 })
        await peer.mouse.up()
        await peer.keyboard.press('Control+c')
        await expect.poll(() => peer.evaluate(() => localStorage.getItem('al_clipboard'))).not.toBeNull()
        await peer.keyboard.press('Control+v')
        await expect.poll(() => peer.evaluate(() => window.__roomStore!.getState().tool)).toBe('transform')
        await peer.keyboard.press('Enter')
        await waitForOperations(peer, 'area_paste')
      }
      const original = (await operations(peer)).find(op => op.type === kind)

      await page.getByRole('button', { name: 'Delete layer', exact: true }).click()
      await waitForOperations(page, 'layer_delete')
      transport.restore()
      await student.setOffline(false)

      await expect.poll(async () => (await operations(page)).filter(op => op.type === kind).length, { timeout: 45_000 }).toBe(1)
      const recovered = (await operations(page)).find(op => op.type === kind)
      expect(recovered).toBeDefined()
      if (!recovered || !('layerId' in recovered) || typeof recovered.layerId !== 'string') throw new Error('recovered content missing')
      expect(recovered).toEqual({ ...original, id: recovered.id, layerId: recovered.layerId, timestamp: recovered.timestamp, seq: recovered.seq })
      expect(recovered.layerId).not.toBe(layer)
      expect(await hasLayerContent(page, recovered.layerId)).toBe(true)
      expect(await hasLayerContent(peer, recovered.layerId)).toBe(true)
    } finally {
      await student.close()
    }
  })

}
