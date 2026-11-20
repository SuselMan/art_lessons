import { expect, test } from '@playwright/test'
import type { BrushImportJob } from '../../packages/shared/src/brushBehavior'
import { createRoom, drawStroke, waitForRoomReady } from '../support/room'

function textChunk(image: Buffer, key: string, value: string) {
  const body = Buffer.from(`${key}\0${value}`), type = Buffer.from('tEXt'), length = Buffer.alloc(4), sum = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  let crc = 0xffffffff
  for (const byte of Buffer.concat([type, body])) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1 }
  sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([image.subarray(0, -12), length, type, body, sum, image.subarray(-12)])
}

test('cold Krita selection waits, cancels safely and draws the first stroke across boards', async ({ page }) => {
  test.skip(!process.env.GRAFETTO_BRUSH_STORAGE_DIR, 'Requires isolated brush storage and a Python/Pillow converter')
  test.setTimeout(180_000)
  const lesson = await createRoom(page); await waitForRoomReady(page)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4x8AAAAASUVORK5CYII=', 'base64')
  const preset = '<Preset name="Review QA Round" paintopid="paintbrush"><param name="brush_definition"><![CDATA[<Brush type="auto_brush" spacing="0.15"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>]]></param></Preset>'
  const imported = await page.request.post('/api/brush-library/imports', { headers: { 'content-type': 'application/octet-stream', 'x-brush-filename': 'Review-QA.kpp' }, data: textChunk(textChunk(png, 'version', '5.0'), 'preset', preset) })
  expect(imported.status()).toBe(202)
  let job = await imported.json() as BrushImportJob
  await expect.poll(async () => { job = await (await page.request.get(`/api/brush-library/imports/${job.id}`)).json() as BrushImportJob; return job.status }).toBe('complete')
  const brush = job.library!.brushes[0].descriptor, ref = `brush:${brush.id}@${brush.version}`
  expect((await page.request.post(`/api/rooms/${lesson}/brush-library`, { data: { presets: [brush.id] } })).ok()).toBe(true)
  expect((await page.request.patch(`/api/rooms/${lesson}/brush-selection`, { data: { references: ['native:pencil', 'native:eraser', 'native:smudge', ref] } })).ok()).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().brushLibraryRevision)).toBeGreaterThan(0)
  // Hold the real preparation boundary, without bypassing resource loading or GPU work.
  await page.evaluate(() => {
    const engine = window.__engine!, original = engine.prepareBrush.bind(engine)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    Object.assign(window, { __releaseReviewBrush: release })
    engine.prepareBrush = async (...args) => { await gate; return original(...args) }
  })
  const choose = async () => {
    await page.getByRole('button', { name: 'Drawing tool', exact: true }).first().click()
    await page.getByRole('option', { name: /Review QA Round/ }).click()
  }
  await choose()
  await expect(page.getByText('Preparing brush…', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('pencil')
  await page.keyboard.press('e')
  await page.evaluate(() => (window as unknown as { __releaseReviewBrush(): void }).__releaseReviewBrush())
  await expect(page.getByText('Preparing brush…', { exact: true })).toBeHidden()
  expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('eraser')
  // Return to the drawing group (first click activates, second opens its chooser).
  await page.getByRole('button', { name: 'Drawing tool', exact: true }).first().click()
  await choose()
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().tool)).toBe('digitalBrush')
  await drawStroke(page, [[350, 300], [450, 350], [550, 310]])
  await expect.poll(() => page.evaluate(() => window.__engine!.getOperations().filter(o => o.type === 'stroke').length)).toBe(1)
  const created = await page.request.post(`/api/rooms/${lesson}/boards`, { data: { name: 'Second QA board' } })
  expect(created.ok()).toBe(true)
  const boards = page.getByRole('button', { name: 'Boards', exact: true })
  await boards.click()
  const tiles = page.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]')
  await expect(tiles).toHaveCount(2)
  for (const index of [1, 0, 1, 0]) {
    await tiles.nth(index).click()
    await expect(tiles.nth(index)).toHaveAttribute('aria-pressed', 'true')
    await waitForRoomReady(page)
    await expect(page.getByText('Could not load the brush resources.', { exact: true })).toHaveCount(0)
  }
  expect(await page.evaluate(() => window.__engine!.getOperations().filter(o => o.type === 'stroke').length)).toBe(1)
})
