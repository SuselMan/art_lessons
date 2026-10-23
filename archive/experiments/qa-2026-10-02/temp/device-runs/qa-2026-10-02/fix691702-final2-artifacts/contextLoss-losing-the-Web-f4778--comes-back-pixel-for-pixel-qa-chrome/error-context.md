# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: contextLoss.spec.ts >> losing the WebGL context >> the drawing comes back, pixel for pixel
- Location: e2e/specs/contextLoss.spec.ts:28:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('form input[type="text"]').first()

```

# Test source

```ts
  1   | import { expect, type Page } from '@playwright/test'
  2   | 
  3   | import type { PencilEngineAPI } from '../../apps/web/src/engine'
  4   | import type { LatencyMeter } from '../../apps/web/src/lib/observability/liveLatency'
  5   | import type { useRoomStore } from '../../apps/web/src/stores/roomStore'
  6   | import type { Operation } from '../../packages/shared/src/index'
  7   | import { slow } from './pace'
  8   | 
  9   | /** (#491) The two handles lib/observability/devEngineHandle.ts publishes in dev builds.
  10  |  *  Typed against the app's own types rather than re-declared loosely, so a
  11  |  *  rename in the engine's public API breaks these tests at `npm run
  12  |  *  typecheck` instead of at midnight. */
  13  | declare global {
  14  |   interface Window {
  15  |     __engine?: PencilEngineAPI
  16  |     __roomStore?: typeof useRoomStore
  17  |     /** (#432) The pen-to-ink meter — published in every build, see liveLatency. */
  18  |     __liveLatency?: LatencyMeter
  19  |   }
  20  | }
  21  | 
  22  | /** Selectors are structural, never text.
  23  |  *
  24  |  *  The app is fully translated and the reader's language comes from their
  25  |  *  settings, so a test that looked for "Create project" would pass or fail on
  26  |  *  a preference. None of these forms have more than one text input or one
  27  |  *  submit, which makes structure the more stable thing to name anyway. */
  28  | const NAME_INPUT = 'form input[type="text"]'
  29  | const SUBMIT = 'form button[type="submit"]'
  30  | /** (#513) Both forms that have one have exactly one, and on the join gate its
  31  |  *  presence is itself the thing under test. */
  32  | export const PASSWORD_INPUT = 'form input[type="password"]'
  33  | 
  34  | /** Fills the create form and lands in the new room. Returns its id.
  35  |  *
  36  |  *  Goes through the actual page rather than navigating to `/room/<id>`
  37  |  *  directly, and that is not thoroughness for its own sake: a creator's room
  38  |  *  configuration arrives as react-router navigation *state* (see
  39  |  *  CreateRoom's handleSubmit), so a direct visit is a different code path —
  40  |  *  the joiner's — and would quietly test the wrong one. */
  41  | export async function createRoom(
  42  |   page: Page, name = 'E2E lesson', opts: { password?: string } = {},
  43  | ): Promise<string> {
  44  |   await page.goto('/create')
> 45  |   await page.locator(NAME_INPUT).first().fill(name)
      |                                          ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  46  |   if (opts.password) {
  47  |     // (#548) The create form's access settings are now the room's own access
  48  |     // panel, behind a tab. Two things changed under this helper at once, and
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
```