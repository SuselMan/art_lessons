import { expect, test, type Page } from '@playwright/test'
import { strokeDabs } from '../../packages/shared/src/index'
import { createRoom, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

async function pen(page: Page, type: string, x: number, y: number) {
  await page.evaluate(({ type, x, y }) => {
    const canvas = document.querySelector('canvas')!
    const event = new PointerEvent(type, {
      bubbles: true, pointerId: 7, pointerType: 'pen', isPrimary: true, button: 0,
      buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : 0.8,
      clientX: x, clientY: y,
    })
    // Constructed events have no browser coalescing history. Supply their
    // own contact sample; the foreign mouse below uses native CDP input.
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => [event] })
    canvas.dispatchEvent(event)
  }, { type, x, y })
  await page.waitForTimeout(30)
}

for (const interference of ['hover', 'up'] as const) {
  test(`native mouse ${interference} cannot change or end a pen gesture`, { tag: '@two-browsers' }, async ({ page, browser }) => {
    const room = await createRoom(page, `QA pointer ownership ${interference}`)
    await waitForRoomReady(page)
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      const peer = await context.newPage()
      await joinRoom(peer, room)
      await pen(page, 'pointerdown', 500, 450)
      await pen(page, 'pointermove', 550, 450)
      await page.mouse.move(800, 200)
      if (interference === 'up') {
        await page.mouse.down()
        await page.mouse.up()
      }
      const active = await page.evaluate(() => (window.__engine as unknown as { _pointer: { _activePointerId: number | null } })._pointer._activePointerId)
      expect(active, 'the pen still owns its gesture after foreign input').toBe(7)
      for (const x of [600, 650, 700, 750]) await pen(page, 'pointermove', x, 450)
      await pen(page, 'pointerup', 750, 450)
      await waitForOperations(peer, 'stroke')
      const strokes = (await operations(page)).filter(o => o.type === 'stroke')
      const dabs = strokes.flatMap(strokeDabs)
      expect(dabs.length).toBeGreaterThan(10)
      expect(Math.max(...dabs.map(d => d.y)) - Math.min(...dabs.map(d => d.y)), 'no diagonal from the mouse hover is recorded').toBeLessThan(1)
      expect(Math.max(...dabs.map(d => d.x)) - Math.min(...dabs.map(d => d.x)), 'the pen reaches the rest of its horizontal path').toBeGreaterThan(500)
      await expect.poll(async () => (await operations(peer)).filter(o => o.type === 'stroke').map(o => o.id)).toEqual(strokes.map(o => o.id))
    } finally { await context.close() }
  })
}
