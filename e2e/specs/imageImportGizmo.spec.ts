import { expect, test, type Page } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#608) An imported reference lands with the transform gizmo already on it.
 *
 *  People did not find the transform tool by themselves, and moving and sizing
 *  a reference is nearly always the next thing done with it. What is checked
 *  is the part that is easy to get subtly wrong: the frame has to sit around
 *  the picture, not around the whole sheet — an import is decoded
 *  asynchronously, and a session opened before its pixels are in the layer
 *  falls back to framing the sheet. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
})

function state(page: Page) {
  return page.evaluate(() => {
    const s = window.__roomStore!.getState()
    return { tool: s.tool, selection: s.selection, bounds: s.transformBounds, activeId: s.layerState.activeId }
  })
}

/** A wide black PNG, so that fitted into the sheet it is visibly shorter
 *  than the sheet — the frame can then only match it one way. */
async function importWidePng(page: Page): Promise<void> {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 400; c.height = 100
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    return c.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
  })
}

async function expectGizmoOnImport(page: Page, layerBefore: string): Promise<void> {
  await waitForOperations(page, 'image_import', 1)
  await expect.poll(async () => (await state(page)).tool).toBe('transform')
  const s = await state(page)
  expect(s.activeId).not.toBe(layerBefore)
  expect(s.selection).toBeNull()
  await expect(page.locator('[data-transform-gizmo] polygon').first()).toBeVisible()

  const painted = await contentBounds(page, s.activeId)
  expect(painted).not.toBeNull()
  expect(s.bounds).not.toBeNull()
  // The frame is the picture's own box, within a pixel of the painted rect.
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(s.bounds![k] - painted![k])).toBeLessThanOrEqual(2)
  }
  // And a 4:1 picture is nowhere near as tall as it is wide — i.e. this is
  // not the whole-sheet fallback.
  expect(s.bounds!.height).toBeLessThan(s.bounds!.width / 2)
}

test.describe('importing a reference image', () => {
  test('opens the transform gizmo around the picture', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const before = await activeLayerId(page)

    await importWidePng(page)
    await expectGizmoOnImport(page, before)
  })

  test('drops a standing selection, so the frame is not the selection', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await drawStroke(page, [[320, 280], [420, 320], [500, 300]])
    await waitForOperations(page, 'stroke', 1)
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    const box = (await page.locator('canvas').first().boundingBox())!
    await page.mouse.move(box.x + 280, box.y + 240)
    await page.mouse.down()
    await page.mouse.move(box.x + 560, box.y + 380, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await state(page)).selection).not.toBeNull()
    const before = await activeLayerId(page)

    await importWidePng(page)
    await expectGizmoOnImport(page, before)
  })
})
