import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, INK, maxDarknessOverRect, operations,
  waitForOperations, waitForRoomReady,
} from '../support/room'

/** Picks the eraser by its hotkey rather than by a button.
 *
 *  Two buttons carry that accessible name — the toolbar's and the floating
 *  panel's — and disambiguating between them would pin this test to whichever
 *  one it named, for no gain: what it needs is the eraser in hand. */
async function selectEraser(page: Page): Promise<void> {
  await page.keyboard.press('e')
  await expect
    .poll(() => page.evaluate(() => window.__roomStore!.getState().drawingTool))
    .toBe('eraser')
}

/** Moves the active row, the way clicking a layer in the panel does. Through
 *  the store rather than through the panel because a row's only stable handle
 *  is the layer's name, which is generated and translated; Room pushes
 *  `layerState.activeId` into the engine either way. */
async function makeActive(page: Page, layerId: string): Promise<void> {
  await page.evaluate(id => {
    const store = window.__roomStore!
    store.setState({ layerState: { ...store.getState().layerState, activeId: id, selectedIds: [id] } })
  }, layerId)
  await expect.poll(() => activeLayerId(page)).toBe(layerId)
}

/** Two marks side by side in the middle of what is on screen, and one sweep
 *  across both of them.
 *
 *  Placed relative to the canvas's own centre rather than at fixed offsets, and
 *  that is not fussiness: a room opens fitted to the window, so a coordinate
 *  comfortably on the paper at one size is off the sheet entirely at another —
 *  measured, on the first version of this test, as a stroke whose recorded
 *  content was a 76-pixel sliver clipped by the page's left edge. */
async function marks(page: Page): Promise<Record<'left' | 'right' | 'sweep', Array<[number, number]>>> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: the canvas has no box')
  const cx = box.width / 2
  const cy = box.height / 2
  return {
    left: [[cx - 260, cy], [cx - 200, cy], [cx - 140, cy]],
    right: [[cx + 140, cy], [cx + 200, cy], [cx + 260, cy]],
    sweep: [[cx - 330, cy], [cx, cy], [cx + 330, cy]],
  }
}

/** (#520) The eraser's cross-layer mode, from the toggle down to the pixels.
 *
 *  The engine tests around this one are thorough about the operation log and
 *  can say nothing about the two things a person would actually notice, because
 *  MockGL never rasterizes and jsdom never renders: that the toggle is *there*
 *  in the quick column beside the eraser, and that ink is gone from a layer
 *  nobody selected. Both of those live here.
 *
 *  The two marks are laid side by side rather than stacked, and that is what
 *  makes the measurement mean anything: their painted regions do not overlap,
 *  so reading the composite over one layer's own bounds reads that layer's ink
 *  and nothing else. Stacked, a single darkness reading could not tell "both
 *  layers erased" from "the top one erased and the bottom one showing through".
 *
 *  The second layer is created before either mark is drawn, so the panel and
 *  the canvas are done changing size by the time any coordinate is taken. */
test.describe('erasing through layers', () => {
  async function twoInkedLayers(page: Page) {
    await createRoom(page)
    await waitForRoomReady(page)
    const lower = await activeLayerId(page)

    await page.getByRole('button', { name: 'Add layer' }).click()
    await waitForOperations(page, 'layer_add', 1)
    const upper = await activeLayerId(page)
    expect(upper).not.toBe(lower)

    const where = await marks(page)
    await makeActive(page, lower)
    await drawStroke(page, where.left)
    await waitForOperations(page, 'stroke', 1)

    await makeActive(page, upper)
    await drawStroke(page, where.right)
    await waitForOperations(page, 'stroke', 2)

    const lowerInk = await contentBounds(page, lower)
    const upperInk = await contentBounds(page, upper)
    expect(lowerInk).not.toBeNull()
    expect(upperInk).not.toBeNull()
    // Disjoint, or each reading below would be measuring both layers at once.
    expect(lowerInk!.x + lowerInk!.width).toBeLessThan(upperInk!.x)
    expect(await maxDarknessOverRect(page, lowerInk!)).toBeGreaterThan(INK)
    expect(await maxDarknessOverRect(page, upperInk!)).toBeGreaterThan(INK)

    return { lower, upper, lowerInk: lowerInk!, upperInk: upperInk!, where }
  }

  test('one pass clears both layers, and one undo brings both back', async ({ page }) => {
    const { lower, upper, lowerInk, upperInk, where } = await twoInkedLayers(page)

    await selectEraser(page)
    // The control itself, in the quick column — clicked rather than set through
    // the store, because "the toggle is there, beside the eraser's own
    // settings" is half of what this feature is.
    await page.getByRole('switch', { name: 'Erase through layers' }).click()

    // One sweep across both marks. `upper` is the active layer, so without the
    // mode this takes the right-hand mark off and leaves the left-hand one
    // exactly as it was — which is the second assertion below.
    await drawStroke(page, where.sweep, { size: 120 })
    await waitForOperations(page, 'stroke', 4)

    expect(await maxDarknessOverRect(page, upperInk)).toBeLessThan(INK)
    expect(await maxDarknessOverRect(page, lowerInk)).toBeLessThan(INK)

    // One gesture in the log, recorded as one operation per layer — the shape
    // the whole feature is built on (see the engine's own tests) checked here
    // against the real server, which stores and re-broadcasts each of them as
    // an ordinary single-layer stroke.
    const strokes = (await operations(page)).filter(op => op.type === 'stroke')
    const erase = strokes.slice(-2)
    expect(erase.map(op => op.layerId).sort()).toEqual([lower, upper].sort())
    expect(erase[0].strokeId).toBeTruthy()
    expect(erase[1].strokeId).toBe(erase[0].strokeId)

    // And one press to undo all of it. Two presses would mean a half-erased
    // picture in between, which is the state a person reads as undo having
    // gone wrong.
    await page.keyboard.press('Control+z')
    await expect
      .poll(() => maxDarknessOverRect(page, lowerInk), { message: 'lower layer ink restored' })
      .toBeGreaterThan(INK)
    expect(await maxDarknessOverRect(page, upperInk)).toBeGreaterThan(INK)
  })

  test('with the toggle off it stays on the active layer', async ({ page }) => {
    const { upper, lowerInk, upperInk, where } = await twoInkedLayers(page)

    await selectEraser(page)
    await drawStroke(page, where.sweep, { size: 120 })
    await waitForOperations(page, 'stroke', 3)

    // The default, and what everyone who never finds the toggle gets: the
    // active layer loses its mark and the other one is untouched.
    expect(await maxDarknessOverRect(page, upperInk)).toBeLessThan(INK)
    expect(await maxDarknessOverRect(page, lowerInk)).toBeGreaterThan(INK)

    const strokes = (await operations(page)).filter(op => op.type === 'stroke')
    expect(strokes).toHaveLength(3)
    expect(strokes[2].layerId).toBe(upper)
  })
})
