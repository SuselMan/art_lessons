import { expect, test } from '@playwright/test'

import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

test('ordinary room publishes its first preview, retries failure, updates after one stroke and copies it', async ({ page }) => {
  // Use the real guest's cookie and id; only the UI account gate needs an
  // email to show projects. Room and thumbnail APIs remain real.
  const me = await (await page.request.get('/api/me')).json() as { userId: string }
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, email: 'preview@example.test', name: 'Preview tester' } }))
  let attempts = 0
  await page.route('**/api/rooms/*/thumbnail', async route => {
    if (route.request().method() === 'POST' && ++attempts === 1) {
      await route.fulfill({ status: 500, json: { error: 'temporary_failure' } })
    } else await route.continue()
  })
  const id = await createRoom(page, 'Preview project')
  await waitForRoomReady(page)
  const thumbnail = `/api/rooms/${id}/thumbnail`
  await expect.poll(async () => (await page.request.get(thumbnail)).status()).toBe(200)
  expect(attempts).toBeGreaterThanOrEqual(2)
  const blank = await page.request.get(thumbnail)
  const initialTag = blank.headers().etag
  await drawStroke(page, [[300, 300], [500, 300]])
  await waitForOperations(page, 'stroke', 1)
  await expect.poll(async () => (await page.request.get(thumbnail)).headers().etag).not.toBe(initialTag)
  const painted = await (await page.request.get(thumbnail)).body()
  expect(painted.equals(await blank.body())).toBe(false)

  const forkResponse = await page.request.post(`/api/rooms/${id}/fork`, { data: { scope: 'lesson' } })
  expect(forkResponse.ok()).toBe(true)
  const fork = await forkResponse.json() as { room: { id: string; thumbnailUpdatedAt?: string } }
  expect(fork.room.thumbnailUpdatedAt).toBeTruthy()
  const copied = await page.request.get(`/api/rooms/${fork.room.id}/thumbnail`)
  expect(copied.status()).toBe(200)
  expect((await copied.body()).equals(painted)).toBe(true)
  await page.goto('/my-lessons')
  const card = page.locator(`a[href="/room/${fork.room.id}"]`)
  await expect(card.locator('img')).toBeVisible()
  await expect.poll(() => card.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})
