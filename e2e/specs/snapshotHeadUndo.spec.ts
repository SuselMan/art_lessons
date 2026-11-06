import { expect, test, type Page } from '@playwright/test'

import {
  createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady,
} from '../support/room'
import { slow } from '../support/pace'

test.use({ viewport: { width: 1000, height: 700 } })

async function exportedImage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const blob = await window.__engine!.exportPNG(true)
    if (!blob) throw new Error('transparent export failed')
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result) : reject(new Error('export is not a data URL'))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  })
}

/** #789/#673: an existing author must be able to undo the last stroke
 *  represented by the snapshot, not silently skip it after a cold join. */
test('cold join keeps all 100 snapshot strokes and 12 tail strokes in Undo history', async ({ page }) => {
  test.setTimeout(slow(240_000))
  const roomId = await createRoom(page)
  await waitForRoomReady(page)
  for (let index = 0; index < 100; index++) {
    const x = 200 + Math.floor(index / 20) * 36
    const y = 150 + (index % 20) * 10
    await drawStroke(page, [[x, y], [x + 24, y]], { size: 24 })
  }
  await waitForOperations(page, 'stroke', 100)
  const prefix = (await operations(page)).filter(op => op.type === 'stroke')
  expect(prefix).toHaveLength(100)
  await expect.poll(async () => {
    const response = await page.request.get(`/api/rooms/${roomId}/snapshots/index`)
    return response.status() === 200 ? (await response.json() as { seq: number }).seq : 0
  }, { timeout: slow(90_000) }).toBe(100)

  for (let index = 0; index < 12; index++) {
    const y = 400 + index * 8
    await drawStroke(page, [[200, y], [224, y]], { size: 24 })
  }
  await waitForOperations(page, 'stroke', 112)
  const original = (await operations(page)).filter(op => op.type === 'stroke')
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  const beforeImage = await exportedImage(page)

  // Same context/cookie, new page navigation: take the real cold restore path.
  await joinRoom(page, roomId, 'Teacher')
  await expect.poll(async () => (await operations(page)).filter(op => op.type === 'stroke').length,
    { timeout: slow(30_000) }).toBe(112)
  expect((await operations(page)).filter(op => op.type === 'stroke').map(op => op.id))
    .toEqual(original.map(op => op.id))
  expect(await page.evaluate(() => window.__engine!.getOperationsSinceRestore().filter(op => op.type === 'stroke').length))
    .toBe(12)
  const afterImage = await exportedImage(page)
  const pixelDiff = await page.evaluate(async ([before, after]) => {
    const read = async (url: string) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob())
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width; canvas.height = bitmap.height
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      return context.getImageData(0, 0, canvas.width, canvas.height)
    }
    const a = await read(before), b = await read(after)
    if (a.width !== b.width || a.height !== b.height) throw new Error('export dimensions changed')
    let changedPixels = 0, maxChannelDiff = 0
    for (let index = 0; index < a.data.length; index += 4) {
      let changed = false
      for (let channel = 0; channel < 4; channel++) {
        const difference = Math.abs(a.data[index + channel] - b.data[index + channel])
        maxChannelDiff = Math.max(maxChannelDiff, difference)
        changed ||= difference !== 0
      }
      if (changed) changedPixels++
    }
    return { changedPixels, maxChannelDiff }
  }, [beforeImage, afterImage])
  // #673 also reported tiny pixel differences. Record them separately from
  // the missing operation; a repaired count alone is not a pixel proof.
  test.info().annotations.push({ type: 'snapshot-pixel-diff', description: JSON.stringify(pixelDiff) })
  console.log('snapshot 100+12 export comparison:', JSON.stringify(pixelDiff))

  for (let index = 111; index >= 99; index--) {
    await page.keyboard.press('Control+z')
    await expect.poll(async () => {
      const controls = (await operations(page)).filter(op => op.type === 'operation_undo')
      return controls.at(-1)?.targetOpId
    }).toBe(original[index].id)
  }
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => {
    const controls = (await operations(page)).filter(op => op.type === 'operation_redo')
    return controls.at(-1)?.targetOpId
  }).toBe(original[99].id)
})
