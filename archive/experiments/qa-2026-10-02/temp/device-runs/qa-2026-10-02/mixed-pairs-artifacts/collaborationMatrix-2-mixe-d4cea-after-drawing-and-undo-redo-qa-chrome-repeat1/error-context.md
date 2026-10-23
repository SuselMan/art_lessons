# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaborationMatrix.spec.ts >> 2 mixed-tool authors (watercolor, eraser) converge after drawing and undo/redo
- Location: e2e/specs/collaborationMatrix.spec.ts:86:5

# Error details

```
Error: mixed tools must reproduce the confirmed order

mixed tools must reproduce the confirmed order

expect(received).toBeLessThan(expected)

Expected: < 0.03
Received:   0.07058823529411762

Call Log:
- Timeout 120000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - button "Grafetto — leave this project" [ref=e5] [cursor=pointer]:
      - img "Grafetto" [ref=e6]
    - button "QA mixed-tool conflict" [ref=e18] [cursor=pointer]
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
          - generic [ref=e56]: 
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
        - generic "Nib" [ref=e97]:
          - button "Nib" [ref=e98] [cursor=pointer]
          - generic [ref=e107]: Round
        - generic "Mix" [ref=e108]:
          - button "Mix" [ref=e109] [cursor=pointer]:
            - generic [ref=e110]: 
          - generic [ref=e112]: Damp
        - generic "Size" [ref=e113]:
          - generic [ref=e115]: 48px
          - slider "Size" [ref=e117] [cursor=pointer]
        - generic "Water" [ref=e118]:
          - generic [ref=e120]: 55%
          - slider "Water" [ref=e122] [cursor=pointer]
        - generic "Pigment" [ref=e123]:
          - generic [ref=e125]: 60%
          - slider "Pigment" [ref=e127] [cursor=pointer]
        - button "Dry everything" [ref=e128] [cursor=pointer]:
          - generic [ref=e129]: 
    - generic [ref=e134]:
      - generic [ref=e135]:
        - button "Collapse Layers" [ref=e136] [cursor=pointer]:
          - generic [ref=e137]: 
        - button "Open Color" [ref=e138] [cursor=pointer]:
          - generic [ref=e139]: 
        - button "Open Class" [ref=e140] [cursor=pointer]:
          - generic [ref=e141]: 
        - button "Open Tool settings" [ref=e142] [cursor=pointer]:
          - generic [ref=e143]: 
      - generic [ref=e144]:
        - generic [ref=e145]:
          - generic [ref=e146]: Layers
          - button "Collapse" [ref=e147] [cursor=pointer]:
            - generic [ref=e148]: 
        - generic [ref=e149]:
          - generic [ref=e150]:
            - generic [ref=e151]: Opacity
            - slider "Opacity" [ref=e152] [cursor=pointer]
            - generic [ref=e153]: 100%
          - generic [ref=e154]:
            - button "Add layer" [ref=e155] [cursor=pointer]:
              - generic [ref=e156]: 
            - button "Add folder" [ref=e157] [cursor=pointer]:
              - generic [ref=e158]: 
            - button "Import reference image" [ref=e159] [cursor=pointer]:
              - generic [ref=e160]: 
            - button "Lock layer" [ref=e161] [cursor=pointer]:
              - generic [ref=e162]: 
            - button "Lock layer for others" [ref=e163] [cursor=pointer]:
              - generic [ref=e164]: 
            - button "Show only this layer" [ref=e165] [cursor=pointer]:
              - generic [ref=e166]: 
            - button "Merge down" [ref=e167] [cursor=pointer]:
              - generic [ref=e168]: 
            - button "Delete layer" [ref=e169] [cursor=pointer]:
              - generic [ref=e170]: 
          - generic [ref=e171]:
            - button "Hide Lock Lock layer for others Layer 1 100% More" [ref=e172]:
              - generic "Drag to reorder" [ref=e173]: 
              - button "Hide" [ref=e175] [cursor=pointer]:
                - generic [ref=e176]: 
              - button "Lock" [ref=e177] [cursor=pointer]:
                - generic [ref=e178]: 
              - button "Lock layer for others" [ref=e179] [cursor=pointer]:
                - generic [ref=e180]: 
              - generic [ref=e181]: 
              - generic [ref=e183]: Layer 1
              - generic "Opacity" [ref=e184]: 100%
              - button "More" [ref=e186] [cursor=pointer]:
                - generic [ref=e187]: 
            - button "Hide The background is always locked Background 100%" [disabled] [ref=e188]:
              - button "Hide" [disabled] [ref=e189] [cursor=pointer]:
                - generic [ref=e190]: 
              - button "The background is always locked" [disabled] [ref=e191] [cursor=pointer]:
                - generic [ref=e192]: 
              - generic [ref=e193]: 
              - generic [ref=e195]: Background
              - generic "Opacity" [ref=e196]: 100%
            - status [ref=e197]
    - generic "Drag to move":
      - button "Open palette"
      - button "Drawing tool" [pressed]:
        - generic: 
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
  23  |     await createRoom(page, `QA ${count} participants`)
  24  |     await waitForRoomReady(page)
  25  |     const roomId = new URL(page.url()).pathname.split('/').pop()!
  26  |     const contexts = []
  27  |     const pages = [page]
  28  |     try {
  29  |       for (let i = 1; i < count; i++) {
  30  |         const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
  31  |         contexts.push(context)
  32  |         const peer = await context.newPage()
  33  |         await joinRoom(peer, roomId, `QA participant ${i + 1}`)
  34  |         pages.push(peer)
  35  |       }
  36  |       await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().participants.length)).toBe(count)
  37  |       const userIds = await Promise.all(pages.map(p => p.evaluate(() => window.__roomStore!.getState().userId)))
  38  |       expect(new Set(userIds).size, 'contexts must represent different people').toBe(count)
  39  | 
  40  |       await Promise.all(pages.map(async (p, i) => {
  41  |         const box = await p.locator('canvas').first().boundingBox()
  42  |         if (!box) throw new Error('no canvas')
  43  |         const x = box.width / 2
  44  |         const y = box.height / 2 + (i % 5 - 2) * 20
  45  |         await drawStroke(p, [[x - 100, y], [x, y + 15], [x + 100, y]], { size: 32 })
  46  |       }))
  47  |       await Promise.all(pages.map(p => waitForOperations(p, 'stroke', count)))
  48  |       const ids = async (p: Page) => (await operations(p)).map(o => o.id)
  49  |       const expected = await ids(page)
  50  |       for (const p of pages) await expect.poll(() => ids(p)).toEqual(expected)
  51  | 
  52  |       const layer = await activeLayerId(page)
  53  |       const bounds = await contentBounds(page, layer)
  54  |       expect(bounds).not.toBeNull()
  55  |       const comparePixels = async (): Promise<void> => {
  56  |         const ref = await pixels(page, bounds!)
  57  |         expect(ref.length).toBe(13 * 13 * 3)
  58  |         for (const p of pages.slice(1)) {
  59  |           await expect.poll(async () => {
  60  |             const actual = await pixels(p, bounds!)
  61  |             return Math.max(...actual.map((v, i) => Math.abs(v - ref[i])))
  62  |           }, { message: 'same operations must produce the same pixels' }).toBeLessThan(0.03)
  63  |         }
  64  |       }
  65  |       await comparePixels()
  66  |       // Every author cancels their own stroke while the others do the same.
  67  |       await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.undo())))
  68  |       await Promise.all(pages.map(p => waitForOperations(p, 'operation_undo', count)))
  69  |       await comparePixels()
  70  |       await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.redo())))
  71  |       await Promise.all(pages.map(p => waitForOperations(p, 'operation_redo', count)))
  72  |       await comparePixels()
  73  |       for (const p of pages) expect(await p.evaluate(() => window.__engine!.gpuInfo().contextLost)).toBe(false)
  74  |     } finally {
  75  |       for (const context of contexts) await context.close()
  76  |     }
  77  |   })
  78  | }
  79  | 
  80  | // QA-017: additive ink, watercolor, erasure and smudge overlap in the same
  81  | // server sequence; identical journals still need identical actual pixels.
  82  | for (const tools of [
  83  |   ['pencil', 'marker', 'watercolor', 'eraser', 'smudge'],
  84  |   ['pencil', 'marker'], ['watercolor', 'eraser'], ['watercolor', 'smudge'],
  85  | ] as const) {
  86  | test(`${tools.length} mixed-tool authors (${tools.join(', ')}) converge after drawing and undo/redo`, { tag: '@two-browsers' }, async ({ page, browser }) => {
  87  |   test.setTimeout(180_000)
  88  |   const roomId = await createRoom(page, 'QA mixed-tool conflict')
  89  |   await waitForRoomReady(page)
  90  |   const contexts = []
  91  |   const pages = [page]
  92  |   try {
  93  |     for (let i = 1; i < tools.length; i++) {
  94  |       const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
  95  |       contexts.push(context)
  96  |       const peer = await context.newPage()
  97  |       await joinRoom(peer, roomId, `Mixed ${tools[i]}`)
  98  |       pages.push(peer)
  99  |     }
  100 |     const box = (await page.locator('canvas').first().boundingBox())!
  101 |     await drawStroke(page, [[box.width / 2 - 120, box.height / 2], [box.width / 2 + 120, box.height / 2]], { size: 60 })
  102 |     await Promise.all(pages.map(p => waitForOperations(p, 'stroke')))
  103 |     await Promise.all(pages.map(async (p, i) => {
  104 |       await p.evaluate(async tool => {
  105 |         window.__roomStore!.getState().setTool(tool)
  106 |         await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  107 |       }, tools[i])
  108 |       const b = (await p.locator('canvas').first().boundingBox())!
  109 |       await drawStroke(p, [[b.width / 2 - 100, b.height / 2 - 30 + i * 15], [b.width / 2, b.height / 2 + 20], [b.width / 2 + 100, b.height / 2 - 30 + i * 15]], { size: 48 })
  110 |     }))
  111 |     await Promise.all(pages.map(p => waitForOperations(p, 'stroke', tools.length + 1)))
  112 |     expect(new Set(await Promise.all(pages.map(p => p.evaluate(() => window.__roomStore!.getState().userId)))).size).toBe(tools.length)
  113 |     const layerId = await activeLayerId(page)
  114 |     const bounds = (await contentBounds(page, layerId))!
  115 |     expect(bounds).not.toBeNull()
  116 |     const compare = async (targets: Page[]) => {
  117 |       for (const target of targets) {
  118 |         await expect.poll(async () => {
  119 |           const reference = await pixels(page, bounds)
  120 |           const actual = await pixels(target, bounds)
  121 |           expect(actual.length).toBe(13 * 13 * 3)
  122 |           return Math.max(...actual.map((v, i) => Math.abs(v - reference[i])))
> 123 |         }, { timeout: 120_000, message: 'mixed tools must reproduce the confirmed order' }).toBeLessThan(0.03)
      |                                                                                             ^ Error: mixed tools must reproduce the confirmed order
  124 |         await expect.poll(async () => (await operations(target)).map(o => o.id)).toEqual((await operations(page)).map(o => o.id))
  125 |       }
  126 |     }
  127 |     await compare(pages.slice(1))
  128 |     await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.undo())))
  129 |     await Promise.all(pages.map(p => waitForOperations(p, 'operation_undo', tools.length)))
  130 |     await compare(pages.slice(1))
  131 |     await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.redo())))
  132 |     await Promise.all(pages.map(p => waitForOperations(p, 'operation_redo', tools.length)))
  133 |     await compare(pages.slice(1))
  134 |     const context = await browser.newContext({ ignoreHTTPSErrors: true })
  135 |     contexts.push(context)
  136 |     const late = await context.newPage()
  137 |     await joinRoom(late, roomId, 'Mixed history witness')
  138 |     await waitForOperations(late, 'operation_redo', tools.length)
  139 |     await compare([late])
  140 |   } catch (error) {
  141 |     const diagnostics = await Promise.allSettled(pages.map(p => p.evaluate(() => {
  142 |       const engine = window.__engine!
  143 |       const internal = engine as unknown as {
  144 |         _wash: { endedAt: number } | null; _unsettledLayers: Set<string>;
  145 |         _rebuildJobs: Map<string, unknown>; _peerLiveStrokes: Map<string, unknown>;
  146 |         _resettleCount: number;
  147 |       }
  148 |       return {
  149 |         journal: engine.getOperations(), gpu: engine.gpuInfo(), perf: engine.getWatercolorPerf(),
  150 |         wash: internal._wash ? { age: performance.now() - internal._wash.endedAt } : null,
  151 |         unsettled: [...internal._unsettledLayers], rebuilds: [...internal._rebuildJobs.keys()],
  152 |         live: [...internal._peerLiveStrokes], resettles: internal._resettleCount,
  153 |       }
  154 |     })))
  155 |     await test.info().attach('mixed-tool diagnostics', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' })
  156 |     const snapshotChecks = await Promise.allSettled(pages.map(p => p.evaluate(async () => {
  157 |       const engine = window.__engine!
  158 |       const layer = window.__roomStore!.getState().layerState.activeId
  159 |       const hash = async (bytes: Uint8Array | null) => bytes
  160 |         ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('') : null
  161 |       return { incremental: await hash(engine.bakeNetworkSnapshot(layer)), fullReplay: await hash(engine.bakeLayerByFullReplay(layer)) }
  162 |     })))
  163 |     await test.info().attach('mixed-tool snapshot hashes', { body: JSON.stringify(snapshotChecks, null, 2), contentType: 'application/json' })
  164 |     const diagnosticBounds = await contentBounds(page, await activeLayerId(page))
  165 |     const frameChecks = await Promise.allSettled(pages.map(p => p.evaluate(rect => {
  166 |       const e = window.__engine! as unknown as { _camera: { screenToWorldMatrix(): unknown }; _display(): void; _paperWet: { peak(t: number): number }; canvas: HTMLCanvasElement }
  167 |       const sample = () => { const out: number[] = []; for (let x = 0; x <= 12; x++) for (let y = 0; y <= 12; y++) out.push(...(window.__engine!.pickColor(rect.x + rect.width * x / 12, rect.y + rect.height * y / 12) ?? [])); return out }
  168 |       const before = sample(); e._display(); return { before, after: sample(), camera: e._camera.screenToWorldMatrix(), canvas: [e.canvas.width, e.canvas.height], wetPeak: e._paperWet.peak(performance.now()) }
  169 |     }, diagnosticBounds ?? { x: 0, y: 0, width: 1, height: 1 })))
  170 |     await test.info().attach('mixed-tool frame checks', { body: JSON.stringify(frameChecks, null, 2), contentType: 'application/json' })
  171 |     throw error
  172 |   } finally {
  173 |     for (const context of contexts) await context.close()
  174 |   }
  175 | })
  176 | }
  177 | 
```