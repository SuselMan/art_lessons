# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rebuildSpill.spec.ts >> five watercolor authors survive undo, late continuation, redo and fresh replay without finished-wash spills
- Location: e2e/specs/rebuildSpill.spec.ts:28:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - button "Grafetto — leave this project" [ref=e5] [cursor=pointer]:
      - img "Grafetto" [ref=e6]
    - button "QA five watercolor cache histories" [ref=e18] [cursor=pointer]
    - status [ref=e19]:
      - generic [ref=e21]: Saved
    - generic [ref=e22]:
      - button "0°" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: 
        - text: 0°
      - button "Lock canvas rotation" [ref=e25] [cursor=pointer]:
        - generic [ref=e26]: 
      - button "32%" [ref=e28] [cursor=pointer]
      - button "Fit canvas" [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: 
      - button "Undo" [ref=e32] [cursor=pointer]:
        - generic [ref=e33]: 
      - button "Redo" [ref=e34] [cursor=pointer]:
        - generic [ref=e35]: 
      - button "Annotations" [ref=e37] [cursor=pointer]:
        - generic [ref=e38]: 
      - button "Boards" [ref=e40] [cursor=pointer]:
        - generic [ref=e41]: 
      - button "Fullscreen" [ref=e43] [cursor=pointer]:
        - generic [ref=e44]: 
      - button "Menu" [ref=e47] [cursor=pointer]:
        - generic [ref=e48]: 
  - generic [ref=e49]:
    - generic [ref=e50]:
      - complementary [ref=e51]:
        - button "Color" [ref=e52] [cursor=pointer]
        - button "Drawing tool" [pressed] [ref=e55] [cursor=pointer]:
          - generic [ref=e56]: 
        - button "Eraser E" [ref=e58] [cursor=pointer]:
          - generic [ref=e59]: 
        - button "Smudge" [ref=e60] [cursor=pointer]
        - button "Hand" [ref=e68] [cursor=pointer]:
          - generic [ref=e69]: 
        - button "Eyedropper" [ref=e70] [cursor=pointer]:
          - generic [ref=e71]: 
        - button "Ruler" [ref=e72] [cursor=pointer]:
          - generic [ref=e73]: 
        - button "Transform" [ref=e74] [cursor=pointer]
        - button "Select" [ref=e86] [cursor=pointer]:
          - generic [ref=e87]: 
        - button "Fill" [ref=e88] [cursor=pointer]:
          - generic [ref=e89]: 
        - button "Shape" [ref=e90] [cursor=pointer]:
          - generic [ref=e91]: 
        - button "Grid" [ref=e94] [cursor=pointer]:
          - generic [ref=e95]: 
      - complementary [ref=e96]:
        - generic "Grade" [ref=e97]:
          - button "Grade" [ref=e98] [cursor=pointer]
          - generic [ref=e99]: HB
        - generic "Size" [ref=e100]:
          - generic [ref=e102]: 30px
          - slider "Size" [ref=e104] [cursor=pointer]
        - generic "Opacity" [ref=e105]:
          - generic [ref=e107]: 100%
          - slider "Opacity" [ref=e109] [cursor=pointer]
    - generic [ref=e114]:
      - generic [ref=e115]:
        - button "Collapse Layers" [ref=e116] [cursor=pointer]:
          - generic [ref=e117]: 
        - button "Open Color" [ref=e118] [cursor=pointer]:
          - generic [ref=e119]: 
        - button "Open Class" [ref=e120] [cursor=pointer]:
          - generic [ref=e121]: 
        - button "Open Tool settings" [ref=e122] [cursor=pointer]:
          - generic [ref=e123]: 
      - generic [ref=e124]:
        - generic [ref=e125]:
          - generic [ref=e126]: Layers
          - button "Collapse" [ref=e127] [cursor=pointer]:
            - generic [ref=e128]: 
        - generic [ref=e129]:
          - generic [ref=e130]:
            - generic [ref=e131]: Opacity
            - slider "Opacity" [ref=e132] [cursor=pointer]
            - generic [ref=e133]: 100%
          - generic [ref=e134]:
            - button "Add layer" [ref=e135] [cursor=pointer]:
              - generic [ref=e136]: 
            - button "Add folder" [ref=e137] [cursor=pointer]:
              - generic [ref=e138]: 
            - button "Import reference image" [ref=e139] [cursor=pointer]:
              - generic [ref=e140]: 
            - button "Lock layer" [ref=e141] [cursor=pointer]:
              - generic [ref=e142]: 
            - button "Lock layer for others" [ref=e143] [cursor=pointer]:
              - generic [ref=e144]: 
            - button "Show only this layer" [ref=e145] [cursor=pointer]:
              - generic [ref=e146]: 
            - button "Merge down" [ref=e147] [cursor=pointer]:
              - generic [ref=e148]: 
            - button "Delete layer" [ref=e149] [cursor=pointer]:
              - generic [ref=e150]: 
          - generic [ref=e151]:
            - button "Hide Lock Lock layer for others Layer 1 100% More" [ref=e152]:
              - generic "Drag to reorder" [ref=e153]: 
              - button "Hide" [ref=e155] [cursor=pointer]:
                - generic [ref=e156]: 
              - button "Lock" [ref=e157] [cursor=pointer]:
                - generic [ref=e158]: 
              - button "Lock layer for others" [ref=e159] [cursor=pointer]:
                - generic [ref=e160]: 
              - generic [ref=e161]: 
              - generic [ref=e163]: Layer 1
              - generic "Opacity" [ref=e164]: 100%
              - button "More" [ref=e166] [cursor=pointer]:
                - generic [ref=e167]: 
            - button "Hide The background is always locked Background 100%" [disabled] [ref=e168]:
              - button "Hide" [disabled] [ref=e169] [cursor=pointer]:
                - generic [ref=e170]: 
              - button "The background is always locked" [disabled] [ref=e171] [cursor=pointer]:
                - generic [ref=e172]: 
              - generic [ref=e173]: 
              - generic [ref=e175]: Background
              - generic "Opacity" [ref=e176]: 100%
            - status [ref=e177]
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
  4   | 
  5   | import { activeLayerId, createRoom, drawStroke, joinRoom, waitForOperations, waitForRoomReady } from '../support/room'
  6   | 
  7   | async function settled(page: Page) {
  8   |   await expect.poll(() => page.evaluate(() => {
  9   |     const e = window.__engine as unknown as { _rebuildJobs: Map<string, unknown>; _settle: unknown; _opQueue: unknown[] }
  10  |     return e._rebuildJobs.size === 0 && !e._settle && e._opQueue.length === 0
  11  |   }), { timeout: 90_000 }).toBe(true)
  12  | }
  13  | 
  14  | async function hashes(page: Page, layerId: string) {
  15  |   return page.evaluate(async id => {
  16  |     const e = window.__engine as unknown as { _layers: Map<string, { allResident(): Array<{ originX: number; originY: number; buffer: { readPixels(): Uint8Array } }> }> }
  17  |     const out: Array<{ x: number; y: number; hash: string }> = []
  18  |     for (const t of e._layers.get(id)!.allResident()) {
  19  |       const pixels = t.buffer.readPixels()
  20  |       if (!pixels.some((v, i) => i % 4 === 3 && v > 0)) continue
  21  |       const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pixels)))
  22  |       out.push({ x: t.originX, y: t.originY, hash: [...digest].map(v => v.toString(16).padStart(2, '0')).join('') })
  23  |     }
  24  |     return out.sort((a, b) => a.y - b.y || a.x - b.x)
  25  |   }, layerId)
  26  | }
  27  | 
  28  | test('five watercolor authors survive undo, late continuation, redo and fresh replay without finished-wash spills', { tag: '@two-browsers' }, async ({ page, browser, playwright }) => {
  29  |   test.setTimeout(180_000)
  30  |   const sockets: Socket[] = []
  31  |   const requests = []
  32  |   const contexts = []
  33  |   try {
  34  |     const roomId = await createRoom(page, 'QA five watercolor cache histories')
  35  |     await waitForRoomReady(page)
  36  |     const layerId = await activeLayerId(page)
  37  |     const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
  38  |     contexts.push(context)
  39  |     const peer = await context.newPage()
  40  |     await joinRoom(peer, roomId, 'Raster witness')
  41  |     const box = (await page.locator('canvas').first().boundingBox())!
  42  |     await drawStroke(page, [[box.width / 2 - 80, box.height / 2], [box.width / 2 + 80, box.height / 2]], { size: 30 })
  43  |     await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke')))
  44  |     const donors: Array<{ socket: Socket; userId: string; washId: string }> = []
  45  |     for (let i = 0; i < 5; i++) {
  46  |       const request = await playwright.request.newContext({ baseURL: new URL(page.url()).origin, ignoreHTTPSErrors: true })
  47  |       requests.push(request)
  48  |       expect((await request.get('/api/me')).ok()).toBe(true)
  49  |       const cookie = (await request.storageState()).cookies.map(c => `${c.name}=${c.value}`).join('; ')
  50  |       const socket = io(new URL(page.url()).origin, { transports: ['websocket'], rejectUnauthorized: false, extraHeaders: { Cookie: cookie }, forceNew: true, autoConnect: false })
  51  |       sockets.push(socket)
  52  |       await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect() })
  53  |       const joined = await socket.timeout(10_000).emitWithAck('join_room', { roomId, name: `Watercolor author ${i + 1}` }) as { ok: boolean; userId: string }
  54  |       expect(joined.ok).toBe(true)
  55  |       donors.push({ socket, userId: joined.userId, washId: randomUUID() })
  56  |     }
  57  |     await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().participants.length)).toBe(7)
  58  |     const paint = async (i: number, y: number) => {
  59  |       const donor = donors[i], id = randomUUID()
  60  |       const ack = await donor.socket.timeout(10_000).emitWithAck('operation', {
  61  |         id, type: 'stroke', strokeId: id, washId: donor.washId, userId: donor.userId, layerId, timestamp: Date.now(),
  62  |         tool: 'watercolor', preset: 'normal:55:60:PB29:round', color: [0.1 + i * 0.1, 0.2, 0.5],
  63  |         dabs: Array.from({ length: 8 }, (_, n) => ({ x: 780 + i * 10 + n * 16, y: y + n * 4, pressure: 0.8, tiltX: 0, tiltY: 0, size: 40, aspectRatio: 1, angle: 0, opacity: 0.5, t: n * 20 })),
  64  |       }) as { ok: boolean }
  65  |       expect(ack.ok).toBe(true)
  66  |     }
  67  |     await Promise.all(donors.map((_, i) => paint(i, 1100 + i * 30)))
  68  |     await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke', 6)))
  69  |     await Promise.all([page, peer].map(settled))
  70  |     for (const p of [page, peer]) await p.evaluate(() => {
  71  |       const e = window.__engine as unknown as { gl: WebGLRenderingContext; _inJobStep: boolean }
  72  |       const read = e.gl.readPixels.bind(e.gl)
  73  |       const probe = { readsInRebuild: 0 }
  74  |       Object.assign(window, { __qaSpill: probe })
  75  |       e.gl.readPixels = (...args: Parameters<WebGLRenderingContext['readPixels']>) => { if (e._inJobStep) probe.readsInRebuild++; return read(...args) }
  76  |     })
  77  |     // Hold one renderer after the first wash has been retired, then deliver
  78  |     // its continuation through the real server while that rebuild is live.
  79  |     await page.evaluate(washId => {
  80  |       const e = window.__engine as unknown as {
  81  |         _stepRebuildJob(job: { timer: ReturnType<typeof setTimeout> }): void;
  82  |         _lostWashes: Map<string, unknown>; _rebuildJobs: Map<string, unknown>;
  83  |       }
  84  |       const step = e._stepRebuildJob.bind(e)
  85  |       const gate = { held: false, released: false }
  86  |       Object.assign(window, { __qaRebuildGate: gate })
  87  |       e._stepRebuildJob = job => {
  88  |         if (!gate.released && (gate.held || e._lostWashes.has(washId))) {
  89  |           gate.held = true
  90  |           job.timer = setTimeout(() => e._stepRebuildJob(job), 16)
  91  |           return
  92  |         }
  93  |         step(job)
  94  |       }
  95  |     }, donors[0].washId)
  96  |     const undo = await page.evaluate(() => {
  97  |       const e = window.__engine! as typeof window.__engine & { _rebuildJobs: Map<string, unknown> }
  98  |       const target = e!.undo()
  99  |       return { type: target?.type, jobs: e!._rebuildJobs.size }
  100 |     })
  101 |     expect(undo.type).toBe('stroke')
  102 |     expect(undo.jobs).toBeGreaterThan(0)
  103 |     await Promise.all([page, peer].map(p => waitForOperations(p, 'operation_undo')))
> 104 |     await expect.poll(() => page.evaluate(() => (window as unknown as { __qaRebuildGate: { held: boolean } }).__qaRebuildGate.held), { timeout: 30_000 }).toBe(true)
      |                                                                                                                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  105 |     await paint(0, 1350)
  106 |     await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke', 6)))
  107 |     await page.evaluate(() => { (window as unknown as { __qaRebuildGate: { released: boolean } }).__qaRebuildGate.released = true })
  108 |     await Promise.all([page, peer].map(settled))
  109 |     for (const p of [page, peer]) expect(await p.evaluate(() => (window as unknown as { __qaSpill: { readsInRebuild: number } }).__qaSpill.readsInRebuild)).toBe(0)
  110 |     const reference = await hashes(page, layerId)
  111 |     expect(reference.length).toBeGreaterThan(0)
  112 |     expect(await hashes(peer, layerId)).toEqual(reference)
  113 |     await page.evaluate(() => window.__engine!.redo())
  114 |     await Promise.all([page, peer].map(p => waitForOperations(p, 'operation_redo')))
  115 |     await Promise.all([page, peer].map(p => waitForOperations(p, 'stroke', 7)))
  116 |     await Promise.all([page, peer].map(settled))
  117 |     expect(await hashes(peer, layerId)).toEqual(await hashes(page, layerId))
  118 |     const lateContext = await browser.newContext({ ignoreHTTPSErrors: true })
  119 |     contexts.push(lateContext)
  120 |     const late = await lateContext.newPage()
  121 |     await joinRoom(late, roomId, 'Fresh replay witness')
  122 |     await waitForOperations(late, 'operation_redo')
  123 |     await settled(late)
  124 |     expect(await hashes(late, layerId)).toEqual(await hashes(page, layerId))
  125 |   } finally {
  126 |     for (const socket of sockets) socket.disconnect()
  127 |     for (const request of requests) await request.dispose()
  128 |     for (const context of contexts) await context.close()
  129 |   }
  130 | })
  131 | 
```