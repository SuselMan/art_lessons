import { expect, test, type Page, type Route } from '@playwright/test'

import type { Room } from '../../packages/shared/src'
import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

const source: Room = {
  id: 'ui-source', name: 'Drawing with a long project title', paper: 'fine',
  infinite: false, canvasWidth: 800, canvasHeight: 600,
  hasPassword: false, accessMode: 'anyone_with_link', ownerId: 'ui-owner',
  createdAt: '2026-10-06T12:00:00Z',
}

async function projects(page: Page): Promise<void> {
  await page.route('**/api/me', route => route.fulfill({ json: { userId: source.ownerId, email: 'ui@example.test', name: 'UI tester' } }))
  await page.route('**/api/rooms', route => route.fulfill({ json: { folders: [], rooms: [source, { ...source, id: 'ui-second', name: 'Second project' }] } }))
  await page.route('**/api/rooms/search?*', route => route.fulfill({ json: { rooms: [source] } }))
  await page.goto('/my-lessons')
  await expect(page.getByRole('link', { name: new RegExp(source.name) })).toBeVisible()
}

async function menu(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: 'More actions', exact: true }).first().click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}

function holdFork(page: Page): { request: Promise<Route>; } {
  let receive!: (route: Route) => void
  const request = new Promise<Route>(resolve => { receive = resolve })
  void page.route('**/api/rooms/ui-source/fork', route => receive(route))
  return { request }
}

test('phone grid, compact new-project button and modal deletion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await projects(page)
  const cards = page.locator('a[href^="/room/"]')
  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first && second && Math.abs(first.y - second.y) < 1 && second.x > first.x).toBeTruthy()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const create = page.getByRole('link', { name: 'New project', exact: true })
  await expect(create).toBeVisible()
  await expect(create).toBeInViewport()
  await expect(create.locator('span').last()).toBeHidden()
  let deletes = 0
  await page.route('**/api/rooms/ui-source', route => { deletes++; return route.fulfill({ json: { ok: true } }) })
  await menu(page, 'Delete')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Delete permanently for everyone')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: 'temp/qa-ui/delete-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(deletes).toBe(0)
  await menu(page, 'Delete')
  await dialog.getByRole('button', { name: 'Yes, delete', exact: true }).click()
  await expect.poll(() => deletes).toBe(1)
  await expect(page.getByRole('link', { name: new RegExp(source.name) })).toHaveCount(0)
})

test('copy immediately appears disabled, scrolls into view, then becomes a project', async ({ page }) => {
  await projects(page)
  const held = holdFork(page)
  await menu(page, 'Make a copy')
  const pending = page.locator('[aria-busy="true"][aria-disabled="true"]')
  await expect(pending).toContainText('Preparing room')
  await expect(pending.locator('a,button')).toHaveCount(0)
  await expect(pending).toBeInViewport()
  await page.screenshot({ path: 'temp/qa-ui/copy-pending.png' })
  await (await held.request).fulfill({ json: { room: { ...source, id: 'ui-copy', name: `${source.name} — copy` } } })
  await expect(pending).toHaveCount(0)
  await expect(page.locator('a[href="/room/ui-copy"]')).toBeVisible()
})

test('failed copy removes its preparing card in list view and permits retry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('al_lessons_view', 'list'))
  await projects(page)
  const held = holdFork(page)
  await menu(page, 'Make a copy')
  await expect(page.locator('[aria-disabled="true"][aria-busy="true"]')).toBeVisible()
  await (await held.request).fulfill({ status: 500, json: { error: 'test failure' } })
  await expect(page.locator('[aria-disabled="true"][aria-busy="true"]')).toHaveCount(0)
  await expect(page.getByText('Could not copy the project', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(source.name) })).toBeVisible()
  await page.unroute('**/api/rooms/ui-source/fork')
  const retry = holdFork(page)
  await menu(page, 'Make a copy')
  await expect(page.locator('[aria-disabled="true"][aria-busy="true"]')).toBeVisible()
  await (await retry.request).fulfill({ status: 500, json: { error: 'test failure' } })
  await expect(page.locator('[aria-disabled="true"][aria-busy="true"]')).toHaveCount(0)
})

test('copy progress remains visible in search results', async ({ page }) => {
  await projects(page)
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('Drawing')
  await expect(page.locator('a[href="/room/ui-second"]')).toHaveCount(0)
  const held = holdFork(page)
  await menu(page, 'Make a copy')
  await expect(page.locator('[aria-disabled="true"][aria-busy="true"]')).toBeInViewport()
  await (await held.request).fulfill({ json: { room: { ...source, id: 'ui-copy', name: `${source.name} — copy` } } })
  await expect(page.locator('a[href="/room/ui-copy"]')).toBeVisible()
})

test('copy-and-open failure clears the full-screen loader and allows another action', async ({ page }) => {
  await projects(page)
  const held = holdFork(page)
  await menu(page, 'Make a copy and open')
  await expect(page.getByText('Tracing the layers...', { exact: true })).toBeVisible()
  await (await held.request).fulfill({ status: 500, json: { error: 'test failure' } })
  await expect(page.getByText('Tracing the layers...', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Could not copy the project', { exact: true })).toBeVisible()
  await menu(page, 'Delete')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('copy and open keeps the loader through the request and enters the new room', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ json: { userId: source.ownerId, email: 'ui@example.test', name: 'UI tester' } }))
  const target = await createRoom(page, 'Copy destination')
  await waitForRoomReady(page)
  await drawStroke(page, [[300, 300], [500, 300]])
  await waitForOperations(page, 'stroke', 1)
  await projects(page)
  const held = holdFork(page)
  await menu(page, 'Make a copy and open')
  await expect(page.getByText('Tracing the layers...', { exact: true })).toBeVisible()
  await expect(page.locator('[aria-busy="true"][aria-disabled="true"]')).toHaveCount(0)
  await page.screenshot({ path: 'temp/qa-ui/copy-and-open.png' })
  const request = await held.request
  const response = await request.fetch({ url: new URL(`/api/rooms/${target}/fork`, page.url()).href })
  expect(response.status()).toBe(201)
  const { room }: { room: Room } = await response.json()
  expect(room.id).not.toBe(target)
  await request.fulfill({ response })
  await page.waitForURL(`/room/${room.id}`)
  await waitForRoomReady(page)
  await waitForOperations(page, 'stroke', 1)
})
