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

/** Picks up the shape tool and sets which shape it draws.
 *
 *  The tool comes from the toolbar, the kind from the store: the kind is a
 *  setting like any other (#529 — one tool, four shapes), and driving its
 *  option picker through the DOM would test the picker rather than the shape. */
async function useShape(page: import('@playwright/test').Page, kind: string): Promise<void> {
  await page.getByRole('button', { name: 'Shape', exact: true }).click()
  await page.evaluate(k => {
    const store = window.__roomStore
    if (!store) throw new Error('e2e: no room store')
    store.getState().setToolSetting('shape', 'kind', k)
  }, kind)
}

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

    await useShape(page, 'rectangle')
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

    await useShape(page, 'rectangle')
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

    await useShape(page, 'ellipse')
    await dragShape(page, [320, 260], [560, 420])
    await expect(page.locator(GIZMO)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator(GIZMO)).toBeHidden()
    expect((await operations(page)).filter(op => op.type === 'shape')).toHaveLength(0)
    // Nothing was ever written, so there is nothing on the layer either — a
    // preview that leaked into the buffer would show up right here.
    expect(await hasLayerContent(page, layer)).toBe(false)
  })

  test('the handles keep working after the pen comes up', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)

    await useShape(page, 'rectangle')
    await dragShape(page, [320, 260], [560, 400])
    const before = await page.evaluate(() => window.__roomStore?.getState().shapeFrame)
    expect(before).toBeTruthy()

    // Grab the rotate zone just outside a corner and drag: the gizmo sits above
    // the tool's own catcher, so this turns the shape instead of starting the
    // next one (#530).
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('e2e: no canvas box')
    await page.mouse.move(box.x + 560 + 22, box.y + 400 + 22)
    await page.mouse.down()
    await page.mouse.move(box.x + 520, box.y + 470)
    await page.mouse.move(box.x + 440, box.y + 500)
    await page.mouse.up()

    const after = await page.evaluate(() => window.__roomStore?.getState().shapeFrame)
    expect(after).toBeTruthy()
    expect(after!.angle).not.toBe(before!.angle)
    // Still one shape being placed, not two.
    expect((await operations(page)).filter(op => op.type === 'shape')).toHaveLength(0)
  })

  test('Shift constrains the drag to a square', async ({ page }) => {
    await createRoom(page)
    await waitForRoomReady(page)

    await useShape(page, 'rectangle')
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
    const kinds: Array<[string, [number, number], [number, number]]> = [
      ['rectangle', [200, 200], [340, 300]],
      ['ellipse', [380, 200], [520, 300]],
      ['polystar', [560, 200], [700, 300]],
      ['line', [200, 360], [700, 420]],
    ]
    for (const [kind, from, to] of kinds) {
      await useShape(page, kind)
      await dragShape(page, from, to)
      await page.keyboard.press('Enter')
    }
    await waitForOperations(page, 'shape', kinds.length)

    expect(await hasLayerContent(page, layer)).toBe(true)
    expect(await maxDarknessOverContent(page, layer)).toBeGreaterThan(INK)
  })
})
