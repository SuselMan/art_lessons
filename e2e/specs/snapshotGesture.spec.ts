import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { activeLayerId, createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'
import { DB_CONTAINER, DB_NAME, DB_USER } from '../support/stack'

/** Seed a persisted cold room, not a mocked HTTP response: its resident tail
 * lacks the first chunk, so the server must execute the gesture JSON query. */
test('cold join undoes covered early chunks when Undo names a later chunk, then restores them on Redo', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  const expectedHttp: Promise<void>[] = []
  page.on('response', response => {
    if (response.status() < 400) return
    // Bootstrap publishing may race existing coverage: the server refuses a
    // non-checkpoint upload and the uploader then reads the authoritative
    // index. Thumbnail uploads also have a deliberate 3-second throttle.
    expectedHttp.push((async () => {
      const body = await response.json() as { error?: string }
      const expected = /\/snapshots$/.test(response.url()) && response.status() === 400 && body.error === 'not_a_checkpoint_seq'
        || /\/thumbnail$/.test(response.url()) && response.status() === 429 && body.error === 'rate_limited'
      if (!expected) errors.push(`HTTP ${response.status()}: ${response.url()} ${JSON.stringify(body)}`)
      else test.info().annotations.push({ type: 'expected-http-refusal', description: `${response.status()} ${body.error}` })
    })())
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const expected = /\/snapshots$/.test(message.location().url) && /status of 400/.test(message.text())
      || /\/thumbnail$/.test(message.location().url) && /status of 429/.test(message.text())
    if (!expected) errors.push(message.text())
  })
  const source = await createRoom(page)
  await waitForRoomReady(page)
  const layer = await activeLayerId(page)
  await drawStroke(page, [[500, 250], [580, 280]])
  await waitForOperations(page, 'stroke')
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  const stroke = (await operations(page)).find(op => op.type === 'stroke')!
  const fixture = await page.evaluate(id => {
    const raw = window.__engine!.bakeNetworkSnapshot(id)
    if (!raw) throw new Error('fixture stroke did not paint')
    return { raw: Array.from(raw), state: window.__roomStore!.getState().layerState }
  }, layer)
  // Leave the source before seeding: no uploader can overwrite our fixture.
  await page.goto('/'); await page.waitForURL(/\/$/)
  const room = randomUUID(), gesture = randomUUID()
  const first = { ...stroke, id: randomUUID(), seq: 1, strokeId: gesture }
  const dry = { id: randomUUID(), type: 'paper_dry', layerId: layer, userId: stroke.userId, timestamp: 2, seq: 2 }
  const last = { ...stroke, id: randomUUID(), seq: 3, strokeId: gesture }
  const undo = { id: randomUUID(), type: 'operation_undo', targetOpId: last.id, userId: stroke.userId, timestamp: 4, seq: 4 }
  const q = (value: string) => "'" + value.replaceAll("'", "''") + "'"
  const json = (value: unknown) => q(JSON.stringify(value)) + '::jsonb'
  const raw = Buffer.from(fixture.raw), hash = createHash('sha256').update(raw).digest('hex')
  const sql = [
    `INSERT INTO "Room" (id,name,paper,"ownerId",infinite,"canvasWidth","canvasHeight","enabledTools") SELECT ${q(room)},'Gesture fixture',paper,"ownerId",infinite,"canvasWidth","canvasHeight",'{}' FROM "Room" WHERE id=${q(source)};`,
    ...[first, dry, last, undo].map(op => `INSERT INTO "Operation" (id,seq,type,"roomId","userId","layerId",data) VALUES (${q(op.id)},${op.seq},${q(op.type)},${q(room)},${q(op.userId)},${'layerId' in op ? q(op.layerId) : 'NULL'},${json(op)});`),
    `INSERT INTO "RoomLayerState" (id,"roomId",seq,state,"updatedAt") VALUES (${q(randomUUID())},${q(room)},2,${json(fixture.state)},NOW());`,
    `INSERT INTO "RoomLayerSnapshot" (id,"roomId","layerId",seq,data,hash) VALUES (${q(randomUUID())},${q(room)},${q(layer)},2,decode(${q(gzipSync(raw).toString('hex'))},'hex'),${q(hash)});`,
  ].join('\n')
  execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] })
  await joinRoom(page, room, 'Teacher')
  const response = await page.request.get(`/api/rooms/${room}/snapshots/index`)
  expect(response.status()).toBe(200)
  const index = await response.json() as { layers: { layerId: string }[] }
  expect(index.layers.some(item => item.layerId === layer)).toBe(false)
  const history = await page.evaluate(() => (window.__engine! as unknown as { _log: { entries: { op: { type: string; id: string }; state: string }[] } })._log.entries.filter(entry => entry.op.type === 'stroke').map(entry => ({ id: entry.op.id, state: entry.state })))
  expect(history).toEqual([{ id: first.id, state: 'undone' }, { id: last.id, state: 'undone' }])
  const painted = () => page.evaluate(async id => {
    const url = '/src/engine/snapshots.ts'
    const { decodeLayerTiles } = await import(url) as typeof import('../../apps/web/src/engine/snapshots')
    const raw = window.__engine!.bakeNetworkSnapshot(id)
    return raw !== null && decodeLayerTiles(raw, 0).tiles.some(tile => tile.pixels.some((value, index) => index % 4 === 3 && value > 0))
  }, layer)
  expect(await painted()).toBe(false)
  await page.keyboard.press('Control+Shift+z')
  await waitForOperations(page, 'operation_redo')
  await expect.poll(painted).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await joinRoom(page, room, 'Teacher')
  await expect.poll(painted).toBe(true)
  await Promise.all(expectedHttp)
  expect(errors).toEqual([])
})
