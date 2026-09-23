import { expect, test, type Page } from '@playwright/test'

import { createRoom, waitForRoomReady } from '../support/room'

/** The rail's one drawing button. Read by accessible name, so the locale is
 *  pinned below the way the floating panel's spec pins it. */
const GROUP = 'aside button[aria-label="Drawing tool"]'
const LIST = '[role="listbox"]'

async function englishRoom(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('al_locale', 'en'))
}

/** Press and hold past useLongPress's 500 ms without moving — the gesture that
 *  opens the chooser from anywhere, including when the button is not the
 *  selected tool. Movement past the hook's tolerance cancels it. */
async function holdGroup(page: Page): Promise<void> {
  const box = await page.locator(GROUP).boundingBox()
  if (!box) throw new Error('e2e: the rail has no drawing-tool button')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
}

/** (#544) Every drawing material behind one rail button.
 *
 *  A real browser is the only place this can be checked. Its whole subject is
 *  a sequence of live pointer events and a timer — a tap, a *second* tap on
 *  the same button, and a half-second hold — plus the thing the hold must not
 *  also do: fire the button's own click and quietly change the tool underneath
 *  the list it just opened.
 */
test.describe('the drawing-tool group (#544)', () => {
  test('one button stands for every material, and says which one is in hand', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    // The seven materials are gone from the rail as buttons of their own. The
    // eraser and the smudge are not: they work on marks already down and stay
    // where they were.
    await expect(page.locator('aside button[aria-label="Charcoal"]')).toHaveCount(0)
    await expect(page.locator('aside button[aria-label="Marker"]')).toHaveCount(0)
    await expect(page.locator('aside button[aria-label="Eraser  E"]')).toHaveCount(1)
    await expect(page.locator('aside button[aria-label="Smudge"]')).toHaveCount(1)

    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(GROUP)).toHaveAttribute('title', /^Pencil/)
  })

  test('a second tap opens the chooser; the first one only selects', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    // Away to a tool that is not a material, so the next tap on the group is a
    // first tap rather than a second one.
    await page.locator('aside button[aria-label="Ruler"]').click()
    await page.locator(GROUP).click()
    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'true')
    // This is the assertion the whole ordering exists for: picking your
    // material back up out of the ruler must not put a list on screen.
    await expect(page.locator(LIST)).toHaveCount(0)

    await page.locator(GROUP).click()
    await expect(page.locator(LIST)).toBeVisible()
  })

  test('choosing a material takes it, and the button then wears it', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await page.locator(GROUP).click()
    await page.locator(`${LIST} [role="option"]`, { hasText: 'Marker' }).click()

    await expect(page.locator(LIST)).toHaveCount(0)
    await expect(page.locator(GROUP)).toHaveAttribute('title', /^Marker/)
    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'true')
    // The quick column follows the selection — proof the tool actually changed
    // rather than only the button's label. The nib picker is the marker's own
    // field, and its angle dial is a control no other material has.
    await expect(page.locator('aside').nth(1).locator('[aria-label="Nib"]')).toBeVisible()
    await expect(page.locator('aside').nth(1)).toContainText('Angle')
  })

  test('a hold opens the chooser without changing the tool under it', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    await page.locator('aside button[aria-label="Ruler"]').click()
    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'false')

    await holdGroup(page)
    await expect(page.locator(LIST)).toBeVisible()
    // The release at the end of a hold must not land as a tap as well — that
    // would select the material behind the list the hold just opened, which is
    // exactly the trap useLongPress's click suppression exists for.
    await expect(page.locator(GROUP)).toHaveAttribute('aria-pressed', 'false')
  })

  // (#525/#541) The shapes are the second group, and the one that works
  // differently underneath: its four options are values of one tool's `kind`
  // setting rather than four tools. The gesture is deliberately identical
  // anyway — a rail button with a corner mark behaves one way or the
  // difference is the user's problem, not the code's.
  test('the shape button is the same group, over a setting instead of a tool', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page)
    await waitForRoomReady(page)

    const shape = page.locator('aside button[aria-label="Shape"]')
    await shape.click()
    await expect(shape).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(LIST)).toHaveCount(0)

    await shape.click()
    await expect(page.locator(LIST)).toBeVisible()
    await page.locator(`${LIST} [role="option"]`, { hasText: 'Star' }).click()
    await expect(page.locator(LIST)).toHaveCount(0)

    // Choosing a shape also takes the tool, and the star's own settings are
    // what proves the kind actually changed rather than only the icon.
    await expect(shape).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('aside').nth(1)).toContainText('Points')
    // (#544) And the kind is gone from the quick column — it lives on the
    // button now, and one value with two homes is what this removed.
    await expect(page.locator('aside').nth(1)).not.toContainText('Rectangle')
  })

  test('a room offering one material has nothing to choose, so it offers no chooser', async ({ page }) => {
    await englishRoom(page)
    await createRoom(page, 'E2E one material')
    await waitForRoomReady(page)

    // Straight through the room's own toolset (#548) rather than the settings
    // UI: what is under test is the rail's reaction to a one-material room, not
    // the picker that produces one.
    await page.evaluate(() => {
      const store = (window as unknown as {
        __roomStore?: { setState: (patch: unknown) => void; getState: () => { room?: unknown } }
      }).__roomStore
      if (!store) throw new Error('e2e: the room store is not exposed')
      const room = store.getState().room as Record<string, unknown>
      store.setState({ room: { ...room, enabledTools: ['pencil', 'eraser'] } })
    })

    await expect(page.locator(GROUP)).toHaveAttribute('title', /^Pencil/)
    await page.locator(GROUP).click()
    await page.locator(GROUP).click()
    await expect(page.locator(LIST)).toHaveCount(0)
  })
})
