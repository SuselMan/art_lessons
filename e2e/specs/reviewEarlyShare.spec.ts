import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

const baseline = process.env.E2E_SHARE_BASELINE === '1'

test('review link is available while its upload is pending, without using an older preview', async ({ page, context }, info) => {
  await createRoom(page); await waitForRoomReady(page)
  await drawStroke(page, [[420, 350], [640, 350]])
  await waitForOperations(page, 'stroke', 1)
  const board = new URL(page.url()).pathname.split('/').pop()!
  await page.request.post(`/api/rooms/${board}/review`, { data: {
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=',
    bounds: { x: 0, y: 0, width: 1, height: 1 }, generation: '00000000-0000-0000-0000-000000000001',
  } })
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async (text: string) => { sessionStorage.setItem('early-review-link', text); sessionStorage.setItem('early-review-time', String(Date.now())) },
  } }))
  let release!: () => void, uploaded!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const pending = new Promise<void>(resolve => { uploaded = resolve })
  await page.route(`**/api/rooms/${board}/review`, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    uploaded(); await gate; await route.continue()
  })
  let receiver: Awaited<ReturnType<typeof context.newPage>> | undefined
  try {
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const started = Date.now()
    await page.getByRole('menuitem', { name: 'Share for review', exact: true }).click()
    if (!baseline) await expect.poll(() => page.evaluate(() => sessionStorage.getItem('early-review-link'))).not.toBeNull()
    await pending
    await page.waitForTimeout(1500)
    let link = await page.evaluate(() => sessionStorage.getItem('early-review-link'))
    if (baseline) expect(link).toBeNull()
    else {
      expect(link).not.toBeNull()
      const generation = new URL(link!).searchParams.get('reviewToken')
      expect(generation).toBeTruthy()
      expect((await page.request.get(`/api/rooms/${board}/review?generation=${generation}`)).status()).toBe(404)
      receiver = await context.newPage()
      await receiver.goto(link!)
      await receiver.locator('form button[type="submit"]').click()
      await waitForRoomReady(receiver)
      await expect(receiver.getByRole('img', { name: 'Drawing for review' })).toHaveCount(0)
      expect(await receiver.evaluate(() => window.__engine!.getOperations().some(op => op.type === 'stroke'))).toBe(true)
    }
    const response = page.waitForResponse(r => r.url().endsWith(`/api/rooms/${board}/review`) && r.request().method() === 'POST')
    release(); expect((await response).ok()).toBe(true)
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('early-review-link'))).not.toBeNull()
    link = await page.evaluate(() => sessionStorage.getItem('early-review-link'))
    const delay = Number(await page.evaluate(() => sessionStorage.getItem('early-review-time'))) - started
    if (!baseline) {
      expect(delay).toBeLessThan(3000)
      expect((await page.request.get(`/api/rooms/${board}/review?generation=${new URL(link!).searchParams.get('reviewToken')}`)).status()).toBe(200)
    }
    const report = { baseline, linkDelayMs: delay, controlledUploadHoldMs: 1500, earlyFallbackVerified: !baseline }
    await writeFile(info.outputPath('share-timing.json'), JSON.stringify(report))
    console.log('REVIEW_SHARE_TIMING', JSON.stringify(report))
  } finally { release(); if (receiver) await receiver.close() }
})
