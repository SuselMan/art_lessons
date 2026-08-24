import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, hasLayerContent, INK,
  maxDarknessOverContent, operations, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#491) The path the whole product is: make a room, draw in it, see the
 *  mark. Nothing in the 1800 unit tests covers it end to end, and nothing in
 *  them can — see playwright.config.ts. */
test.describe('a new room takes a stroke', () => {
  test('the stroke lands on the canvas and in the log', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)

    const layer = await activeLayerId(page)
    // The premise, asserted rather than assumed: everything below is about a
    // change of state, and a room that started with content would make all of
    // it meaningless.
    expect(await hasLayerContent(page, layer)).toBe(false)

    await drawStroke(page, [[320, 300], [480, 300], [640, 300]])
    await waitForOperations(page, 'stroke')

    expect(await hasLayerContent(page, layer)).toBe(true)

    // The claim a MockGL test can never make: there is ink on the screen.
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)

    const strokes = (await operations(page)).filter(op => op.type === 'stroke')
    expect(strokes).toHaveLength(1)
    // A stroke recorded against a different layer would satisfy the pixel
    // assertion and still be a bug: the log is what a peer replays and what a
    // rejoin rebuilds from.
    expect(strokes[0]).toMatchObject({ layerId: layer, type: 'stroke' })
  })

  test('a second stroke adds to the first rather than replacing it', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 260], [640, 260]])
    await waitForOperations(page, 'stroke', 1)
    const afterOne = await contentBounds(page, layer)

    await drawStroke(page, [[320, 420], [640, 420]])
    await waitForOperations(page, 'stroke', 2)
    const afterTwo = await contentBounds(page, layer)

    // Two separate marks, so the painted region has to have grown downward.
    // Cheap, and it catches the failure where each gesture clears the layer
    // before painting — which looks perfectly fine in a single-stroke test.
    expect(afterOne).not.toBeNull()
    expect(afterTwo).not.toBeNull()
    expect(afterTwo!.height).toBeGreaterThan(afterOne!.height)
  })
})
