# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trueOrder.spec.ts >> true operation order >> the author of a delayed stroke re-settles into the server order
- Location: e2e/specs/trueOrder.spec.ts:82:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0.08
Received:   0.027450980392156876
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
  47  |       samples.push([Math.round(rect.x + (rect.width * i) / steps), Math.round(rect.y + (rect.height * j) / steps)])
  48  |     }
  49  |   }
  50  |   const colors = await page.evaluate(points => points.map(([x, y]) => window.__engine!.pickColor(x, y)), samples)
  51  |   return colors.map(darkness)
  52  | }
  53  | 
  54  | function compare(a: number[], b: number[]): { maxDiff: number; differing: number } {
  55  |   let maxDiff = 0
  56  |   let differing = 0
  57  |   for (let i = 0; i < a.length; i++) {
  58  |     const d = Math.abs(a[i] - b[i])
  59  |     maxDiff = Math.max(maxDiff, d)
  60  |     if (d > 0.03) differing++
  61  |   }
  62  |   return { maxDiff, differing }
  63  | }
  64  | 
  65  | /** (#537) Every participant ends up with the picture the server's order
  66  |  *  describes — including the one whose own stroke painted before its seq was
  67  |  *  known.
  68  |  *
  69  |  *  The race, made deterministic: the teacher draws a horizontal line while her
  70  |  *  uplink is held, so it is on her layer and nowhere else. The student then
  71  |  *  erases a vertical sweep through the same spot; that erase reaches the server
  72  |  *  first and gets the *earlier* seq. Only then does the teacher's line go out.
  73  |  *
  74  |  *  True order is therefore "erase, then line": the line is whole. The student
  75  |  *  and any later joiner see exactly that. Before #537 the teacher did not —
  76  |  *  the erase arrived after her line had already been painted and cut straight
  77  |  *  through it, on her screen only, for the rest of the lesson.
  78  |  *
  79  |  *  An eraser because for it the order *is* the result: pencil over pencil
  80  |  *  saturates and can hide a swapped order, an erase over a line cannot. */
  81  | test.describe('true operation order', () => {
  82  |   test('the author of a delayed stroke re-settles into the server order', { tag: '@two-browsers' }, async ({ page, browser }) => {
  83  |     const uplink = await holdOutgoingEvents(page)
  84  |     const roomId = await createRoom(page)
  85  |     await waitForRoomReady(page)
  86  | 
  87  |     const student = await browser.newContext()
  88  |     const studentPage = await student.newPage()
  89  |     const late = await browser.newContext()
  90  |     const latePage = await late.newPage()
  91  |     try {
  92  |       await joinRoom(studentPage, roomId)
  93  |       const layer = await activeLayerId(page)
  94  |       expect(await activeLayerId(studentPage)).toBe(layer)
  95  | 
  96  |       const box = await page.locator('canvas').first().boundingBox()
  97  |       if (!box) throw new Error('e2e: the canvas has no box')
  98  |       const cx = box.width / 2
  99  |       const cy = box.height / 2
  100 | 
  101 |       uplink.hold()
  102 |       await drawStroke(page, [[cx - 200, cy], [cx, cy], [cx + 200, cy]])
  103 |       await waitForOperations(page, 'stroke', 1)
  104 | 
  105 |       await selectTool(studentPage, 'e', 'eraser')
  106 |       await drawStroke(studentPage, [[cx, cy - 150], [cx, cy], [cx, cy + 150]])
  107 |       await waitForOperations(studentPage, 'stroke', 1)
  108 |       // The erase has reached the teacher — confirmed, applied, and (before
  109 |       // the fix) painted over her own not-yet-sent line.
  110 |       await waitForOperations(page, 'stroke', 2)
  111 | 
  112 |       uplink.release()
  113 |       await waitForOperations(studentPage, 'stroke', 2)
  114 |       // The teacher's own line comes back confirmed on the same broadcast that
  115 |       // just reached the student.
  116 |       await page.waitForTimeout(1000)
  117 |       const authors = async (p: Page) => (await operations(p)).filter(op => op.type === 'stroke').map(op => op.userId)
  118 |       expect.soft(await authors(page), 'the teacher\'s log is in the server\'s order').toEqual(await authors(studentPage))
  119 | 
  120 |       await joinRoom(latePage, roomId, 'Late')
  121 |       await waitForOperations(latePage, 'stroke', 2)
  122 | 
  123 |       const bounds = await contentBounds(latePage, layer)
  124 |       expect(bounds, 'the joiner replays the line onto the layer').not.toBeNull()
  125 |       // Let the re-settle (if any) and the reveal finish before reading.
  126 |       await page.waitForTimeout(500)
  127 |       // Densely over the crossing — the erase is ~50 world px wide, and a grid
  128 |       // over the whole line would put one or two samples in it — and coarsely
  129 |       // over the whole line, for anything else that might differ.
  130 |       const b = bounds!
  131 |       const crossing = { x: b.x + b.width / 2 - 80, y: b.y, width: 160, height: b.height }
  132 |       const measure = async (p: Page) => ({ crossing: await darknessGrid(p, crossing), line: await darknessGrid(p, b) })
  133 |       const teacher = await measure(page)
  134 |       const studentGrid = await measure(studentPage)
  135 |       const joiner = await measure(latePage)
  136 | 
  137 |       const teacherVsStudent = compare([...teacher.crossing, ...teacher.line], [...studentGrid.crossing, ...studentGrid.line])
  138 |       const joinerVsStudent = compare([...joiner.crossing, ...joiner.line], [...studentGrid.crossing, ...studentGrid.line])
  139 |       const lightest = (g: number[]) => Math.min(...rowThrough(g, 40)).toFixed(3)
  140 |       console.log('[#537] lightest point on the line through the crossing, teacher/student/joiner:',
  141 |         lightest(teacher.crossing), lightest(studentGrid.crossing), lightest(joiner.crossing))
  142 |       console.log('[#537] teacher vs student:', JSON.stringify(teacherVsStudent),
  143 |         'joiner vs student:', JSON.stringify(joinerVsStudent))
  144 | 
  145 |       // The line is whole through the crossing on the replay — the server
  146 |       // order's own answer.
> 147 |       expect(Math.min(...rowThrough(joiner.crossing, 40))).toBeGreaterThan(0.08)
      |                                                            ^ Error: expect(received).toBeGreaterThan(expected)
  148 |       expect(joinerVsStudent.differing).toBe(0)
  149 |       expect(teacherVsStudent.differing, 'the teacher sees what everyone else sees').toBe(0)
  150 |     } finally {
  151 |       await student.close()
  152 |       await late.close()
  153 |     }
  154 |   })
  155 | })
  156 | 
  157 | /** The darkness samples along the horizontal middle of the grid — the line's
  158 |  *  own centre, since the grid covers the line's bounds. */
  159 | function rowThrough(grid: number[], steps: number): number[] {
  160 |   const mid = Math.round(steps / 2)
  161 |   const row: number[] = []
  162 |   for (let i = 0; i <= steps; i++) row.push(grid[i * (steps + 1) + mid])
  163 |   return row
  164 | }
  165 | 
```