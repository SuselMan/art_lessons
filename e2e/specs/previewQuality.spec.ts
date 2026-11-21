import { expect, test } from '@playwright/test'
import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

test('small preview retains ink and the whole sheet independently of the live viewport', async ({ page }, testInfo) => {
  await createRoom(page)
  await waitForRoomReady(page)
  await drawStroke(page, [[400, 330], [800, 360]], { size: 3 })
  await drawStroke(page, [[400, 460], [800, 460]], { size: 48 })
  await waitForOperations(page, 'stroke', 2)
  const result = await page.evaluate(async () => {
    const engine = window.__engine!
    async function image(blob: Blob | null) {
      if (!blob) throw new Error('Missing image')
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = 226; canvas.height = 320
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, 226, 320)
      const pixels = Array.from(ctx.getImageData(0, 0, 226, 320).data)
      const size = [bitmap.width, bitmap.height]
      bitmap.close()
      return { pixels, size }
    }
    const fullBlob = (await engine.exportPNG())!
    const previewBlob = (await engine.bakePreview())!
    const full = await image(fullBlob)
    const preview = await image(previewBlob)
    engine.setViewport(120, 70, 2, 0.3)
    const moved = await image(await engine.bakePreview())
    const dark = (pixels: number[]) => {
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 690) count++
      return count
    }
    return { previewBytes: Array.from(new Uint8Array(await previewBlob.arrayBuffer())), fullBytes: Array.from(new Uint8Array(await fullBlob.arrayBuffer())), fullInk: dark(full.pixels), previewInk: dark(preview.pixels), size: preview.size, fullSize: full.size,
      unchanged: preview.pixels.every((p, i) => p === moved.pixels[i]) }
  })
  await testInfo.attach('preview.webp', { body: Buffer.from(result.previewBytes), contentType: 'image/webp' })
  await testInfo.attach('full.png', { body: Buffer.from(result.fullBytes), contentType: 'image/png' })
  expect(Math.max(...result.size)).toBe(320)
  expect(Math.abs(result.size[0] - result.fullSize[0] / result.fullSize[1] * result.size[1])).toBeLessThanOrEqual(1)
  expect(result.fullInk).toBeGreaterThan(10)
  expect(result.previewInk).toBeGreaterThan(result.fullInk * 0.65)
  expect(result.previewInk).toBeLessThan(result.fullInk * 1.5)
  expect(result.unchanged).toBe(true)
})

test('a held stroke refreshes before pen-up and stops sending while the pen rests', async ({ page }) => {
  let uploads = 0
  page.on('request', request => {
    if (request.method() === 'POST' && /\/thumbnail$/.test(new URL(request.url()).pathname)) uploads++
  })
  await createRoom(page)
  await waitForRoomReady(page)
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.move(box.x + 400, box.y + 330)
  await page.mouse.down()
  try {
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(box.x + 400 + i * 10, box.y + 330 + i * 2, { steps: 2 })
      await page.waitForTimeout(100)
    }
    await expect.poll(() => uploads).toBeGreaterThan(0)
  } finally { await page.mouse.up() }
  await waitForOperations(page, 'stroke', 1)
  await page.waitForTimeout(2500)
  const settled = uploads
  await page.waitForTimeout(2500)
  expect(uploads).toBe(settled)
})
