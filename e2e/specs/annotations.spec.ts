import { expect, test, type Page } from '@playwright/test'

import { createRoom, drawStroke, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** (#493) Annotations end to end — the pen, the text note, the eraser.
 *
 *  Written when the Room side of annotations moved into useAnnotations and it
 *  turned out nothing covered it: the one e2e that touches annotations at all
 *  (classMode) only checks which tool is selected. Six hundred lines of
 *  gesture handling were being moved with no test able to say they still did
 *  anything.
 *
 *  Tools are picked through the store, as their buttons do — the buttons are
 *  not what is under test. Assertions read the store's annotation projection,
 *  which is derived from the operation log (annotationSlice), so a mark that
 *  shows up there is one that was recorded, not only drawn. */

function annotations(page: Page): Promise<{ kind: string; text?: string }[]> {
  return page.evaluate(() => {
    const { items, order } = window.__roomStore!.getState().annotations
    return order.map(id => {
      const a = items[id]
      return { kind: a.kind, text: a.kind === 'text' ? a.text : undefined }
    })
  })
}

async function pickTool(page: Page, tool: 'annotatePen' | 'annotateText' | 'annotateEraser'): Promise<void> {
  await page.evaluate(t => window.__roomStore!.getState().setTool(t), tool)
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().tool)).toBe(tool)
}

test.describe('annotations', () => {
  test('preview links enter annotation mode once and allow returning to drawing', async ({ page }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    expect(await page.evaluate(() => window.__roomStore!.getState().annotationMode)).toBe(false)
    await page.goto(`/room/${roomId}?preview`)
    await page.locator('form button[type="submit"]').click()
    await waitForRoomReady(page)
    const mode = page.getByRole('button', { name: 'Annotations', exact: true })
    await expect(mode).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('annotateText')
    await mode.click()
    await expect(mode).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Add layer', exact: true }).click()
    await waitForOperations(page, 'layer_add', 1)
    await expect(mode).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('pencil')
    await page.reload()
    await page.locator('form button[type="submit"]').click()
    await waitForRoomReady(page)
    await expect(mode).toHaveAttribute('aria-pressed', 'true')
  })

  test('the annotation pen records a mark, and leaves the drawing alone', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await pickTool(page, 'annotatePen')

    // Through the same helper a stroke uses: real input, in steps. It lands on
    // the annotation catcher that covers the canvas while the pen is in hand.
    await drawStroke(page, [[300, 260], [420, 320], [540, 280]])

    await waitForOperations(page, 'annotation_add', 1)
    await expect.poll(() => annotations(page)).toEqual([{ kind: 'ink', text: undefined }])
    // An annotation is not paint: nothing went onto a layer.
    expect((await operations(page)).filter(op => op.type === 'stroke')).toHaveLength(0)
  })

  test('a text note opens on a tap, takes typing, and is recorded on Ctrl+Enter', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await pickTool(page, 'annotateText')

    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('e2e: no canvas')
    await page.mouse.click(box.x + 400, box.y + 300)
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().annotationDraft !== null))
      .toBe(true)

    await page.keyboard.type('Look here')
    // Return breaks the line inside a note; nothing is recorded yet.
    expect((await operations(page)).filter(op => op.type === 'annotation_add')).toHaveLength(0)
    await page.keyboard.press('Control+Enter')

    await waitForOperations(page, 'annotation_add', 1)
    await expect.poll(() => annotations(page)).toEqual([{ kind: 'text', text: 'Look here' }])
    expect(await page.evaluate(() => window.__roomStore!.getState().annotationDraft)).toBeNull()
  })

  test('the annotation eraser removes a mark by dragging across it', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await pickTool(page, 'annotatePen')
    await drawStroke(page, [[300, 300], [560, 300]])
    await waitForOperations(page, 'annotation_add', 1)

    await pickTool(page, 'annotateEraser')
    // Across the mark, not along it — the eraser hits what the path crosses.
    await drawStroke(page, [[430, 220], [430, 380]])

    await waitForOperations(page, 'annotation_delete', 1)
    await expect.poll(() => annotations(page)).toEqual([])
  })
})
