import { expect, test, type Page } from '@playwright/test'
import { createRoom, drawStroke, operations, waitForOperations, waitForRoomReady } from '../support/room'

async function shareReview(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { sessionStorage.setItem('review-url', text) },
    } })
  })
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Share for review', exact: true }).click()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('review-url'))).not.toBeNull()
  return (await page.evaluate(() => sessionStorage.getItem('review-url')))!
}

for (const [exitEarly, infinite] of [[false, false], [true, false], [false, true]]) {
  test(`${infinite ? 'infinite' : 'bounded'} review image accepts notes before layers load; ${exitEarly ? 'early exit shows a preloader' : 'handoff keeps the view and notes'}`, { tag: '@two-browsers' }, async ({ page, browser }, testInfo) => {
    let roomId: string
    if (infinite) {
      await page.goto('/create')
      roomId = `e2ereview${Date.now().toString(36)}`
      await page.evaluate(id => {
        history.pushState({ usr: { room: { id, name: 'Infinite review', paper: 'coarse', infinite: true } }, key: 'review-infinite', idx: 1 }, '', `/room/${id}`)
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
      }, roomId)
      await page.waitForURL(new RegExp(`/room/${roomId}$`))
    } else roomId = await createRoom(page)
    await waitForRoomReady(page)
    await drawStroke(page, [[400, 330], [580, 340], [650, 390]])
    await waitForOperations(page, 'stroke', 1)
    const reviewUrl = await shareReview(page)
    expect(reviewUrl).toContain(`/room/${roomId}?preview`)

    const receiver = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    let releasePaper!: () => void
    const paperGate = new Promise<void>(resolve => { releasePaper = resolve })
    try {
      const review = await receiver.newPage()
      await review.route(url => url.pathname.startsWith('/paper/'), async route => {
        await paperGate
        await route.continue()
      })
      await review.goto(reviewUrl)
      await review.locator('form input[type="text"]').fill('Reviewer')
      await review.locator('form button[type="submit"]').click()
      const image = review.getByRole('img', { name: 'Drawing for review' })
      await expect(image).toBeVisible()
      expect(await review.evaluate(() => getComputedStyle(document.querySelector('canvas')!).pointerEvents)).toBe('none')
      await expect(review.getByRole('button', { name: 'Annotations', exact: true })).toHaveAttribute('aria-pressed', 'true')
      // The image has real ink, not a blank paper/placeholder thumbnail.
      expect(await image.evaluate(el => {
        const img = el as HTMLImageElement
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 650) return true
        return false
      })).toBe(true)

      const point = await review.evaluate(() => {
        const box = document.querySelector('img[alt="Drawing for review"]')!.getBoundingClientRect()
        const img = document.querySelector('img[alt="Drawing for review"]') as HTMLImageElement
        const x = Number.parseFloat(img.style.left) + img.naturalWidth / 2
        const y = Number.parseFloat(img.style.top) + img.naturalHeight / 2
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, worldX: x, worldY: y }
      })
      await review.mouse.click(point.x, point.y)
      await review.keyboard.type('Check this edge')
      await review.keyboard.press('Control+Enter')
      await expect.poll(() => review.evaluate(() => Object.values(window.__roomStore!.getState().annotations.items).filter(a => a.kind === 'text').map(a => a.text))).toEqual(['Check this edge'])
      // It reached the ordinary room immediately, not a review-only stash.
      await expect.poll(() => page.evaluate(() => Object.values(window.__roomStore!.getState().annotations.items).filter(a => a.kind === 'text').map(a => a.text))).toEqual(['Check this edge'])
      const note = await review.evaluate(() => Object.values(window.__roomStore!.getState().annotations.items).find(a => a.kind === 'text'))
      expect(note?.kind).toBe('text')
      if (note?.kind !== 'text') throw new Error('Missing note')
      expect(note.x).toBeCloseTo(point.worldX, 0)
      expect(note.y).toBeCloseTo(point.worldY - note.size * 0.6, 0)
      await review.getByRole('button', { name: 'Undo', exact: true }).first().click()
      await expect.poll(() => review.evaluate(() => window.__roomStore!.getState().annotations.order.length)).toBe(0)
      await review.getByRole('button', { name: 'Redo', exact: true }).first().click()
      await expect.poll(() => review.evaluate(() => window.__roomStore!.getState().annotations.order.length)).toBe(1)
      const viewport = await review.evaluate(() => window.__roomStore!.getState().viewport)
      await review.screenshot({ path: testInfo.outputPath('early-review.png') })

      if (exitEarly) {
        await review.getByRole('button', { name: 'Annotations', exact: true }).click()
        await expect(image).toHaveCount(0)
        await expect(review.locator('[class*="spinner"]')).toBeVisible()
        expect(await review.evaluate(() => getComputedStyle(document.querySelector('canvas')!).pointerEvents)).toBe('none')
      }
      releasePaper()
      await waitForRoomReady(review)
      await expect(image).toHaveCount(0)
      await expect(review.locator('[class*="spinner"]')).toHaveCount(0)
      expect(await review.evaluate(() => window.__roomStore!.getState().viewport)).toEqual(viewport)
      expect(await review.evaluate(() => Object.values(window.__roomStore!.getState().annotations.items).filter(a => a.kind === 'text').map(a => a.text))).toEqual(['Check this edge'])
      expect((await operations(review)).filter(op => op.type === 'annotation_add')).toHaveLength(1)
      expect((await operations(review)).filter(op => op.type === 'stroke')).toHaveLength(1)
      await review.screenshot({ path: testInfo.outputPath('restored-review.png') })
      await review.reload()
      await review.locator('form button[type="submit"]').click()
      await waitForRoomReady(review)
      await expect.poll(() => review.evaluate(() => window.__roomStore!.getState().annotations.order.length)).toBe(1)
    } finally {
      releasePaper()
      await receiver.close()
    }
  })
}

test('an export upload failure does not send a link to a missing image', async ({ page }) => {
  await createRoom(page)
  await waitForRoomReady(page)
  await page.route('**/api/rooms/*/review', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"unavailable"}' }) : route.continue())
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { sessionStorage.setItem('unexpected-share', 'true') } } })
  })
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Share for review', exact: true }).click()
  await expect(page.getByText('Could not prepare the review image', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('unexpected-share'))).toBeNull()
})

test('native sharing gets a fresh user gesture after export and upload', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('al_device_type', 'tablet') })
  await createRoom(page)
  await waitForRoomReady(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: { url: string }) => {
      sessionStorage.setItem('native-review', JSON.stringify({ ...data, active: navigator.userActivation.isActive }))
    } })
  })
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Share for review', exact: true }).click()
  const ready = page.getByRole('dialog')
  await expect(ready).toContainText('Review link ready')
  expect(await page.evaluate(() => sessionStorage.getItem('native-review'))).toBeNull()
  await ready.getByRole('button', { name: 'Share', exact: true }).click()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('native-review'))).not.toBeNull()
  const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem('native-review')!))
  expect(shared.active).toBe(true)
  expect(shared.url).toContain('?preview')
})

test('a legacy preview without an export falls back to normal layers', async ({ page }) => {
  const id = await createRoom(page)
  await waitForRoomReady(page)
  await drawStroke(page, [[500, 400], [650, 420]])
  await waitForOperations(page, 'stroke', 1)
  await page.goto(`/room/${id}?preview`)
  await page.locator('form button[type="submit"]').click()
  await waitForRoomReady(page)
  await expect(page.getByRole('img', { name: 'Drawing for review' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Annotations', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect((await operations(page)).filter(op => op.type === 'stroke')).toHaveLength(1)
})
