import { expect, test } from '@playwright/test'

import {
  activeLayerId, createRoom, hasLayerContent, INK, maxDarknessOverContent,
  operations, waitForOperations, waitForRoomReady,
} from '../support/room'

// (#530, epic #525) The shape tool end to end, which is the only place it can
// be checked at all: its rasterizer is a fragment shader, and MockGL — what
// every unit test in this repo runs against — does not rasterize. A pixel
// assertion in vitest would measure the mock (see the engine's own charcoal
// and marker tests for the same limit stated there).
//
// So these tests ask the two questions unit tests provably cannot: does the
// shader compile and paint on a real GPU, and does the session behave — a
// shape that stays editable until it is confirmed, and a stray click that
// records nothing.

const GIZMO = '[data-transform-gizmo]'

/** Drags a shape across the canvas with a real mouse, the way a person does.
 *  Synthetic pointer events dispatched from page script would not do: the app
 *  reads pointer capture and modifier state off the real event. */
async function dragShape(
  page: import('@playwright/test').Page,
  from: [number, number], to: [number, number],
  opts: { modifier?: 'Shift' | 'Alt' } = {},
): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('e2e: no canvas box')
  const at = ([x, y]: [number, number]) => ({ x: box.x + x, y: box.y + y })
  if (opts.modifier) await page.keyboard.down(opts.modifier)
  await page.mouse.move(at(from).x, at(from).y)
  await page.mouse.down()
  // Two intermediate moves, not one: the first is what starts the shape and
  // the second is what proves it keeps following the pointer.
  await page.mouse.move((at(from).x + at(to).x) / 2, (at(from).y + at(to).y) / 2)
  await page.mouse.move(at(to).x, at(to).y)
  await page.mouse.up()
  if (opts.modifier) await page.keyboard.up(opts.modifier)
}

test.describe('shapes', () => {
  test('a rectangle stays editable, then lands on the canvas and in the log', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)
    expect(await hasLayerContent(page, layer)).toBe(false)

    await page.getByRole('button', { name: 'Rectangle', exact: true }).click()
    await dragShape(page, [320, 260], [620, 440])

    // The pen is up and the shape is *not* in the log yet — the whole premise
    // of the tool (#525): it is still being placed.
    await expect(page.locator(GIZMO)).toBeVisible()
    expect((await operations(page)).filter(op => op.type === 'shape')).toHaveLength(0)

    await page.keyboard.press('Enter')
    await waitForOperations(page, 'shape')
    await expect(page.locator(GIZMO)).toBeHidden()

    expect(await hasLayerContent(page, layer)).toBe(true)
    // The claim only a real GPU can answer: the shader compiled and drew.
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)

    const shapes = (await operations(page)).filter(op => op.type === 'shape')
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ layerId: layer, type: 'shape' })
  })

  test('a click that never moved records nothing', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await page.getByRole('button', { name: 'Rectangle', exact: true }).click()
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('e2e: no canvas box')
    await page.mouse.click(box.x + 400, box.y + 300)

    await expect(page.locator(GIZMO)).toBeHidden()
    expect((await operations(page)).filter(op => op.type === 'shape')).toHaveLength(0)
    expect(await hasLayerContent(page, layer)).toBe(false)
  })

  test('Esc drops an unconfirmed shape without a trace', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    await page.getByRole('button', { name: 'Ellipse', exact: true }).click()
    await dragShape(page, [320, 260], [560, 420])
    await expect(page.locator(GIZMO)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator(GIZMO)).toBeHidden()
    expect((await operations(page)).filter(op => op.type === 'shape')).toHaveLength(0)
    // Nothing was ever written, so there is nothing on the layer either — a
    // preview that leaked into the buffer would show up right here.
    expect(await hasLayerContent(page, layer)).toBe(false)
  })

  test('Shift constrains the drag to a square', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)

    await page.getByRole('button', { name: 'Rectangle', exact: true }).click()
    await dragShape(page, [320, 260], [620, 360], { modifier: 'Shift' })
    await page.keyboard.press('Enter')
    await waitForOperations(page, 'shape')

    const shape = (await operations(page)).filter(op => op.type === 'shape')[0] as {
      frame: { width: number; height: number }
    }
    expect(Math.abs(shape.frame.width)).toBeCloseTo(Math.abs(shape.frame.height), 6)
  })

  test('every shape tool paints something', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)
    const layer = await activeLayerId(page)

    // One of each, so a shader branch that fails to compile or draws nothing
    // is caught per kind rather than only for the rectangle.
    const tools: Array<[string, [number, number], [number, number]]> = [
      ['Rectangle', [200, 200], [340, 300]],
      ['Ellipse', [380, 200], [520, 300]],
      ['Star', [560, 200], [700, 300]],
      ['Line', [200, 360], [700, 420]],
    ]
    for (const [name, from, to] of tools) {
      await page.getByRole('button', { name, exact: true }).click()
      await dragShape(page, from, to)
      await page.keyboard.press('Enter')
    }
    await waitForOperations(page, 'shape', tools.length)

    expect(await hasLayerContent(page, layer)).toBe(true)
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)
  })
})
