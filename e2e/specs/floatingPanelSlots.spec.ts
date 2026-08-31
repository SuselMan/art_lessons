import { expect, test, type Page } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

const PANEL = '#floating-tool-panel'

/** The panel is normally only shown once minimal UI has hidden the chrome, and
 *  minimal UI is entered by a *touch* tap on the canvas — which Playwright
 *  cannot produce (its pointer is a mouse, see the e2e README). `always` is a
 *  real setting a user can pick, not a test-only door, and it puts the same
 *  panel with the same handlers on screen without needing that gesture.
 *
 *  The locale is pinned for the same reason it is in the sibling spec: the
 *  buttons are read by their accessible names below, and those are translated.
 *  `layout` seeds a stored layout where a scenario needs to start from one —
 *  the panel reads it at boot exactly the way it would after a reload. */
async function showFloatingPanel(page: Page, layout?: unknown): Promise<void> {
  await page.addInitScript(([stored]) => {
    localStorage.setItem('al_floating_panel', 'always')
    localStorage.setItem('al_locale', 'en')
    if (stored !== null) localStorage.setItem('al_floating_panel_layout', stored as string)
  }, [layout === undefined ? null : JSON.stringify(layout)])
}

function slot(page: Page, index: number) {
  return page.locator(`${PANEL} [data-slot="${index}"]`)
}

function choice(page: Page, key: string) {
  return page.locator(`${PANEL} [data-choice="${key}"]`)
}

/** Press and hold a slot past useLongPress's 500 ms, which is the gesture that
 *  opens that slot's chooser. Held without moving: drifting past the tolerance
 *  cancels the press and starts a drag of the panel instead, which is a
 *  different spec's subject (#516). */
async function holdSlot(page: Page, index: number): Promise<void> {
  const box = await slot(page, index).boundingBox()
  if (!box) throw new Error(`e2e: the panel has no slot ${index}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
}

function storedLayout(page: Page): Promise<unknown> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('al_floating_panel_layout') ?? 'null'))
}

/** The panel's eight slots are the user's to lay out: any slot holds any tool
 *  the left toolbar holds, undo/redo, one of the two "last used" roles, or
 *  nothing. Only a real browser can test it — the gesture that edits a slot is
 *  a half-second press, which is a sequence of live pointer events and a timer,
 *  and the thing it must NOT also do is fire the slot's own click. */
test.describe('the floating panel’s slots', () => {
  test('opens with the four-button panel it has always had, plus four empty slots', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await expect(page.locator(`${PANEL} [data-slot]`)).toHaveCount(8)
    // North and south are the two roles, resolved: a new room starts on the
    // pencil, and the eraser is the remembered secondary.
    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Pencil')
    await expect(slot(page, 4)).toHaveAttribute('aria-label', 'Eraser')
    await expect(slot(page, 2)).toHaveAttribute('aria-label', 'Redo')
    await expect(slot(page, 6)).toHaveAttribute('aria-label', 'Undo')
    for (const i of [1, 3, 5, 7]) {
      await expect(slot(page, i)).toHaveAttribute('aria-label', 'Empty slot')
    }
  })

  test('holding an empty slot offers every tool, both roles, undo/redo and “leave empty”', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await holdSlot(page, 1)
    // 15 tools + 2 roles + undo/redo + clear.
    await expect(page.locator(`${PANEL} [data-choice]`)).toHaveCount(20)
    await expect(choice(page, 'tool:ruler')).toBeVisible()
    await expect(choice(page, 'role:drawing')).toBeVisible()
    await expect(choice(page, 'action:undo')).toBeVisible()
    // The chooser marks what the held slot already holds — for an empty slot
    // that is "leave empty".
    await expect(choice(page, 'clear')).toHaveAttribute('aria-pressed', 'true')
  })

  test('puts the chosen tool in the slot and takes it in hand', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await holdSlot(page, 1)
    await choice(page, 'tool:ruler').click()

    await expect(slot(page, 1)).toHaveAttribute('aria-label', 'Ruler')
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('ruler')
    // And it survives as a preference, not just as React state.
    expect(await storedLayout(page)).toMatchObject({ 1: { kind: 'tool', tool: 'ruler' } })
  })

  // Assigning moves rather than copies — "put undo where my thumb is" is what
  // the gesture means, and two undos is never it.
  test('moving something to a new slot empties the one it came from', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await holdSlot(page, 7)
    await choice(page, 'action:undo').click()

    await expect(slot(page, 7)).toHaveAttribute('aria-label', 'Undo')
    await expect(slot(page, 6)).toHaveAttribute('aria-label', 'Empty slot')
  })

  test('“leave empty” takes the tool back out', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await holdSlot(page, 0)
    await choice(page, 'clear').click()

    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Empty slot')
  })

  // The reason roles exist at all: paint with something, and the panel still
  // has it, whether or not that tool was ever put in a slot by hand.
  test('a role slot follows whatever was last picked elsewhere', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Pencil')
    await page.evaluate(() => window.__roomStore!.getState().setTool('watercolor'))
    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Watercolor')

    // And tapping it is still the way back to that tool after erasing.
    await page.evaluate(() => window.__roomStore!.getState().setTool('eraser'))
    await slot(page, 0).click()
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('watercolor')
  })

  // Reported from the tablet: with the smudge pinned to a slot of its own,
  // tapping it also moved the *role* slot onto the smudge — two buttons for one
  // tool, and the eraser the role existed to remember simply gone. A role means
  // "the tool you have no button for", so it walks past anything the layout
  // already holds; see pickRoleTool.
  test('a role does not follow a tool that has a slot of its own', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await expect(slot(page, 4)).toHaveAttribute('aria-label', 'Eraser')

    await holdSlot(page, 3)
    await choice(page, 'tool:smudge').click()
    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('smudge')

    // The smudge is where it was put, and nowhere else.
    await expect(slot(page, 3)).toHaveAttribute('aria-label', 'Smudge')
    await expect(slot(page, 4)).toHaveAttribute('aria-label', 'Eraser')

    // Selecting it again from its own button changes nothing either.
    await page.evaluate(() => window.__roomStore!.getState().setTool('eraser'))
    await slot(page, 3).click()
    await expect(slot(page, 4)).toHaveAttribute('aria-label', 'Eraser')
  })

  // Pinning alone is enough — the tool need never be selected for the role to
  // step aside, so the panel never *shows* the duplicate even for a moment.
  test('a role steps aside the instant its tool is pinned elsewhere', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Pencil')
    await holdSlot(page, 1)
    await choice(page, 'tool:pencil').click()

    await expect(slot(page, 1)).toHaveAttribute('aria-label', 'Pencil')
    await expect(slot(page, 0)).not.toHaveAttribute('aria-label', 'Pencil')
  })

  test('a tap does the slot’s job without opening the chooser', async ({ page }) => {
    await showFloatingPanel(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await page.evaluate(() => window.__roomStore!.getState().setTool('marker'))
    await slot(page, 4).click()

    expect(await page.evaluate(() => window.__roomStore!.getState().tool)).toBe('eraser')
    await expect(page.locator(`${PANEL} [data-choice]`)).toHaveCount(0)
  })

  // A layout belongs to the hand, not to the drawing — unlike the panel's
  // position, which is stored per room.
  test('the layout is the same in the next room', async ({ page }) => {
    await showFloatingPanel(page, [
      { kind: 'tool', tool: 'fill' }, null, { kind: 'action', action: 'redo' }, null,
      { kind: 'role', role: 'secondary' }, null, { kind: 'action', action: 'undo' },
      { kind: 'tool', tool: 'hand' },
    ])
    await createRoom(page)
    await waitForRoomReady(page)
    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Fill')
    await expect(slot(page, 7)).toHaveAttribute('aria-label', 'Hand')

    await createRoom(page, 'E2E lesson two')
    await waitForRoomReady(page)
    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Fill')
    await expect(slot(page, 7)).toHaveAttribute('aria-label', 'Hand')
  })

  // A stored layout outlives the tool list. Anything unrecognisable has to come
  // back as an empty slot rather than as a button with no icon.
  test('a layout naming a tool that no longer exists falls back to the default', async ({ page }) => {
    await showFloatingPanel(page, [{ kind: 'tool', tool: 'airbrush' }, 1, 2])
    await createRoom(page)
    await waitForRoomReady(page)

    await expect(slot(page, 0)).toHaveAttribute('aria-label', 'Pencil')
    await expect(slot(page, 6)).toHaveAttribute('aria-label', 'Undo')
    await expect(slot(page, 1)).toHaveAttribute('aria-label', 'Empty slot')
  })
})
