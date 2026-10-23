# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: roomOpenMetrics.spec.ts >> saves actual room finishes and distinguishes re-entry into the same room
- Location: e2e/specs/roomOpenMetrics.spec.ts:14:5

# Error details

```
Error: Command failed: docker exec grafetto_pg_e2e psql -U e2e -d e2e -Atc select row_to_json(m) from "RoomOpenMeasurement" m where "attemptId"='138b0d77-b6a2-48b9-ab8f-433fdeb154e2'
Error response from daemon: No such container: grafetto_pg_e2e

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - banner [ref=f1e4]:
    - button "Grafetto — leave this project" [ref=f1e5] [cursor=pointer]:
      - img "Grafetto" [ref=f1e6]
    - button "Open metrics" [ref=f1e18] [cursor=pointer]
    - status [ref=f1e19]:
      - generic [ref=f1e21]: Saved
    - generic [ref=f1e22]:
      - button "0°" [ref=f1e23] [cursor=pointer]:
        - generic [ref=f1e24]: 
        - text: 0°
      - button "Lock canvas rotation" [ref=f1e25] [cursor=pointer]:
        - generic [ref=f1e26]: 
      - button "32%" [ref=f1e28] [cursor=pointer]
      - button "Fit canvas" [ref=f1e29] [cursor=pointer]:
        - generic [ref=f1e30]: 
      - button "Undo" [ref=f1e32] [cursor=pointer]:
        - generic [ref=f1e33]: 
      - button "Redo" [ref=f1e34] [cursor=pointer]:
        - generic [ref=f1e35]: 
      - button "Annotations" [ref=f1e37] [cursor=pointer]:
        - generic [ref=f1e38]: 
      - button "Boards" [ref=f1e40] [cursor=pointer]:
        - generic [ref=f1e41]: 
      - button "Fullscreen" [ref=f1e43] [cursor=pointer]:
        - generic [ref=f1e44]: 
      - button "Menu" [ref=f1e47] [cursor=pointer]:
        - generic [ref=f1e48]: 
  - generic [ref=f1e49]:
    - generic [ref=f1e50]:
      - complementary [ref=f1e51]:
        - button "Color" [ref=f1e52] [cursor=pointer]
        - button "Drawing tool" [pressed] [ref=f1e55] [cursor=pointer]:
          - generic [ref=f1e56]: 
        - button "Eraser E" [ref=f1e58] [cursor=pointer]:
          - generic [ref=f1e59]: 
        - button "Smudge" [ref=f1e60] [cursor=pointer]
        - button "Hand" [ref=f1e68] [cursor=pointer]:
          - generic [ref=f1e69]: 
        - button "Eyedropper" [ref=f1e70] [cursor=pointer]:
          - generic [ref=f1e71]: 
        - button "Ruler" [ref=f1e72] [cursor=pointer]:
          - generic [ref=f1e73]: 
        - button "Transform" [ref=f1e74] [cursor=pointer]
        - button "Select" [ref=f1e86] [cursor=pointer]:
          - generic [ref=f1e87]: 
        - button "Fill" [ref=f1e88] [cursor=pointer]:
          - generic [ref=f1e89]: 
        - button "Shape" [ref=f1e90] [cursor=pointer]:
          - generic [ref=f1e91]: 
        - button "Grid" [ref=f1e94] [cursor=pointer]:
          - generic [ref=f1e95]: 
      - complementary [ref=f1e96]:
        - generic "Grade" [ref=f1e97]:
          - button "Grade" [ref=f1e98] [cursor=pointer]
          - generic [ref=f1e99]: HB
        - generic "Size" [ref=f1e100]:
          - generic [ref=f1e102]: 4px
          - slider "Size" [ref=f1e104] [cursor=pointer]
        - generic "Opacity" [ref=f1e105]:
          - generic [ref=f1e107]: 100%
          - slider "Opacity" [ref=f1e109] [cursor=pointer]
    - generic [ref=f1e114]:
      - generic [ref=f1e115]:
        - button "Collapse Layers" [ref=f1e116] [cursor=pointer]:
          - generic [ref=f1e117]: 
        - button "Open Color" [ref=f1e118] [cursor=pointer]:
          - generic [ref=f1e119]: 
        - button "Open Class" [ref=f1e120] [cursor=pointer]:
          - generic [ref=f1e121]: 
        - button "Open Tool settings" [ref=f1e122] [cursor=pointer]:
          - generic [ref=f1e123]: 
      - generic [ref=f1e124]:
        - generic [ref=f1e125]:
          - generic [ref=f1e126]: Layers
          - button "Collapse" [ref=f1e127] [cursor=pointer]:
            - generic [ref=f1e128]: 
        - generic [ref=f1e129]:
          - generic [ref=f1e130]:
            - generic [ref=f1e131]: Opacity
            - slider "Opacity" [ref=f1e132] [cursor=pointer]
            - generic [ref=f1e133]: 100%
          - generic [ref=f1e134]:
            - button "Add layer" [ref=f1e135] [cursor=pointer]:
              - generic [ref=f1e136]: 
            - button "Add folder" [ref=f1e137] [cursor=pointer]:
              - generic [ref=f1e138]: 
            - button "Import reference image" [ref=f1e139] [cursor=pointer]:
              - generic [ref=f1e140]: 
            - button "Lock layer" [ref=f1e141] [cursor=pointer]:
              - generic [ref=f1e142]: 
            - button "Lock layer for others" [ref=f1e143] [cursor=pointer]:
              - generic [ref=f1e144]: 
            - button "Show only this layer" [ref=f1e145] [cursor=pointer]:
              - generic [ref=f1e146]: 
            - button "Merge down" [ref=f1e147] [cursor=pointer]:
              - generic [ref=f1e148]: 
            - button "Delete layer" [ref=f1e149] [cursor=pointer]:
              - generic [ref=f1e150]: 
          - generic [ref=f1e151]:
            - button "Hide Lock Lock layer for others Layer 1 100% More" [ref=f1e152]:
              - generic "Drag to reorder" [ref=f1e153]: 
              - button "Hide" [ref=f1e155] [cursor=pointer]:
                - generic [ref=f1e156]: 
              - button "Lock" [ref=f1e157] [cursor=pointer]:
                - generic [ref=f1e158]: 
              - button "Lock layer for others" [ref=f1e159] [cursor=pointer]:
                - generic [ref=f1e160]: 
              - generic [ref=f1e161]: 
              - generic [ref=f1e163]: Layer 1
              - generic "Opacity" [ref=f1e164]: 100%
              - button "More" [ref=f1e166] [cursor=pointer]:
                - generic [ref=f1e167]: 
            - button "Hide The background is always locked Background 100%" [disabled] [ref=f1e168]:
              - button "Hide" [disabled] [ref=f1e169] [cursor=pointer]:
                - generic [ref=f1e170]: 
              - button "The background is always locked" [disabled] [ref=f1e171] [cursor=pointer]:
                - generic [ref=f1e172]: 
              - generic [ref=f1e173]: 
              - generic [ref=f1e175]: Background
              - generic "Opacity" [ref=f1e176]: 100%
            - status [ref=f1e177]
    - generic "Drag to move":
      - button "Open palette"
      - button "Drawing tool" [pressed]:
        - generic: 
      - button "Empty slot"
      - button "Redo":
        - generic: 
      - button "Empty slot"
      - button "Eraser":
        - generic: 
      - button "Empty slot"
      - button "Undo":
        - generic: 
      - button "Empty slot"
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
     |                           ^ Error: Command failed: docker exec grafetto_pg_e2e psql -U e2e -d e2e -Atc select row_to_json(m) from "RoomOpenMeasurement" m where "attemptId"='138b0d77-b6a2-48b9-ab8f-433fdeb154e2'
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