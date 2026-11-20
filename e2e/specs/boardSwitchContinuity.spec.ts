import { expect, test, type Page } from '@playwright/test'
import { createRoom, drawStroke, waitForRoomReady, waitForOperations } from '../support/room'

declare global { interface Window { __boardSwitchPreviousEngine?: Window['__engine'] } }
async function imageHash(page: Page) {
  return page.evaluate(async () => {
    const image = await window.__engine!.exportPNG()
    if (!image) throw new Error('Missing board export')
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await image.arrayBuffer()))
    return Array.from(hash, value => value.toString(16).padStart(2, '0')).join('')
  })
}

test('page turns retain one connection, board pixels and restored history', async ({ page }, info) => {
  test.setTimeout(240_000)
  let connections = 0
  const errors: string[] = []
  page.on('websocket', socket => { if (socket.url().includes('/socket.io/')) connections++ })
  page.on('pageerror', error => errors.push(error.message))
  const first = await createRoom(page); await waitForRoomReady(page)
  await drawStroke(page, [[340, 300], [440, 350], [540, 310]])
  await waitForOperations(page, 'stroke', 1)
  const firstHash = await imageHash(page)
  const response = await page.request.post(`/api/rooms/${first}/boards`, { data: { name: 'Continuity second board' } })
  expect(response.status()).toBe(201)
  const second = (await response.json() as { id: string }).id
  const toggle = page.getByRole('button', { name: 'Boards', exact: true })
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
  const tiles = page.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]')
  await expect(tiles).toHaveCount(2)
  const measurements: { target: string; ms: number; connections: number }[] = []
  const turn = async (index: number, target: string) => {
    await page.evaluate(() => { window.__boardSwitchPreviousEngine = window.__engine })
    const started = performance.now()
    await tiles.nth(index).click()
    await page.waitForFunction(id => {
      const canvas = document.querySelector('canvas')
      return window.__roomStore!.getState().boardId === id && window.__engine && window.__engine !== window.__boardSwitchPreviousEngine
        && canvas && getComputedStyle(canvas).pointerEvents !== 'none'
    }, target)
    await waitForRoomReady(page)
    measurements.push({ target, ms: Math.round(performance.now() - started), connections })
  }
  const initialConnections = connections
  await turn(1, second)
  await drawStroke(page, [[400, 450], [500, 490], [600, 450]])
  await waitForOperations(page, 'stroke', 1)
  const secondHash = await imageHash(page)
  for (const [index, target, hash] of [[0, first, firstHash], [1, second, secondHash], [0, first, firstHash], [1, second, secondHash], [0, first, firstHash]] as const) {
    await turn(index, target)
    await waitForOperations(page, 'stroke', 1)
    expect(await imageHash(page)).toBe(hash)
  }
  // A write and its acknowledgement still use the retained lesson connection.
  await drawStroke(page, [[500, 500], [600, 550]])
  await waitForOperations(page, 'stroke', 2)
  const changed = await imageHash(page)
  expect(changed).not.toBe(firstHash)
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await expect.poll(() => imageHash(page)).toBe(firstHash)
  await page.getByRole('button', { name: 'Redo', exact: true }).first().click()
  await expect.poll(() => imageHash(page)).toBe(changed)
  const result = { baseline: process.env.QA_BOARD_BASELINE === '1', initialConnections, connections, measurements, errors }
  console.log('QA850', JSON.stringify(result))
  await info.attach('board-switch-measurements', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
  if (process.env.QA_BOARD_BASELINE !== '1') expect(connections).toBe(initialConnections)
})

test('loading overview follows its target, falls back on image failure', async ({ page }, info) => {
  await page.goto('/')
  await page.route('**/api/rooms/preview-*/thumbnail?*', route => route.request().url().includes('preview-broken')
    ? route.fulfill({ status: 404 })
    : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#faf8f0"/><path d="M80 280 Q320 30 560 280" fill="none" stroke="#b8473f" stroke-width="24"/></svg>' }))
  await page.evaluate(async () => {
    const reactPath = '/node_modules/.vite/deps/react.js'
    const domPath = '/node_modules/.vite/deps/react-dom_client.js'
    const overlayPath = '/src/pages/Room/status/RoomLoadingOverlay.tsx'
    const storePath = '/src/stores/roomStore.ts'
    const { default: React } = await import(/* @vite-ignore */ reactPath) as { default: typeof import('react') }
    const { default: { createRoot } } = await import(/* @vite-ignore */ domPath) as { default: typeof import('react-dom/client') }
    const { RoomLoadingOverlay } = await import(/* @vite-ignore */ overlayPath) as typeof import('../../apps/web/src/pages/Room/status/RoomLoadingOverlay')
    const { useRoomStore } = await import(/* @vite-ignore */ storePath) as typeof import('../../apps/web/src/stores/roomStore')
    window.__roomStore = useRoomStore
    const root = document.createElement('div')
    root.style.cssText = 'position:fixed;inset:0;z-index:1000'
    document.body.append(root)
    useRoomStore.setState({ boardId: 'preview-first', boards: [
      { id: 'preview-first', thumbnailUpdatedAt: '2026-11-20T18:00:00Z' },
      { id: 'preview-broken', thumbnailUpdatedAt: '2026-11-20T18:00:00Z' },
    ] as ReturnType<typeof useRoomStore.getState>['boards'] })
    createRoot(root).render(React.createElement(RoomLoadingOverlay))
  })
  const overview = page.locator('img[src*="/api/rooms/preview-"]')
  await expect(overview).toBeVisible()
  await info.attach('target-board-loading-overview', { body: await page.screenshot({ path: process.env.QA_BOARD_PREVIEW_SCREENSHOT }), contentType: 'image/png' })
  await page.evaluate(() => window.__roomStore!.setState({ boardId: 'preview-broken' }))
  await expect(overview).toHaveAttribute('src', /preview-broken/)
  await expect(overview).toBeHidden()
  await page.evaluate(() => window.__roomStore!.setState({ boardId: 'without-thumbnail' }))
  await expect(overview).toHaveCount(0)
})
