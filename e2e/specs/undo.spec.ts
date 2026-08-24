import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, hasLayerContent, INK,
  maxDarknessOverContent, maxDarknessOverRect, operations, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#491) Undo is the second thing anyone does after drawing, and the first
 *  thing they do after a mistake in front of a student.
 *
 *  Worth its own scenario rather than a line in the drawing one because undo
 *  has a failure mode that only a real canvas can see: the operation leaves
 *  the log while the pixels stay, or come back doubled. #479 is exactly that
 *  shape — a checkpoint taken over unaccounted paint, replaying a stroke a
 *  second time on every undo — and it is invisible to anything that inspects
 *  the log alone. */
test.describe('undo and redo', () => {
  test('undo takes the stroke off the canvas, redo puts it back', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 300], [640, 300]])
    await waitForOperations(page, 'stroke')
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)
    // Kept before the undo, because the layer's tracked bounds are free to
    // stop describing a region once nothing is painted in it. The question
    // afterwards is about this rectangle specifically: is the paper back where
    // the stroke was.
    const drawn = await contentBounds(page, layer)
    expect(drawn).not.toBeNull()

    await page.keyboard.press('Control+z')
    // Through the keyboard rather than by calling `engine.undo()`: the hotkey
    // registry, the store and the engine are three separate things that have
    // to agree, and driving the engine directly would skip the two that
    // actually break.
    await expect.poll(() => hasLayerContent(page, layer)).toBe(false)
    expect(await maxDarknessOverRect(page, drawn!)).toBeLessThan(INK)

    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => hasLayerContent(page, layer)).toBe(true)
    expect(await maxDarknessOverRect(page, drawn!)).toBeGreaterThan(INK)
    // The stroke came back once, not twice: an undo/redo that replays over
    // paint it failed to account for shows up as a log that has grown.
    expect((await operations(page)).filter(op => op.type === 'stroke')).toHaveLength(1)
  })
})
