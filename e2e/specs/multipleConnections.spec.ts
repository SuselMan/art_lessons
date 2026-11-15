import { expect, test, type Page } from '@playwright/test'
import { activeLayerId, createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

for (const order of ['latest', 'old'] as const) {
  test(`owner remains present and can draw in a frozen room after the ${order} same-identity tab closes`, async ({ page, browser }) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    const watch = (target: Page) => {
      let ready = false
      target.on('pageerror', error => errors.push(error.message))
      target.on('console', message => {
        if (message.type() !== 'error') return
        const expected = /\/thumbnail$/.test(message.location().url) && (/status of 429/.test(message.text()) || !ready && /status of 403/.test(message.text()))
        if (expected) test.info().annotations.push({ type: 'expected-thumbnail-refusal', description: message.text() })
        else errors.push(`${message.location().url}: ${message.text()}`)
      })
      return () => { ready = true }
    }
    const ownerReady = watch(page)
    const room = await createRoom(page)
    await waitForRoomReady(page); ownerReady()
    const ownerId = await page.evaluate(() => window.__roomStore!.getState().userId)
    const observerContext = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const sibling = await page.context().newPage() // same auth cookie, real second transport
    try {
      const siblingReady = watch(sibling)
      await joinRoom(sibling, room, 'Teacher')
      siblingReady()
      expect(await sibling.evaluate(() => window.__roomStore!.getState().userId)).toBe(ownerId)
      const observer = await observerContext.newPage()
      const observerReady = watch(observer)
      await joinRoom(observer, room, 'Observer'); observerReady()
      await page.getByRole('button', { name: 'Open Class' }).click()
      await page.getByRole('button', { name: 'Freeze project' }).click()
      await expect.poll(() => observer.evaluate(() => window.__roomStore!.getState().roomFrozen)).toBe(true)
      const gone = order === 'latest' ? sibling : page
      const remaining = order === 'latest' ? page : sibling
      await gone.close()
      await remaining.bringToFront()
      await drawStroke(remaining, [[500, 250], [580, 280]])
      await waitForOperations(observer, 'stroke')
      await expect(remaining.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
      const stroke = (await operations(remaining)).find(op => op.type === 'stroke')!
      expect((await operations(observer)).filter(op => op.type === 'stroke').map(op => op.id)).toContain(stroke.id)
      const layer = await activeLayerId(remaining)
      expect(await observer.evaluate(id => window.__engine!.hasLayerContent(id), layer)).toBe(true)
      await expect.poll(() => observer.evaluate(id => window.__roomStore!.getState().participants.find(p => p.userId === id)?.role, ownerId)).toBe('owner')
      const unfreeze = remaining.getByRole('button', { name: 'Unfreeze project' })
      if (!await unfreeze.isVisible()) await remaining.getByRole('button', { name: 'Open Class' }).click()
      await unfreeze.click()
      await expect.poll(() => observer.evaluate(() => window.__roomStore!.getState().roomFrozen)).toBe(false)
      expect(errors).toEqual([])
    } finally {
      if (!sibling.isClosed()) await sibling.close()
      await observerContext.close()
    }
  })
}
