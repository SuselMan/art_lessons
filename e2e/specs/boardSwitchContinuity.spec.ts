import { expect, test, type Page } from '@playwright/test'
import { createRoom, drawStroke, waitForRoomReady, waitForOperations } from '../support/room'

declare global { interface Window { __boardSwitchPreviousEngine?: Window['__engine']; __finishPaperLoading?: () => void } }
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

test('loading overlay covers the viewport and reports paper progress', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const reactPath = '/node_modules/.vite/deps/react.js'
    const domPath = '/node_modules/.vite/deps/react-dom_client.js'
    const overlayPath = '/src/pages/Room/status/RoomLoadingOverlay.tsx'
    const { default: React } = await import(/* @vite-ignore */ reactPath) as { default: typeof import('react') }
    const { default: { createRoot } } = await import(/* @vite-ignore */ domPath) as { default: typeof import('react-dom/client') }
    const { RoomLoadingOverlay } = await import(/* @vite-ignore */ overlayPath) as typeof import('../../apps/web/src/pages/Room/status/RoomLoadingOverlay')
    const container = document.createElement('div')
    container.id = 'loading-overlay-test'
    document.body.append(container)
    const root = createRoot(container)
    const render = (done: boolean) => root.render(React.createElement(RoomLoadingOverlay, {
      fullscreen: true,
      paper: { type: 'fine', loaded: 1024 * 1024, total: 2 * 1024 * 1024, done },
    }))
    window.__finishPaperLoading = () => render(true)
    render(false)
  })
  const overlay = page.locator('#loading-overlay-test > div')
  await expect(overlay).toBeVisible()
  await expect(overlay.locator('picture')).toBeVisible()
  await expect(overlay.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  await expect(overlay).toContainText('1.0 / 2.0 MB')
  const dimensions = await overlay.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      background: getComputedStyle(element).backgroundColor }
  })
  expect(dimensions).toMatchObject({ x: 0, y: 0, width: dimensions.viewportWidth, height: dimensions.viewportHeight })
  expect(dimensions.background).not.toBe('rgba(0, 0, 0, 0)')
  await page.evaluate(() => window.__finishPaperLoading!())
  await expect(overlay.getByRole('progressbar')).toHaveCount(0)
  await expect(overlay.locator('picture')).toBeVisible()
})
