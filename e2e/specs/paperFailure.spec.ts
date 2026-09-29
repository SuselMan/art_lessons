import { expect, test } from '@playwright/test'

import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'
import { slow } from '../support/pace'

/** (#346, #493) The paper texture failing to load, and the retry. Written
 *  when the wait and the retry moved out of Room into usePaperReadiness.
 *
 *  Nothing in the suite had seen this screen on purpose — support/database.ts
 *  only mentions it as what every room turns into when the textures are not
 *  baked. Here the bytes are refused at the network, so the room opens onto
 *  the failure; then the network comes back and "Try again" has to bring the
 *  room up without a reload. */
test('a paper that fails to load keeps the room closed, and Try again opens it', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })
  // Only the baked textures under /paper/ — not every URL with a `paper` segment: in dev,
  // Vite serves the engine's own source from /src/engine/src/paper/, and blocking that
  // leaves a blank page instead of the failure screen this spec is about (#647).
  const isPaperAsset = (url: URL): boolean => url.pathname.startsWith('/paper/')
  await page.route(isPaperAsset, route => route.abort())

  await createRoom(page)
  await expect(page.getByText("The paper didn't load")).toBeVisible({ timeout: slow(20_000) })
  // Closed: the canvas does not take input while the paper is missing.
  expect(await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    return canvas ? getComputedStyle(canvas).pointerEvents : null
  })).toBe('none')

  await page.unroute(isPaperAsset)
  await page.getByRole('button', { name: 'Try again' }).click()

  await waitForRoomReady(page)
  await expect(page.getByText("The paper didn't load")).toHaveCount(0)
  // And it really is open: a stroke lands.
  await drawStroke(page, [[500, 400], [700, 420]])
  await waitForOperations(page, 'stroke', 1)
})
