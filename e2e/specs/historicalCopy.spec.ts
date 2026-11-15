import { expect, test, type Page } from '@playwright/test'

import { activeLayerId, createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'
import { slow } from '../support/pace'

async function duplicate(page: Page, source: string) {
  const name = await page.evaluate(id => window.__roomStore!.getState().layerState.items[id].name, source)
  const row = page.locator('div', { has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'More', exact: true }) }).last()
  await row.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await waitForOperations(page, 'layer_duplicate')
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  return (await operations(page)).find(op => op.type === 'layer_duplicate')!.layerId
}

/** Hash decoded tiles, including their positions; a null bake is empty paint. */
async function pixels(page: Page, layer: string, replay = false) {
  return page.evaluate(async ({ layer, replay }) => {
    const url = '/src/engine/snapshots.ts'
    const { decodeLayerTiles } = await import(url) as typeof import('../../apps/web/src/engine/snapshots')
    const raw = replay ? window.__engine!.bakeLayerByFullReplay(layer) : window.__engine!.bakeNetworkSnapshot(layer)
    if (!raw) return null
    const tiles = decodeLayerTiles(raw, 0).tiles
    return Promise.all(tiles.map(async tile => ({
      x: tile.originX, y: tile.originY, width: tile.width, height: tile.height,
      hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(tile.pixels))))
        .map(x => x.toString(16).padStart(2, '0')).join(''),
    })))
  }, { layer, replay })
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  return errors
}

test('another author copy keeps its pixels through original Undo, Redo and cold join', async ({ page, browser }) => {
  test.setTimeout(slow(180_000))
  const errors = watchErrors(page)
  const room = await createRoom(page)
  await waitForRoomReady(page)
  const source = await activeLayerId(page)
  await drawStroke(page, [[500, 250], [580, 280]])
  await waitForOperations(page, 'stroke')
  await expect.poll(() => pixels(page, source)).not.toBeNull()
  const context = await browser.newContext()
  try {
    const peer = await context.newPage()
    const peerErrors = watchErrors(peer)
    await joinRoom(peer, room, 'Copy author')
    const copy = await duplicate(peer, source)
    await waitForOperations(page, 'layer_duplicate')
    const expected = await pixels(peer, copy)
    expect(expected).not.toBeNull()
    await page.keyboard.press('Control+z')
    await waitForOperations(peer, 'operation_undo')
    expect(await pixels(peer, copy, true)).toEqual(expected)
    expect(await pixels(page, copy, true)).toEqual(expected)
    expect(await pixels(peer, copy)).toEqual(expected)
    await joinRoom(peer, room, 'Copy author')
    expect(await pixels(peer, copy, true)).toEqual(expected)
    expect(await pixels(peer, copy)).toEqual(expected)
    await page.keyboard.press('Control+Shift+z')
    await waitForOperations(peer, 'operation_redo')
    expect(await pixels(peer, copy, true)).toEqual(expected)
    expect(peerErrors).toEqual([])
  } finally { await context.close() }
  expect(errors).toEqual([])
})

test('old copy replay rejects a newer pinned source snapshot', async ({ page }) => {
  test.setTimeout(slow(120_000))
  const errors = watchErrors(page)
  await createRoom(page)
  await waitForRoomReady(page)
  const source = await activeLayerId(page)
  await drawStroke(page, [[500, 250], [580, 280]])
  await waitForOperations(page, 'stroke')
  await expect.poll(() => pixels(page, source)).not.toBeNull()
  const copy = await duplicate(page, source)
  const expected = await pixels(page, copy)
  expect(expected).not.toBeNull()
  await page.evaluate(id => {
    const store = window.__roomStore!
    store.setState({ layerState: { ...store.getState().layerState, activeId: id, selectedIds: [id] } })
    window.__engine!.setActiveLayer(id)
  }, source)
  await drawStroke(page, [[650, 380], [730, 410]])
  await waitForOperations(page, 'stroke', 2)
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  // Install the actual current source pixels as a network checkpoint. The
  // old copy must still read the original prefix, not this later A+B base.
  await page.evaluate(async id => {
    const url = '/src/engine/snapshots.ts'
    const { decodeLayerTiles } = await import(url) as typeof import('../../apps/web/src/engine/snapshots')
    const engine = window.__engine!
    const raw = engine.bakeNetworkSnapshot(id)
    if (!raw) throw new Error('source snapshot is empty')
    const entries = (engine as unknown as { _log: { entries: { serverSeq?: number }[] } })._log.entries
    const seq = entries.at(-1)?.serverSeq
    if (seq === undefined) throw new Error('source tail was not confirmed')
    engine.restoreLayerFromSnapshot(id, decodeLayerTiles(raw, 0).tiles, seq)
  }, source)
  expect(await pixels(page, source)).not.toEqual(expected)
  expect(await pixels(page, copy, true)).toEqual(expected)
  expect(await pixels(page, copy)).toEqual(expected)
  expect(errors).toEqual([])
})
