import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, hasLayerContent, INK, joinRoom,
  loseAndRestoreContext, maxDarknessOverContent, operations, setBrushSize,
  waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#492) Losing the GPU context and getting it back.
 *
 *  `_handleContextRestored` in the engine is careful and thorough — it rebuilds
 *  GL state, drops every pooled buffer and preview by hand, and replays each
 *  live layer from the log. It has also never been executed by anything but a
 *  real tablet having a bad afternoon: the only mention of `contextLost` in
 *  the whole test suite before this file was a field read in `gpuInfo()`.
 *
 *  It matters here more than most places. On a tablet a lost context is an
 *  ordinary event — the browser takes the GPU back when memory gets tight or
 *  the app goes to the background — and the tablet is the target device. The
 *  cost of restoring it incompletely is a drawing that disappears in the
 *  middle of a lesson, which is exactly the class of failure §1 of the release
 *  track (#314) refuses to ship with.
 *
 *  Nothing below can be written against MockGL: there is no context to lose,
 *  no `webglcontextrestored` to fire, and no pixels to check afterwards. */
test.describe('losing the WebGL context', () => {
  test('the drawing comes back, pixel for pixel', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 300], [640, 300]])
    await waitForOperations(page, 'stroke')
    const before = await contentBounds(page, layer)
    const darkBefore = await maxDarknessOverContent(page, layer)
    expect(before).not.toBeNull()
    expect(darkBefore).toBeGreaterThan(INK)

    await loseAndRestoreContext(page)

    // Polled, not read once: the restore re-uploads the paper texture from its
    // byte cache, and until that lands the composite is drawn over a
    // placeholder. The claim is that it gets there, not that it is instant.
    await expect.poll(() => maxDarknessOverContent(page, layer), { timeout: 20_000 })
      .toBeGreaterThan(INK)

    expect(await hasLayerContent(page, layer)).toBe(true)
    const after = await contentBounds(page, layer)
    expect(after).not.toBeNull()
    // Same ink in the same place. Rebuilt by replaying the log into a fresh
    // set of buffers — every texture the old context held died with it, so
    // none of this is the original pixels surviving.
    expect(after!.x).toBeCloseTo(before!.x, -1)
    expect(after!.y).toBeCloseTo(before!.y, -1)
    expect(after!.width).toBeCloseTo(before!.width, -1)
    expect(after!.height).toBeCloseTo(before!.height, -1)

    // Replayed once, not appended: a restore that pushed its replay back into
    // the log would grow it, and the room would then send a peer the same
    // stroke twice.
    expect((await operations(page)).filter(op => op.type === 'stroke')).toHaveLength(1)
  })

  test('undo still knows what it was going to undo', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 260], [640, 260]])
    await waitForOperations(page, 'stroke', 1)
    await drawStroke(page, [[320, 420], [640, 420]])
    await waitForOperations(page, 'stroke', 2)
    const bothStrokes = await contentBounds(page, layer)

    await loseAndRestoreContext(page)
    await expect.poll(() => maxDarknessOverContent(page, layer), { timeout: 20_000 })
      .toBeGreaterThan(INK)

    // The undo stack lives in plain JavaScript and was never the context's to
    // lose — but the *pixels* it undoes back to are checkpoints, and those are
    // GL buffers that died. This is the assertion that says the two still
    // agree with each other after a rebuild.
    await page.keyboard.press('Control+z')
    await expect.poll(() => contentBounds(page, layer).then(b => b?.height ?? 0), { timeout: 20_000 })
      .toBeLessThan(bothStrokes!.height)
    expect(await hasLayerContent(page, layer)).toBe(true)

    await page.keyboard.press('Control+z')
    await expect.poll(() => hasLayerContent(page, layer)).toBe(false)

    await page.keyboard.press('Control+Shift+z')
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => contentBounds(page, layer).then(b => b?.height ?? 0), { timeout: 20_000 })
      .toBeCloseTo(bothStrokes!.height, -1)
    // Back to two, not four: an undo/redo that replayed over paint it had
    // failed to account for is #479's shape, and a context restore is a
    // plausible way to get into exactly that state.
    expect((await operations(page)).filter(op => op.type === 'stroke')).toHaveLength(2)
  })

  test('a gesture interrupted by the loss leaves nothing behind', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 260], [640, 260]])
    await waitForOperations(page, 'stroke', 1)
    const committed = await contentBounds(page, layer)

    // A stroke under the pen when the GPU goes away. Its live preview lives in
    // a scratch buffer the restore explicitly drops, which is the interesting
    // part: the half-drawn shape must not survive as a ghost, and it must not
    // be committed twice if the pen comes up afterwards.
    // Set explicitly, because this gesture is assembled by hand rather than
    // through `drawStroke` — which is where the deliberately fat brush
    // normally comes from, and why. A hairline here would be real ink that no
    // pixel assertion can distinguish from paper.
    await setBrushSize(page, 48)
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box!.x + 320, box!.y + 500)
    await page.mouse.down()
    await page.mouse.move(box!.x + 500, box!.y + 500, { steps: 8 })

    await loseAndRestoreContext(page)
    await page.mouse.up()

    await expect.poll(() => maxDarknessOverContent(page, layer), { timeout: 20_000 })
      .toBeGreaterThan(INK)

    // What was already committed is still exactly where it was. Whether the
    // interrupted gesture commits or is abandoned is deliberately not asserted
    // — both are defensible, the engine does not promise either, and a test
    // that picked one would be pinning an accident rather than a decision.
    const after = await contentBounds(page, layer)
    expect(after!.y).toBeCloseTo(committed!.y, -1)
    const strokes = (await operations(page)).filter(op => op.type === 'stroke').length
    expect(strokes).toBeGreaterThanOrEqual(1)
    expect(strokes).toBeLessThanOrEqual(2)

    // And the room is still usable afterwards, which is the part a person
    // would actually notice: a restore that left the pointer pipeline in a
    // broken state would show up here and nowhere else.
    await drawStroke(page, [[320, 640], [640, 640]])
    await waitForOperations(page, 'stroke', strokes + 1)
    expect(await hasLayerContent(page, layer)).toBe(true)
  })

  test('a peer stroke in flight is not left half-drawn', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)

      // The teacher starts a gesture and holds it. Its dabs stream to the
      // student live (#429) and are painted into a per-peer scratch buffer
      // there — one of the things the restore drops by hand, because a pooled
      // buffer from a dead context handed back to the next gesture is how a
      // peer's ink ends up painted through a texture that no longer exists.
      await setBrushSize(page, 48)
      const box = await page.locator('canvas').first().boundingBox()
      await page.mouse.move(box!.x + 320, box!.y + 300)
      await page.mouse.down()
      await page.mouse.move(box!.x + 480, box!.y + 300, { steps: 20 })

      // The student's tablet picks this moment to lose its GPU.
      await loseAndRestoreContext(studentPage)

      await page.mouse.move(box!.x + 640, box!.y + 300, { steps: 20 })
      await page.mouse.up()
      await waitForOperations(page, 'stroke', 1)
      await waitForOperations(studentPage, 'stroke', 1)

      const layer = await activeLayerId(studentPage)
      await expect.poll(() => maxDarknessOverContent(studentPage, layer), { timeout: 20_000 })
        .toBeGreaterThan(INK)

      // The whole stroke, once. Both browsers arrived here by replaying the
      // same committed operation, so their ink should read the same: a live
      // preview left behind by the lost context would sit under the replay and
      // make the student's copy the darker of the two.
      const teacherLayer = await activeLayerId(page)
      const teacherDark = await maxDarknessOverContent(page, teacherLayer)
      const studentDark = await maxDarknessOverContent(studentPage, layer)
      expect(studentDark).toBeLessThanOrEqual(teacherDark + 0.05)
      expect((await operations(studentPage)).filter(op => op.type === 'stroke')).toHaveLength(1)
    } finally {
      await student.close()
    }
  })
})
