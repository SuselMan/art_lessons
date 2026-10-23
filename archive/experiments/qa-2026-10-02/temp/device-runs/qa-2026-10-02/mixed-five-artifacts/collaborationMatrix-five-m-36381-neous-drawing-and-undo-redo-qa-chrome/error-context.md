# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaborationMatrix.spec.ts >> five mixed-tool authors converge after simultaneous drawing and undo/redo
- Location: e2e/specs/collaborationMatrix.spec.ts:82:5

# Error details

```
Error: mixed tools must reproduce the confirmed order

mixed tools must reproduce the confirmed order

expect(received).toBeLessThan(expected)

Expected: < 0.03
Received:   0.6980392156862745

Call Log:
- Timeout 45000ms exceeded while waiting on the predicate
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
          - generic [ref=e102]: 48px
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
  20  | for (const count of [2, 5, 10, 20]) {
  21  |   test(`${count} participants converge after simultaneous strokes and author undo/redo`, { tag: '@two-browsers' }, async ({ page, browser }) => {
  22  |     test.setTimeout(240_000)
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
  82  | test('five mixed-tool authors converge after simultaneous drawing and undo/redo', { tag: '@two-browsers' }, async ({ page, browser }) => {
  83  |   test.setTimeout(180_000)
  84  |   const roomId = await createRoom(page, 'QA mixed-tool conflict')
  85  |   await waitForRoomReady(page)
  86  |   const contexts = []
  87  |   const pages = [page]
  88  |   const tools = ['pencil', 'marker', 'watercolor', 'eraser', 'smudge'] as const
  89  |   try {
  90  |     for (let i = 1; i < tools.length; i++) {
  91  |       const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
  92  |       contexts.push(context)
  93  |       const peer = await context.newPage()
  94  |       await joinRoom(peer, roomId, `Mixed ${tools[i]}`)
  95  |       pages.push(peer)
  96  |     }
  97  |     const box = (await page.locator('canvas').first().boundingBox())!
  98  |     await drawStroke(page, [[box.width / 2 - 120, box.height / 2], [box.width / 2 + 120, box.height / 2]], { size: 60 })
  99  |     await Promise.all(pages.map(p => waitForOperations(p, 'stroke')))
  100 |     await Promise.all(pages.map(async (p, i) => {
  101 |       await p.evaluate(async tool => {
  102 |         window.__roomStore!.getState().setTool(tool)
  103 |         await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  104 |       }, tools[i])
  105 |       const b = (await p.locator('canvas').first().boundingBox())!
  106 |       await drawStroke(p, [[b.width / 2 - 100, b.height / 2 - 30 + i * 15], [b.width / 2, b.height / 2 + 20], [b.width / 2 + 100, b.height / 2 - 30 + i * 15]], { size: 48 })
  107 |     }))
  108 |     await Promise.all(pages.map(p => waitForOperations(p, 'stroke', 6)))
  109 |     expect(new Set(await Promise.all(pages.map(p => p.evaluate(() => window.__roomStore!.getState().userId)))).size).toBe(5)
  110 |     const layerId = await activeLayerId(page)
  111 |     const bounds = (await contentBounds(page, layerId))!
  112 |     expect(bounds).not.toBeNull()
  113 |     const compare = async (targets: Page[]) => {
  114 |       for (const target of targets) {
  115 |         await expect.poll(async () => {
  116 |           const reference = await pixels(page, bounds)
  117 |           const actual = await pixels(target, bounds)
  118 |           expect(actual.length).toBe(13 * 13 * 3)
  119 |           return Math.max(...actual.map((v, i) => Math.abs(v - reference[i])))
> 120 |         }, { timeout: 45_000, message: 'mixed tools must reproduce the confirmed order' }).toBeLessThan(0.03)
      |                                                                                            ^ Error: mixed tools must reproduce the confirmed order
  121 |         await expect.poll(async () => (await operations(target)).map(o => o.id)).toEqual((await operations(page)).map(o => o.id))
  122 |       }
  123 |     }
  124 |     await compare(pages.slice(1))
  125 |     await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.undo())))
  126 |     await Promise.all(pages.map(p => waitForOperations(p, 'operation_undo', 5)))
  127 |     await compare(pages.slice(1))
  128 |     await Promise.all(pages.map(p => p.evaluate(() => window.__engine!.redo())))
  129 |     await Promise.all(pages.map(p => waitForOperations(p, 'operation_redo', 5)))
  130 |     await compare(pages.slice(1))
  131 |     const context = await browser.newContext({ ignoreHTTPSErrors: true })
  132 |     contexts.push(context)
  133 |     const late = await context.newPage()
  134 |     await joinRoom(late, roomId, 'Mixed history witness')
  135 |     await waitForOperations(late, 'operation_redo', 5)
  136 |     await compare([late])
  137 |   } finally {
  138 |     for (const context of contexts) await context.close()
  139 |   }
  140 | })
  141 | 
```