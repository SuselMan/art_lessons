import { expect, test, type Page } from '@playwright/test'

import type { StrokeOperation } from '../../packages/shared/src/index'
import { createRoom, drawStroke, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** (#493) The colour well, written before it moved out of Room into its own
 *  hook. Everything here goes through the surface a person uses — the well on
 *  the rail, the flyout it opens, the palette in it — and every claim about
 *  "the colour" is checked where it finally lands: in the store, and in the
 *  `color` a recorded stroke carries, which is what the engine was actually
 *  told to draw with. Nothing in the suite had ever opened the flyout. */

const PLUM = '#9e0059' // a default palette entry (DEFAULT_PALETTE_COLORS)
const PLUM_RGB = [0x9e / 255, 0, 0x59 / 255]

/** The rail's well: the one colour button that says whether it is open. */
function railWell(page: Page) {
  return page.locator(
    'button[aria-expanded]:is([aria-label="Color"], [aria-label="Stroke colour"], [aria-label="Fill colour"])',
  )
}

function flyout(page: Page) {
  return page.getByRole('dialog', { name: 'Color' })
}

async function selectTool(page: Page, tool: string): Promise<void> {
  await page.evaluate(t => window.__roomStore!.getState().setTool(t as never), tool)
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().tool)).toBe(tool)
}

function setting(page: Page, tool: string, key: string): Promise<unknown> {
  return page.evaluate(([t, k]) => (window.__roomStore!.getState().toolSettings as never)[t][k], [tool, key] as const)
}

const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.01)

test.describe('the colour well', () => {
  test('a palette colour from the rail is the colour the next stroke is drawn in', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)

    await railWell(page).click()
    await expect(flyout(page)).toBeVisible()
    await flyout(page).getByRole('button', { name: `Select color ${PLUM}` }).click()

    await expect.poll(async () => close(await setting(page, 'pencil', 'color') as number[], PLUM_RGB)).toBe(true)
    await page.keyboard.press('Escape')
    await drawStroke(page, [[300, 300], [500, 320]])
    await waitForOperations(page, 'stroke', 1)
    const stroke = (await operations(page)).find((op): op is StrokeOperation => op.type === 'stroke')
    expect(close(stroke!.color, PLUM_RGB), `stroke colour ${stroke!.color}`).toBe(true)
  })

  // The eraser owns no colour, so the well stands for the colour the next
  // stroke will use — the last drawing tool's — and edits exactly that.
  test('with the eraser in hand the well edits the pencil’s colour', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await selectTool(page, 'eraser')

    await railWell(page).click()
    await flyout(page).getByRole('button', { name: `Select color ${PLUM}` }).click()
    await expect.poll(async () => close(await setting(page, 'pencil', 'color') as number[], PLUM_RGB)).toBe(true)
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('eraser')
  })

  test('for a shape: choosing a colour for a switched-off fill switches it on, and swap trades both', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await selectTool(page, 'shape')
    await page.evaluate(() => window.__roomStore!.getState().setToolSetting('shape', 'fillOn', false))

    await railWell(page).click()
    const surface = flyout(page)
    await surface.getByRole('button', { name: 'Fill colour' }).click()
    await surface.getByRole('button', { name: `Select color ${PLUM}` }).click()

    // (#529) Reaching for the palette with an empty fill selected asks for a fill.
    await expect.poll(() => setting(page, 'shape', 'fillOn')).toBe(true)
    expect(close(await setting(page, 'shape', 'fillColor') as number[], PLUM_RGB)).toBe(true)

    const strokeBefore = await setting(page, 'shape', 'strokeColor') as number[]
    await surface.getByRole('button', { name: 'Swap stroke and fill' }).click()
    await expect.poll(async () => close(await setting(page, 'shape', 'strokeColor') as number[], PLUM_RGB)).toBe(true)
    expect(close(await setting(page, 'shape', 'fillColor') as number[], strokeBefore)).toBe(true)

    // "No colour" switches off the swatch in front, not the other one.
    await surface.getByRole('button', { name: 'Fill colour' }).click()
    const fillOn = await setting(page, 'shape', 'fillOn')
    await surface.getByRole('button', { name: 'No colour' }).click()
    await expect.poll(() => setting(page, 'shape', 'fillOn')).toBe(!fillOn)
  })

  // Round-trips through the server: palette_updated is the only writer.
  test('adding the current colour to the palette reaches the room', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    await page.evaluate(() => window.__roomStore!.getState().setToolSetting('pencil', 'color', [0.2, 0.4, 0.6]))
    const before = await page.evaluate(() => window.__roomStore!.getState().palette.length)

    await railWell(page).click()
    await flyout(page).getByRole('button', { name: 'Add to palette' }).click()
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().palette.length)).toBe(before + 1)

    await flyout(page).getByRole('button', { name: 'Remove from palette' }).click()
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().palette.length)).toBe(before)
  })

  test('the well toggles its flyout and says so', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const well = railWell(page)
    await expect(well).toHaveAttribute('aria-expanded', 'false')
    await well.click()
    await expect(well).toHaveAttribute('aria-expanded', 'true')
    await well.click()
    await expect(flyout(page)).toBeHidden()
    await expect(well).toHaveAttribute('aria-expanded', 'false')
  })
})
