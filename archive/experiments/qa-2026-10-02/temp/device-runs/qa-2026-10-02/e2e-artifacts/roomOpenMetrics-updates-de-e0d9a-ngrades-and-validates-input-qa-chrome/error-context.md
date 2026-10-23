# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: roomOpenMetrics.spec.ts >> updates delayed finishes without duplicates or downgrades and validates input
- Location: e2e/specs/roomOpenMetrics.spec.ts:64:5

# Error details

```
Error: Command failed: docker exec grafetto_pg_e2e psql -U e2e -d e2e -Atc select row_to_json(m) from "RoomOpenMeasurement" m where "attemptId"='ce6759c4-fc1f-4635-840d-38e6020bf631'
Error response from daemon: No such container: grafetto_pg_e2e

```

# Test source

```ts
  1  | import { execFileSync } from 'node:child_process'
  2  | import { randomUUID } from 'node:crypto'
  3  | import { expect, test } from '@playwright/test'
  4  | import type { RoomOpenMeasurement } from '../../packages/shared/src/index'
  5  | import { createRoom, waitForRoomReady } from '../support/room'
  6  | import { DB_CONTAINER, DB_NAME, DB_USER, E2E_APP_VERSION } from '../support/stack'
  7  | 
  8  | function stored(attemptId: string) {
  9  |   const sql = `select row_to_json(m) from "RoomOpenMeasurement" m where "attemptId"='${attemptId}'`
> 10 |   const out = execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-Atc', sql], { encoding: 'utf8' }).trim()
     |                           ^ Error: Command failed: docker exec grafetto_pg_e2e psql -U e2e -d e2e -Atc select row_to_json(m) from "RoomOpenMeasurement" m where "attemptId"='ce6759c4-fc1f-4635-840d-38e6020bf631'
  11 |   return out ? JSON.parse(out) : null
  12 | }
  13 | 
  14 | test('saves actual room finishes and distinguishes re-entry into the same room', async ({ page }) => {
  15 |   const delivered: RoomOpenMeasurement[] = []
  16 |   page.on('request', r => { if (r.url().endsWith('/api/me/room-open')) delivered.push(r.postDataJSON()) })
  17 |   await page.bringToFront()
  18 |   const roomId = await createRoom(page, 'Open metrics')
  19 |   await waitForRoomReady(page)
  20 |   // Creating a brand-new room is not a join attempt. Time actual entries
  21 |   // through the same gate used when opening a homework link.
  22 |   await page.reload()
  23 |   await page.locator('form button[type="submit"]').click()
  24 |   await expect.poll(() => delivered.filter(m => m.report.outcome === 'ready').length).toBe(1)
  25 |   const first = delivered.find(m => m.report.outcome === 'ready')!
  26 |   await expect.poll(() => stored(first.attemptId)?.outcome).toBe('ready')
  27 |   expect(stored(first.attemptId)).toMatchObject({ roomId, totalMs: first.report.totalMs,
  28 |     appVersion: E2E_APP_VERSION, deviceType: 'desktop', wasHidden: false })
  29 |   await page.reload()
  30 |   const submit = page.locator('form button[type="submit"]')
  31 |   await expect(submit).toBeVisible()
  32 |   await submit.click()
  33 |   await expect.poll(() => delivered.filter(m => m.report.outcome === 'ready').length).toBe(2)
  34 |   const second = delivered.filter(m => m.report.outcome === 'ready')[1]
  35 |   expect(second.attemptId).not.toBe(first.attemptId)
  36 |   await expect.poll(() => stored(second.attemptId)?.outcome).toBe('ready')
  37 | })
  38 | 
  39 | test('a real slow entry saves both the alarm and its eventual finish', async ({ page, browser }) => {
  40 |   const roomId = await createRoom(page, 'Delayed open metrics')
  41 |   await waitForRoomReady(page)
  42 |   const peer = await browser.newPage()
  43 |   const delivered: RoomOpenMeasurement[] = []
  44 |   try {
  45 |     await peer.route('**/paper/*.paper', async route => {
  46 |       await new Promise(resolve => setTimeout(resolve, 13_000))
  47 |       await route.continue()
  48 |     })
  49 |     peer.on('request', r => { if (r.url().endsWith('/api/me/room-open')) delivered.push(r.postDataJSON()) })
  50 |     await peer.goto(new URL(`/room/${roomId}`, page.url()).href)
  51 |     await peer.bringToFront()
  52 |     await peer.locator('form button[type="submit"]').click()
  53 |     await expect.poll(() => delivered.some(m => m.report.outcome === 'stalled')).toBe(true)
  54 |     await expect.poll(() => delivered.some(m => m.report.outcome === 'ready')).toBe(true)
  55 |     const alarm = delivered.find(m => m.report.outcome === 'stalled')!
  56 |     const finish = delivered.find(m => m.report.outcome === 'ready')!
  57 |     expect(finish.attemptId).toBe(alarm.attemptId)
  58 |     expect(finish.report.totalMs).toBeGreaterThan(alarm.report.totalMs)
  59 |     await expect.poll(() => stored(finish.attemptId)?.totalMs).toBe(finish.report.totalMs)
  60 |     expect(stored(finish.attemptId).outcome).toBe('ready')
  61 |   } finally { await peer.close() }
  62 | })
  63 | 
  64 | test('updates delayed finishes without duplicates or downgrades and validates input', async ({ request }) => {
  65 |   await request.get('/api/me')
  66 |   const m: RoomOpenMeasurement = { attemptId: randomUUID(), roomId: 'diagnostic-room', appVersion: 'test',
  67 |     deviceType: 'tablet', wasHidden: true,
  68 |     report: { outcome: 'stalled', totalMs: 10000, stages: { join: 10000 }, reached: 'join', facts: {} } }
  69 |   expect((await request.post('/api/me/room-open', { data: m })).ok()).toBe(true)
  70 |   expect(stored(m.attemptId)).toMatchObject({ outcome: 'stalled', totalMs: 10000 })
  71 |   const finish = { ...m, report: { ...m.report, outcome: 'ready', totalMs: 25000, stages: { join: 25000 } } }
  72 |   const responses = await Promise.all([finish, m, finish, m].map(data => request.post('/api/me/room-open', { data })))
  73 |   expect(responses.every(r => r.ok())).toBe(true)
  74 |   expect(stored(m.attemptId)).toMatchObject({ outcome: 'ready', totalMs: 25000, wasHidden: true })
  75 |   expect((await request.post('/api/me/room-open', { data: { ...m, report: { ...m.report, totalMs: -1 } } })).status()).toBe(400)
  76 | })
  77 | 
```