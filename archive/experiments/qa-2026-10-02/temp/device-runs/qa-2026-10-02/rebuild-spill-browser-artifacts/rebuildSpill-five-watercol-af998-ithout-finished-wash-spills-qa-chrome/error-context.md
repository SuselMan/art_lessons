# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rebuildSpill.spec.ts >> five watercolor authors survive undo, late continuation, redo and fresh replay without finished-wash spills
- Location: e2e/specs/rebuildSpill.spec.ts:28:5

# Error details

```
Error: waiting for 7 stroke operation(s)

waiting for 7 stroke operation(s)

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 7
Received:    6

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
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
  49  |     // neither made a sound because this suite does not run in CI: the tab
  50  |     // renders nothing until it is opened, and the on/off switch that used to
  51  |     // reveal a password field is gone — the field is always there, and a
  52  |     // password only exists once its own button has been pressed.
  53  |     await page.getByRole('tab', { name: /access/i }).click()
  54  |     await page.locator(PASSWORD_INPUT).first().fill(opts.password)
  55  |     await page.getByRole('button', { name: /^set$/i }).click()
  56  |     await page.getByRole('tab', { name: /project/i }).click()
  57  |   }
  58  |   await page.locator(SUBMIT).click()
  59  |   await page.waitForURL(/\/room\/[^/]+$/)
  60  |   const id = new URL(page.url()).pathname.split('/').pop()
  61  |   if (!id) throw new Error('e2e: room id missing from the URL after creating a room')
  62  |   return id
  63  | }
  64  | 
  65  | /** Resolves once the room will actually accept a stroke.
  66  |  *
  67  |  *  Not "the page loaded" and not "the canvas exists": until the initial
  68  |  *  content restore finishes, Room sets `pointer-events: none` on the canvas
  69  |  *  (#169), so input lands on the viewport behind it and paints nothing. That
  70  |  *  inline style is the same flag that hides the loading overlay, which makes
  71  |  *  it the honest readiness signal — the question a test wants answered is
  72  |  *  precisely "can I draw yet". */
  73  | export async function waitForRoomReady(page: Page): Promise<void> {
  74  |   await page.waitForFunction(() => {
  75  |     if (!window.__engine) return false
  76  |     const canvas = document.querySelector('canvas')
  77  |     return !!canvas && getComputedStyle(canvas).pointerEvents !== 'none'
  78  |   }, undefined, { timeout: slow(45_000) })
  79  | }
  80  | 
  81  | async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  82  |   const box = await page.locator('canvas').first().boundingBox()
  83  |   if (!box) throw new Error('e2e: the canvas has no box — is the room still loading?')
  84  |   return box
  85  | }
  86  | 
  87  | /** Draws one stroke, in coordinates relative to the canvas's top-left.
  88  |  *
  89  |  *  `steps` on each move is what makes this a stroke rather than two dabs: the
  90  |  *  engine builds a Catmull-Rom spline through the samples it receives, and a
  91  |  *  single jump from one corner to another arrives as one segment. Real input
  92  |  *  is dense; this makes the synthetic kind dense too.
  93  |  *
  94  |  *  Playwright's mouse goes out through CDP, which is the distinction that
  95  |  *  matters — events dispatched from page JavaScript reach the handlers and
  96  |  *  commit nothing. */
  97  | export async function drawStroke(
  98  |   page: Page, points: Array<[number, number]>, opts: { size?: number } = {},
  99  | ): Promise<void> {
  100 |   if (points.length < 2) throw new Error('e2e: a stroke needs at least two points')
  101 |   // A deliberately fat brush, by default, and the reason is measurement rather
  102 |   // than taste. A new room opens with the whole page fitted to the window —
  103 |   // about 0.46× here — and brush size is in world units, so a default-sized
  104 |   // stroke comes out three world pixels tall and barely tints the paper:
  105 |   // measured 0.92 grey against paper at 0.96, which is real ink and far too
  106 |   // close to the paper to assert on without inviting a flaky test. At 48 the
  107 |   // same stroke reads 0.79, six times the paper's own darkness. The mechanism
  108 |   // under test is the pointer → dab → GL path, not the default preset.
  109 |   await setBrushSize(page, opts.size ?? 48)
  110 |   const box = await canvasBox(page)
  111 |   const [first, ...rest] = points
  112 |   await page.mouse.move(box.x + first[0], box.y + first[1])
  113 |   await page.mouse.down()
  114 |   for (const [x, y] of rest) await page.mouse.move(box.x + x, box.y + y, { steps: 8 })
  115 |   await page.mouse.up()
  116 | }
  117 | 
  118 | /** (#616) Into the store as well as the engine. The store is the source the
  119 |  *  engine is synced *from* (useToolSync), so a size written only into the
  120 |  *  engine lasts until the next time that sync runs — locally that was always
  121 |  *  after the stroke, and on a slow CI runner it came first: the teacher's
  122 |  *  48 px stroke went down at the room's default 4 px and read too faint to
  123 |  *  assert on. With both holding the same value, a late re-sync changes
  124 |  *  nothing. */
  125 | export async function setBrushSize(page: Page, size: number): Promise<void> {
  126 |   await page.evaluate(px => {
  127 |     const state = window.__roomStore!.getState()
  128 |     const tool = state.drawingTool
  129 |     if (typeof state.toolSettings[tool].size === 'number') state.setToolSetting(tool, 'size', px)
  130 |     window.__engine!.setSize(px)
  131 |   }, size)
  132 | }
  133 | 
  134 | /** The operation log as the engine holds it. */
  135 | export function operations(page: Page): Promise<Operation[]> {
  136 |   return page.evaluate(() => window.__engine!.getOperations())
  137 | }
  138 | 
  139 | /** Waits until the log holds at least `count` operations of `type`.
  140 |  *
  141 |  *  A stroke is not in the log when `mouse.up()` returns: the gesture is
  142 |  *  committed on pen-up and the operation is appended after it. Polling the log
  143 |  *  is what replaces the arbitrary sleep that would otherwise sit here and be
  144 |  *  too short on somebody else's machine. */
  145 | export async function waitForOperations(page: Page, type: Operation['type'], count = 1): Promise<void> {
  146 |   await expect.poll(
  147 |     async () => (await operations(page)).filter(op => op.type === type).length,
  148 |     { message: `waiting for ${count} ${type} operation(s)` },
> 149 |   ).toBeGreaterThanOrEqual(count)
      |     ^ Error: waiting for 7 stroke operation(s)
  150 | }
  151 | 
  152 | /** The layer a stroke would land on right now.
  153 |  *
  154 |  *  From the store, which is where the app itself reads it (Room passes exactly
  155 |  *  this to `engine.setActiveLayer`). The engine's own `liveLayerIds()` looks
  156 |  *  like a shortcut and is a trap: it returns every buffer it holds, in the
  157 |  *  order they were created, so "the last one" is whichever layer happened to
  158 |  *  be initialised last — the background, in a fresh room. Asking it that way
  159 |  *  made the first version of these tests report an empty layer after a stroke
  160 |  *  that had in fact landed perfectly well on another one. */
  161 | export function activeLayerId(page: Page): Promise<string> {
  162 |   return page.evaluate(() => window.__roomStore!.getState().layerState.activeId)
  163 | }
  164 | 
  165 | export function hasLayerContent(page: Page, layerId: string): Promise<boolean> {
  166 |   return page.evaluate(id => window.__engine!.hasLayerContent(id), layerId)
  167 | }
  168 | 
  169 | export function contentBounds(
  170 |   page: Page, layerId: string,
  171 | ): Promise<{ x: number; y: number; width: number; height: number } | null> {
  172 |   return page.evaluate(id => window.__engine!.getContentBounds(id), layerId)
  173 | }
  174 | 
  175 | /** Reads one composited pixel, in canvas-pixel space.
  176 |  *
  177 |  *  This is the assertion the whole harness exists for: it comes back out of
  178 |  *  `gl.readPixels` on the real framebuffer, so it is the colour a person would
  179 |  *  be looking at — not a draw call that was issued, which is all a MockGL test
  180 |  *  can ever claim. */
  181 | export function pickColor(page: Page, x: number, y: number): Promise<[number, number, number] | null> {
  182 |   return page.evaluate(([px, py]) => window.__engine!.pickColor(px, py), [x, y] as const)
  183 | }
  184 | 
  185 | /** How dark a sampled colour is, 0 (white) to 1 (black). Strokes in these
  186 |  *  tests are graphite on pale paper, so "did anything land here" is a
  187 |  *  question about darkness and not about a particular RGB triple — which
  188 |  *  would otherwise have to account for paper tint, grain and blending. */
  189 | export function darkness(color: [number, number, number] | null): number {
  190 |   if (!color) return 0
  191 |   return 1 - (color[0] + color[1] + color[2]) / 3
  192 | }
  193 | 
  194 | export interface Rect { x: number; y: number; width: number; height: number }
  195 | 
  196 | /** How finely to sample a rectangle.
  197 |  *
  198 |  *  A fixed grid was the first version and it produced a false negative that
  199 |  *  looked exactly like a bug in the app: two strokes 350 world pixels apart
  200 |  *  make a bounding box that tall, ten steps put the samples 35 pixels apart,
  201 |  *  and a stroke 32 pixels tall fits between two rows of them. The reported
  202 |  *  darkness was the paper's.
  203 |  *
  204 |  *  So the spacing, not the count, is what is held roughly constant — about six
  205 |  *  world pixels, comfortably inside any stroke this harness draws. Capped
  206 |  *  because each sample is its own `readPixels`, and each of those is a
  207 |  *  round trip that stalls the GPU pipeline: 64 is ~4000 reads, which is a
  208 |  *  second or so, and past that an assertion starts costing more than the test
  209 |  *  it belongs to. */
  210 | function stepsFor(rect: Rect): number {
  211 |   const target = Math.ceil(Math.max(rect.width, rect.height) / 6)
  212 |   return Math.min(64, Math.max(9, target))
  213 | }
  214 | 
  215 | /** How dark a rectangle of canvas-pixel space gets, at its darkest.
  216 |  *
  217 |  *  A grid rather than a single point, which is what this was first and what
  218 |  *  made it fail against a stroke that was plainly there: the centre of a
  219 |  *  bounding box is only on the stroke if the stroke happens to run through it,
  220 |  *  and for anything curved or diagonal it lands on blank paper. "Is there ink
  221 |  *  in this region" is the question actually being asked, and the max over a
  222 |  *  sample of it is how to ask without assuming a shape.
  223 |  *
  224 |  *  Everything here is canvas-pixel (world) space, because that is what
  225 |  *  `pickColor` takes. Feeding it screen coordinates is a mistake that does not
  226 |  *  announce itself — the reads succeed, they are just of somewhere else — and
  227 |  *  it is why this takes an explicit rect instead of guessing one from the
  228 |  *  canvas element. */
  229 | export async function maxDarknessOverRect(page: Page, rect: Rect, steps = stepsFor(rect)): Promise<number> {
  230 |   const samples: Array<[number, number]> = []
  231 |   for (let i = 0; i <= steps; i++) {
  232 |     for (let j = 0; j <= steps; j++) {
  233 |       samples.push([
  234 |         Math.round(rect.x + (rect.width * i) / steps),
  235 |         Math.round(rect.y + (rect.height * j) / steps),
  236 |       ])
  237 |     }
  238 |   }
  239 |   const colors = await page.evaluate(
  240 |     points => points.map(([x, y]) => window.__engine!.pickColor(x, y)),
  241 |     samples,
  242 |   )
  243 |   return Math.max(0, ...colors.map(darkness))
  244 | }
  245 | 
  246 | /** The darkest pixel anywhere in what `layerId` has painted. */
  247 | export async function maxDarknessOverContent(page: Page, layerId: string): Promise<number> {
  248 |   const bounds = await contentBounds(page, layerId)
  249 |   if (!bounds) return 0
```