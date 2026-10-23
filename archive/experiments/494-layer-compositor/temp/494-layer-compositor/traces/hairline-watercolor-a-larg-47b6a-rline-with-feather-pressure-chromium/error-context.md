# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hairline.spec.ts >> watercolor: a large flexible nib draws a hairline with feather pressure
- Location: temp/494-layer-compositor/hairline.spec.ts:6:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 3
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - button "Grafetto — leave this project" [ref=e5] [cursor=pointer]:
      - img "Grafetto" [ref=e6]
    - button "E2E lesson" [ref=e18] [cursor=pointer]
    - status [ref=e19]:
      - generic [ref=e21]: Saved
    - generic [ref=e22]:
      - button "0°" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: 
        - text: 0°
      - button "Lock canvas rotation" [ref=e25] [cursor=pointer]:
        - generic [ref=e26]: 
      - button "100%" [ref=e28] [cursor=pointer]
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
      - button "Menu" [ref=e44] [cursor=pointer]:
        - generic [ref=e45]: 
  - generic [ref=e46]:
    - generic [ref=e47]:
      - complementary [ref=e48]:
        - button "Color" [ref=e49] [cursor=pointer]
        - button "Drawing tool" [pressed] [ref=e52] [cursor=pointer]:
          - generic [ref=e53]: 
        - button "Eraser E" [ref=e55] [cursor=pointer]:
          - generic [ref=e56]: 
        - button "Smudge" [ref=e57] [cursor=pointer]
        - button "Hand" [ref=e65] [cursor=pointer]:
          - generic [ref=e66]: 
        - button "Eyedropper" [ref=e67] [cursor=pointer]:
          - generic [ref=e68]: 
        - button "Ruler" [ref=e69] [cursor=pointer]:
          - generic [ref=e70]: 
        - button "Transform" [ref=e71] [cursor=pointer]
        - button "Select" [ref=e83] [cursor=pointer]:
          - generic [ref=e84]: 
        - button "Fill" [ref=e85] [cursor=pointer]:
          - generic [ref=e86]: 
        - button "Shape" [ref=e87] [cursor=pointer]:
          - generic [ref=e88]: 
        - button "Grid" [ref=e91] [cursor=pointer]:
          - generic [ref=e92]: 
      - complementary [ref=e93]:
        - generic "Nib" [ref=e94]:
          - button "Nib" [ref=e95] [cursor=pointer]:
            - generic [ref=e96]: 
          - generic [ref=e98]: Flexible
        - generic "Mix" [ref=e99]:
          - button "Mix" [ref=e100] [cursor=pointer]:
            - generic [ref=e101]: 
          - generic [ref=e103]: Damp
        - generic "Size" [ref=e104]:
          - generic [ref=e106]: 100px
          - slider "Size" [ref=e108] [cursor=pointer]
        - generic "Water" [ref=e109]:
          - generic [ref=e111]: 55%
          - slider "Water" [ref=e113] [cursor=pointer]
        - generic "Pigment" [ref=e114]:
          - generic [ref=e116]: 100%
          - slider "Pigment" [ref=e118] [cursor=pointer]
        - button "Dry everything" [ref=e119] [cursor=pointer]:
          - generic [ref=e120]: 
    - generic [ref=e125]:
      - generic [ref=e126]:
        - button "Collapse Layers" [ref=e127] [cursor=pointer]:
          - generic [ref=e128]: 
        - button "Open Color" [ref=e129] [cursor=pointer]:
          - generic [ref=e130]: 
        - button "Open Class" [ref=e131] [cursor=pointer]:
          - generic [ref=e132]: 
        - button "Open Tool settings" [ref=e133] [cursor=pointer]:
          - generic [ref=e134]: 
      - generic [ref=e135]:
        - generic [ref=e136]:
          - generic [ref=e137]: Layers
          - button "Collapse" [ref=e138] [cursor=pointer]:
            - generic [ref=e139]: 
        - generic [ref=e140]:
          - generic [ref=e141]:
            - generic [ref=e142]: Opacity
            - slider "Opacity" [ref=e143] [cursor=pointer]
            - generic [ref=e144]: 100%
          - generic [ref=e145]:
            - button "Add layer" [ref=e146] [cursor=pointer]:
              - generic [ref=e147]: 
            - button "Add folder" [ref=e148] [cursor=pointer]:
              - generic [ref=e149]: 
            - button "Import reference image" [ref=e150] [cursor=pointer]:
              - generic [ref=e151]: 
            - button "Lock layer" [ref=e152] [cursor=pointer]:
              - generic [ref=e153]: 
            - button "Lock layer for others" [ref=e154] [cursor=pointer]:
              - generic [ref=e155]: 
            - button "Show only this layer" [ref=e156] [cursor=pointer]:
              - generic [ref=e157]: 
            - button "Merge down" [ref=e158] [cursor=pointer]:
              - generic [ref=e159]: 
            - button "Delete layer" [ref=e160] [cursor=pointer]:
              - generic [ref=e161]: 
          - generic [ref=e162]:
            - button "Hide Lock Lock layer for others Layer 1 100% More" [ref=e163]:
              - generic "Drag to reorder" [ref=e164]: 
              - button "Hide" [ref=e166] [cursor=pointer]:
                - generic [ref=e167]: 
              - button "Lock" [ref=e168] [cursor=pointer]:
                - generic [ref=e169]: 
              - button "Lock layer for others" [ref=e170] [cursor=pointer]:
                - generic [ref=e171]: 
              - generic [ref=e172]: 
              - generic [ref=e174]: Layer 1
              - generic "Opacity" [ref=e175]: 100%
              - button "More" [ref=e177] [cursor=pointer]:
                - generic [ref=e178]: 
            - button "Hide The background is always locked Background 100%" [disabled] [ref=e179]:
              - button "Hide" [disabled] [ref=e180] [cursor=pointer]:
                - generic [ref=e181]: 
              - button "The background is always locked" [disabled] [ref=e182] [cursor=pointer]:
                - generic [ref=e183]: 
              - generic [ref=e184]: 
              - generic [ref=e186]: Background
              - generic "Opacity" [ref=e187]: 100%
            - status [ref=e188]
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
  1  | import { expect, test } from '@playwright/test'
  2  | import { strokeDabs } from '../../packages/shared/src/index'
  3  | import { createRoom, waitForRoomReady, waitForOperations, operations } from '../../e2e/support/room'
  4  | 
  5  | for (const tool of ['brushPen', 'watercolor'] as const) {
  6  |   test(`${tool}: a large flexible nib draws a hairline with feather pressure`, async ({ page }) => {
  7  |     await page.addInitScript(() => localStorage.setItem('al_locale', 'en'))
  8  |     await createRoom(page)
  9  |     await waitForRoomReady(page)
  10 |     await page.evaluate(tool => {
  11 |       const s = window.__roomStore!.getState()
  12 |       s.setTool(tool)
  13 |       if (tool === 'watercolor') {
  14 |         s.setToolSetting(tool, 'nib', 'flex')
  15 |         s.setToolSetting(tool, 'water', 0.55)
  16 |         s.setToolSetting(tool, 'pigment', 1)
  17 |       }
  18 |       s.setToolSetting(tool, 'size', 100)
  19 |       const v = s.viewport
  20 |       s.setViewport({ ...v, zoom: 1, angle: 0 })
  21 |     }, tool)
  22 |     await page.waitForTimeout(200)
  23 |     await page.evaluate(() => { window.__engine!.setPaper('flat'); window.__engine!.setColor([0, 0, 0]) })
  24 |     const box = await page.locator('canvas').first().boundingBox()
  25 |     if (!box) throw new Error('no canvas')
  26 |     const cdp = await page.context().newCDPSession(page)
  27 |     const x = box.x + box.width / 2 - 100
  28 |     const y = box.y + box.height / 2
  29 |     await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.02 })
  30 |     for (let i = 1; i <= 40; i++) {
  31 |       await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i * 5, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.02 })
  32 |     }
  33 |     await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 200, y, button: 'left', buttons: 0, pointerType: 'pen', force: 0 })
  34 |     await waitForOperations(page, 'stroke', 1)
  35 |     const op = (await operations(page)).find(op => op.type === 'stroke')
  36 |     if (!op || op.type !== 'stroke') throw new Error('no stroke')
  37 |     expect(op.tool).toBe(tool)
  38 |     const dabs = strokeDabs(op)
  39 |     expect(dabs.length).toBeGreaterThan(2)
  40 |     console.log(tool, 'dab count / maximum size', dabs.length, Math.max(...dabs.map(d => d.size)))
  41 |     expect(Math.max(...dabs.map(d => d.size))).toBeLessThanOrEqual(2.05)
  42 |     // Read actual rendered pixels, at zoom 1. Use the middle of the gesture,
  43 |     // beyond its head taper and away from its end taper.
  44 |     const middle = dabs[Math.floor(dabs.length / 2)]
  45 |     const sample = async () => page.evaluate(({ x, y }) => {
  46 |       const result = []
  47 |       for (let dy = -12; dy <= 12; dy++) {
  48 |         const pixel = window.__engine!.pickColor(x, y + dy)!
  49 |         result.push(255 * (1 - (pixel[0] + pixel[1] + pixel[2]) / 3))
  50 |       }
  51 |       return result
  52 |     }, { x: middle.x, y: middle.y })
  53 |     await page.waitForTimeout(1500)
  54 |     const probe = await page.evaluate(({x,y}) => {
  55 |       const e=window.__engine! as any; const rows=[]; for(let dx=-8;dx<=8;dx++){let m=0;for(let dy=-12;dy<=12;dy++){const c=e.pickColor(x+dx,y+dy);m=Math.max(m,255*(1-(c[0]+c[1]+c[2])/3))}rows.push(m)}
  56 |       return {rows, coords:{x,y},stats:e.getOperations().filter((o:any)=>o.type==='stroke').map((o:any)=>({color:o.color,preset:o.preset,dabs:o.dabs?.slice(0,2)}))}
  57 |     },{x:middle.x,y:middle.y})
  58 |     console.log('PROBE', JSON.stringify(probe));await page.screenshot({path:test.info().outputPath('probe.png')})
  59 |     const live = await sample()
  60 |     console.log(tool, 'live cross-section', live)
> 61 |     expect(Math.max(...live)).toBeGreaterThan(tool === 'brushPen' ? 25 : 3)
     |                               ^ Error: expect(received).toBeGreaterThan(expected)
  62 |     expect(live.filter(v => v > Math.max(...live) * 0.25).length).toBeLessThanOrEqual(5)
  63 |     await page.keyboard.press('Control+z')
  64 |     await expect.poll(async () => (await operations(page)).filter(op => op.type === 'stroke').length).toBe(0)
  65 |     await page.keyboard.press('Control+Shift+z')
  66 |     await waitForOperations(page, 'stroke', 1)
  67 |     await page.waitForTimeout(1500)
  68 |     const replay = await sample()
  69 |     console.log(tool, 'replay cross-section', replay)
  70 |     expect(Math.max(...replay)).toBeGreaterThan(tool === 'brushPen' ? 25 : 3)
  71 |     expect(replay.filter(v => v > Math.max(...replay) * 0.25).length).toBeLessThanOrEqual(5)
  72 |     await page.screenshot({ path: test.info().outputPath(`${tool}-hairline.png`) })
  73 |   })
  74 | }
  75 | 
```