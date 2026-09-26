import { expect, test, type Page } from '@playwright/test'

import {
  INK, activeLayerId, contentBounds, createRoom, drawStroke, hasLayerContent, maxDarknessOverRect, operations,
  waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#493) Moving a layer with the gizmo, and letting go of it.
 *
 *  The session behind the gizmo — open on selecting the tool, accumulate a
 *  matrix while dragging, commit on Enter or a click past the frame — is what
 *  useTransformSession owns, and until this file nothing exercised its commit
 *  on an ordinary layer. Breaking the commit on purpose turned only the
 *  clipboard scenarios red, because a paste is dropped through the same
 *  function; transformSeam drives the engine directly and never opens a
 *  session at all.
 *
 *  The tool is switched through the store, the way its toolbar button does:
 *  the button is not what is under test here, and the store call is the one
 *  thing every way of picking the tool has in common. */

/** Picks up the transform tool and drags the frame's body down and to the
 *  right. The session is left open: nothing is committed. */
async function dragWithGizmo(page: Page): Promise<void> {
  await page.evaluate(() => window.__roomStore!.getState().setTool('transform'))
  const body = page.locator('[data-transform-gizmo] polygon').first()
  await expect(body).toBeVisible()

  // A real drag on the frame's body, in steps, so the gizmo sees a gesture
  // rather than a teleport. Grabbed a fifth of the way in, not at the
  // middle: the middle is where the rotation pivot's own hit circle sits,
  // and dragging that moves the pivot instead of the layer — which the
  // first version of this test did, and then reported as a lost commit.
  const box = await body.boundingBox()
  if (!box) throw new Error('e2e: the gizmo has no box')
  const from = { x: box.x + box.width * 0.2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 150, from.y + 90, { steps: 12 })
  await page.mouse.up()
}

test.describe('the transform gizmo', () => {
  test('a dragged layer stays where it was dropped, and the move is in the log', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 300], [520, 300]])
    await waitForOperations(page, 'stroke', 1)
    const before = await contentBounds(page, layer)
    expect(before).not.toBeNull()

    await dragWithGizmo(page)

    // Nothing reaches the log while the session is open — the drag is a
    // preview. Enter is what commits it.
    expect((await operations(page)).filter(op => op.type === 'layer_transform')).toHaveLength(0)
    await page.keyboard.press('Enter')
    await waitForOperations(page, 'layer_transform', 1)

    // The pixels moved with it, down and to the right. Checked through the
    // layer's own painted bounds rather than the screen: a preview that was
    // cleared without the operation landing would show the stroke back where
    // it started, which is exactly the failure this test exists to catch.
    await expect.poll(async () => (await contentBounds(page, layer))?.x ?? 0).toBeGreaterThan(before!.x + 100)
    const after = await contentBounds(page, layer)
    expect(after!.y).toBeGreaterThan(before!.y + 50)
  })

  // (#405) Undo with a move still open takes back the move — the innermost
  // thing open — and not the stroke before it. Reaching past the session into
  // the log would undo the stroke while the preview went on showing it moved,
  // i.e. look like undo did nothing. Nothing covered this path through
  // handleUndo until the dispatch code was about to move out of Room (#493).
  test('undo while a move is open throws the move away and keeps the stroke', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await drawStroke(page, [[320, 300], [520, 300]])
    await waitForOperations(page, 'stroke', 1)
    const before = await contentBounds(page, layer)
    if (!before) throw new Error('e2e: the stroke left no content')

    await dragWithGizmo(page)
    await page.keyboard.press('Control+z')

    // The session is back at rest: the stroke is where it was drawn, still
    // painted, and nothing was committed.
    await expect.poll(() => maxDarknessOverRect(page, before)).toBeGreaterThan(INK)
    expect(await hasLayerContent(page, layer)).toBe(true)
    expect((await operations(page)).filter(op => op.type === 'layer_transform')).toHaveLength(0)

    // And undo is not stuck: with nothing open, the next one takes the stroke.
    await page.keyboard.press('Control+z')
    await expect.poll(() => hasLayerContent(page, layer)).toBe(false)
  })
})
