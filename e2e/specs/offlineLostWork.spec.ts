import { expect, test } from '@playwright/test'

import { interruptTransport } from '../support/network'
import { activeLayerId, createRoom, hasLayerContent, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** QA-005/008: a student draws while offline and the teacher deletes the
 * target layer. The student's new content must come back on a fresh layer. */
test('an offline shape is recovered when its layer was deleted by another participant', { tag: '@two-browsers' }, async ({ page, browser }) => {
  test.setTimeout(90_000)
  const roomId = await createRoom(page, 'QA lost offline shape')
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

    await page.getByRole('button', { name: 'Delete layer', exact: true }).click()
    await waitForOperations(page, 'layer_delete')
    transport.restore()
    await student.setOffline(false)

    await expect.poll(async () => (await operations(page)).filter(op => op.type === 'shape').length, { timeout: 45_000 }).toBe(1)
    const recovered = (await operations(page)).find(op => op.type === 'shape')
    expect(recovered).toBeDefined()
    if (recovered?.type !== 'shape') throw new Error('shape missing')
    expect(recovered.layerId).not.toBe(layer)
    expect(await hasLayerContent(page, recovered.layerId)).toBe(true)
    expect(await hasLayerContent(peer, recovered.layerId)).toBe(true)
  } finally {
    await student.close()
  }
})
