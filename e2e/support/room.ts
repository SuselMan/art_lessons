import { expect, type Page } from '@playwright/test'

import type { PencilEngineAPI } from '../../apps/web/src/engine'
import type { useRoomStore } from '../../apps/web/src/stores/roomStore'
import type { Operation } from '../../packages/shared/src/index'

/** (#491) The two handles lib/devEngineHandle.ts publishes in dev builds.
 *  Typed against the app's own types rather than re-declared loosely, so a
 *  rename in the engine's public API breaks these tests at `npm run
 *  typecheck` instead of at midnight. */
declare global {
  interface Window {
    __engine?: PencilEngineAPI
    __roomStore?: typeof useRoomStore
  }
}

/** Selectors are structural, never text.
 *
 *  The app is fully translated and the reader's language comes from their
 *  settings, so a test that looked for "Create project" would pass or fail on
 *  a preference. None of these forms have more than one text input or one
 *  submit, which makes structure the more stable thing to name anyway. */
const NAME_INPUT = 'form input[type="text"]'
const SUBMIT = 'form button[type="submit"]'

/** Fills the create form and lands in the new room. Returns its id.
 *
 *  Goes through the actual page rather than navigating to `/room/<id>`
 *  directly, and that is not thoroughness for its own sake: a creator's room
 *  configuration arrives as react-router navigation *state* (see
 *  CreateRoom's handleSubmit), so a direct visit is a different code path —
 *  the joiner's — and would quietly test the wrong one. */
export async function createRoom(page: Page, name = 'E2E lesson'): Promise<string> {
  await page.goto('/create')
  await page.locator(NAME_INPUT).first().fill(name)
  await page.locator(SUBMIT).click()
  await page.waitForURL(/\/room\/[^/]+$/)
  const id = new URL(page.url()).pathname.split('/').pop()
  if (!id) throw new Error('e2e: room id missing from the URL after creating a room')
  return id
}

/** Resolves once the room will actually accept a stroke.
 *
 *  Not "the page loaded" and not "the canvas exists": until the initial
 *  content restore finishes, Room sets `pointer-events: none` on the canvas
 *  (#169), so input lands on the viewport behind it and paints nothing. That
 *  inline style is the same flag that hides the loading overlay, which makes
 *  it the honest readiness signal — the question a test wants answered is
 *  precisely "can I draw yet". */
export async function waitForRoomReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (!window.__engine) return false
    const canvas = document.querySelector('canvas')
    return !!canvas && getComputedStyle(canvas).pointerEvents !== 'none'
  }, undefined, { timeout: 45_000 })
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box — is the room still loading?')
  return box
}

/** Draws one stroke, in coordinates relative to the canvas's top-left.
 *
 *  `steps` on each move is what makes this a stroke rather than two dabs: the
 *  engine builds a Catmull-Rom spline through the samples it receives, and a
 *  single jump from one corner to another arrives as one segment. Real input
 *  is dense; this makes the synthetic kind dense too.
 *
 *  Playwright's mouse goes out through CDP, which is the distinction that
 *  matters — events dispatched from page JavaScript reach the handlers and
 *  commit nothing. */
export async function drawStroke(
  page: Page, points: Array<[number, number]>, opts: { size?: number } = {},
): Promise<void> {
  if (points.length < 2) throw new Error('e2e: a stroke needs at least two points')
  // A deliberately fat brush, by default, and the reason is measurement rather
  // than taste. A new room opens with the whole page fitted to the window —
  // about 0.46× here — and brush size is in world units, so a default-sized
  // stroke comes out three world pixels tall and barely tints the paper:
  // measured 0.92 grey against paper at 0.96, which is real ink and far too
  // close to the paper to assert on without inviting a flaky test. At 48 the
  // same stroke reads 0.79, six times the paper's own darkness. The mechanism
  // under test is the pointer → dab → GL path, not the default preset.
  await setBrushSize(page, opts.size ?? 48)
  const box = await canvasBox(page)
  const [first, ...rest] = points
  await page.mouse.move(box.x + first[0], box.y + first[1])
  await page.mouse.down()
  for (const [x, y] of rest) await page.mouse.move(box.x + x, box.y + y, { steps: 8 })
  await page.mouse.up()
}

export async function setBrushSize(page: Page, size: number): Promise<void> {
  await page.evaluate(px => window.__engine!.setSize(px), size)
}

/** The operation log as the engine holds it. */
export function operations(page: Page): Promise<Operation[]> {
  return page.evaluate(() => window.__engine!.getOperations())
}

/** Waits until the log holds at least `count` operations of `type`.
 *
 *  A stroke is not in the log when `mouse.up()` returns: the gesture is
 *  committed on pen-up and the operation is appended after it. Polling the log
 *  is what replaces the arbitrary sleep that would otherwise sit here and be
 *  too short on somebody else's machine. */
export async function waitForOperations(page: Page, type: Operation['type'], count = 1): Promise<void> {
  await expect.poll(
    async () => (await operations(page)).filter(op => op.type === type).length,
    { message: `waiting for ${count} ${type} operation(s)` },
  ).toBeGreaterThanOrEqual(count)
}

/** The layer a stroke would land on right now.
 *
 *  From the store, which is where the app itself reads it (Room passes exactly
 *  this to `engine.setActiveLayer`). The engine's own `liveLayerIds()` looks
 *  like a shortcut and is a trap: it returns every buffer it holds, in the
 *  order they were created, so "the last one" is whichever layer happened to
 *  be initialised last — the background, in a fresh room. Asking it that way
 *  made the first version of these tests report an empty layer after a stroke
 *  that had in fact landed perfectly well on another one. */
export function activeLayerId(page: Page): Promise<string> {
  return page.evaluate(() => window.__roomStore!.getState().layerState.activeId)
}

export function hasLayerContent(page: Page, layerId: string): Promise<boolean> {
  return page.evaluate(id => window.__engine!.hasLayerContent(id), layerId)
}

export function contentBounds(
  page: Page, layerId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(id => window.__engine!.getContentBounds(id), layerId)
}

/** Reads one composited pixel, in canvas-pixel space.
 *
 *  This is the assertion the whole harness exists for: it comes back out of
 *  `gl.readPixels` on the real framebuffer, so it is the colour a person would
 *  be looking at — not a draw call that was issued, which is all a MockGL test
 *  can ever claim. */
export function pickColor(page: Page, x: number, y: number): Promise<[number, number, number] | null> {
  return page.evaluate(([px, py]) => window.__engine!.pickColor(px, py), [x, y] as const)
}

/** How dark a sampled colour is, 0 (white) to 1 (black). Strokes in these
 *  tests are graphite on pale paper, so "did anything land here" is a
 *  question about darkness and not about a particular RGB triple — which
 *  would otherwise have to account for paper tint, grain and blending. */
export function darkness(color: [number, number, number] | null): number {
  if (!color) return 0
  return 1 - (color[0] + color[1] + color[2]) / 3
}

export interface Rect { x: number; y: number; width: number; height: number }

/** How finely to sample a rectangle.
 *
 *  A fixed grid was the first version and it produced a false negative that
 *  looked exactly like a bug in the app: two strokes 350 world pixels apart
 *  make a bounding box that tall, ten steps put the samples 35 pixels apart,
 *  and a stroke 32 pixels tall fits between two rows of them. The reported
 *  darkness was the paper's.
 *
 *  So the spacing, not the count, is what is held roughly constant — about six
 *  world pixels, comfortably inside any stroke this harness draws. Capped
 *  because each sample is its own `readPixels`, and each of those is a
 *  round trip that stalls the GPU pipeline: 64 is ~4000 reads, which is a
 *  second or so, and past that an assertion starts costing more than the test
 *  it belongs to. */
function stepsFor(rect: Rect): number {
  const target = Math.ceil(Math.max(rect.width, rect.height) / 6)
  return Math.min(64, Math.max(9, target))
}

/** How dark a rectangle of canvas-pixel space gets, at its darkest.
 *
 *  A grid rather than a single point, which is what this was first and what
 *  made it fail against a stroke that was plainly there: the centre of a
 *  bounding box is only on the stroke if the stroke happens to run through it,
 *  and for anything curved or diagonal it lands on blank paper. "Is there ink
 *  in this region" is the question actually being asked, and the max over a
 *  sample of it is how to ask without assuming a shape.
 *
 *  Everything here is canvas-pixel (world) space, because that is what
 *  `pickColor` takes. Feeding it screen coordinates is a mistake that does not
 *  announce itself — the reads succeed, they are just of somewhere else — and
 *  it is why this takes an explicit rect instead of guessing one from the
 *  canvas element. */
export async function maxDarknessOverRect(page: Page, rect: Rect, steps = stepsFor(rect)): Promise<number> {
  const samples: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      samples.push([
        Math.round(rect.x + (rect.width * i) / steps),
        Math.round(rect.y + (rect.height * j) / steps),
      ])
    }
  }
  const colors = await page.evaluate(
    points => points.map(([x, y]) => window.__engine!.pickColor(x, y)),
    samples,
  )
  return Math.max(0, ...colors.map(darkness))
}

/** The darkest pixel anywhere in what `layerId` has painted. */
export async function maxDarknessOverContent(page: Page, layerId: string): Promise<number> {
  const bounds = await contentBounds(page, layerId)
  if (!bounds) return 0
  return maxDarknessOverRect(page, bounds)
}

/** Where the line sits between "paper" and "somebody drew here".
 *
 *  Measured, not chosen: in a default room this harness creates, blank paper
 *  reads 0.035 and a size-48 graphite stroke reads 0.21 at its darkest — see
 *  drawStroke on why the brush is deliberately fat. 0.12 is the middle of that
 *  gap, far enough from the paper that grain cannot reach it and far enough
 *  from the ink that a lighter blend still counts.
 *
 *  A constant rather than a per-room baseline because these tests create their
 *  own rooms with the default paper. A scenario that picks a dark paper has to
 *  do its own before-and-after. */
export const INK = 0.12

/** Takes the WebGL context away and gives it back, the way a tablet does.
 *
 *  `WEBGL_lose_context` is the browser's own hook for this, and it is the only
 *  honest way to reach the code under test: the engine's recovery hangs off
 *  the real `webglcontextlost`/`webglcontextrestored` events, which nothing
 *  but the browser fires. Against MockGL a test here would prove that a
 *  handler ran and nothing about whether the drawing came back.
 *
 *  The two halves are separate `evaluate` calls on purpose. `loseContext()`
 *  dispatches its event asynchronously, and the spec only allows
 *  `restoreContext()` after that event has been delivered — restoring inside
 *  the same task would either be ignored or race the engine's own handler,
 *  which is the sort of flake that gets a suite switched off. Waiting on the
 *  engine's own `contextLost` flag is what makes the handover observable
 *  rather than timed. */
export async function loseAndRestoreContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) throw new Error('no canvas')
    // The same context the engine is holding: getContext returns the one that
    // already exists rather than making a second.
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
    const ext = gl?.getExtension('WEBGL_lose_context') as { loseContext(): void; restoreContext(): void } | null
    if (!ext) throw new Error('WEBGL_lose_context is unavailable — this browser cannot run the test')
    ;(window as unknown as { __loseCtx?: unknown }).__loseCtx = ext
    ext.loseContext()
  })

  await page.waitForFunction(() => window.__engine!.gpuInfo().contextLost === true, undefined, { timeout: 15_000 })

  await page.evaluate(() => {
    const ext = (window as unknown as { __loseCtx?: { restoreContext(): void } }).__loseCtx
    ext!.restoreContext()
  })

  await page.waitForFunction(() => window.__engine!.gpuInfo().contextLost === false, undefined, { timeout: 30_000 })
}

/** Joins an existing room as a second participant, through the gate. */
export async function joinRoom(page: Page, roomId: string, name = 'Student'): Promise<void> {
  await page.goto(`/room/${roomId}`)
  await page.locator(NAME_INPUT).first().fill(name)
  await page.locator(SUBMIT).click()
  await waitForRoomReady(page)
}
