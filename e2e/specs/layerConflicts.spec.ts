import { expect, test, type Page } from '@playwright/test'
import type { Operation } from '@grafetto/shared'
import { createRoom, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

type Delta = Operation extends infer O ? O extends Operation ? Omit<O, 'id' | 'timestamp' | 'userId'> : never : never
async function emit(page: Page, delta: Delta) {
  await page.evaluate(op => window.__engine!.appendOperation({ ...op, id: crypto.randomUUID(), timestamp: Date.now(), userId: window.__roomStore!.getState().userId } as Operation), delta)
}
async function tree(page: Page) {
  return page.evaluate(() => {
    const s = window.__roomStore!.getState().layerState
    return { rootOrder: s.rootOrder, items: Object.fromEntries(Object.entries(s.items).sort(([a], [b]) => a.localeCompare(b)).map(([id, item]) => [id, { ...item, collapsed: undefined, locked: undefined }])) }
  })
}

// QA-004/005: actual room transport, opposing structural deltas, and author
// undo/redo. Local selection is excluded from the shared-tree comparison.
test('opposing folder moves never create a cycle and converge after author undo/redo', { tag: '@two-browsers' }, async ({ page, browser }) => {
  test.setTimeout(120_000)
  const room = await createRoom(page, 'QA folder conflict')
  await waitForRoomReady(page)
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const lateContext = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const peer = await context.newPage()
    await joinRoom(peer, room)
    await emit(page, { type: 'folder_add', layerId: 'qa-folder-a', name: 'A' })
    await emit(page, { type: 'folder_add', layerId: 'qa-folder-b', name: 'B' })
    await emit(page, { type: 'layer_add', layerId: 'qa-child', name: 'child', parentId: 'qa-folder-a' })
    await waitForOperations(peer, 'folder_add', 2)
    await waitForOperations(peer, 'layer_add')
    await Promise.all([
      emit(page, { type: 'layer_move', layerIds: ['qa-folder-a'], parentId: 'qa-folder-b', index: 0 }),
      emit(peer, { type: 'layer_move', layerIds: ['qa-folder-b'], parentId: 'qa-folder-a', index: 0 }),
    ])
    await waitForOperations(page, 'layer_move', 2)
    await waitForOperations(peer, 'layer_move', 2)
    await expect.poll(() => tree(peer)).toEqual(await tree(page))
    const checkAcyclic = async () => {
      const state = await tree(page)
      const visit = (id: string, ancestors: Set<string>) => {
        expect(ancestors.has(id), `cycle at ${id}`).toBe(false)
        const item = state.items[id]
        if (item.kind === 'folder') for (const child of item.children) visit(child, new Set([...ancestors, id]))
      }
      for (const id of state.rootOrder) visit(id, new Set())
      const reachable = new Set<string>()
      const collect = (id: string) => { reachable.add(id); const item = state.items[id]; if (item.kind === 'folder') item.children.forEach(collect) }
      state.rootOrder.forEach(collect)
      expect([...reachable].sort()).toEqual(Object.keys(state.items).sort())
    }
    await checkAcyclic()
    await Promise.all([page.evaluate(() => window.__engine!.undo()), peer.evaluate(() => window.__engine!.undo())])
    await waitForOperations(page, 'operation_undo', 2)
    await expect.poll(() => tree(peer)).toEqual(await tree(page))
    await checkAcyclic()
    await Promise.all([page.evaluate(() => window.__engine!.redo()), peer.evaluate(() => window.__engine!.redo())])
    await waitForOperations(peer, 'operation_redo', 2)
    await expect.poll(() => tree(peer)).toEqual(await tree(page))
    await checkAcyclic()
    const late = await lateContext.newPage()
    await joinRoom(late, room, 'Folder history witness')
    await waitForOperations(late, 'operation_redo', 2)
    await expect.poll(() => tree(late)).toEqual(await tree(page))
    expect((await operations(page)).filter(o => o.type === 'layer_move')).toHaveLength(2)
  } finally {
    await context.close()
    await lateContext.close()
  }
})

for (const kind of ['rename', 'opacity', 'visibility'] as const) {
  test(`concurrent layer ${kind} follows confirmed order through undo/redo and late join`, { tag: '@two-browsers' }, async ({ page, browser }) => {
    const room = await createRoom(page, `QA concurrent ${kind}`)
    await waitForRoomReady(page)
    const peerContext = await browser.newContext({ ignoreHTTPSErrors: true })
    const lateContext = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      const peer = await peerContext.newPage()
      await joinRoom(peer, room)
      const delta = (second: boolean): Delta => kind === 'rename'
        ? { type: 'layer_rename', layerId: 'layer-1', name: second ? 'Peer name' : 'Owner name' }
        : kind === 'opacity'
          ? { type: 'layer_opacity', layerIds: ['layer-1'], opacity: second ? 0.25 : 0.75 }
          : { type: 'layer_visibility', layerIds: ['layer-1'], visible: second }
      const type = delta(false).type
      await Promise.all([emit(page, delta(false)), emit(peer, delta(true))])
      await waitForOperations(page, type, 2)
      await waitForOperations(peer, type, 2)
      const confirmed = (await operations(page)).filter(o => o.type === type)
      expect(confirmed.every(o => typeof o.seq === 'number')).toBe(true)
      const winner = confirmed.at(-1)!
      const property = kind === 'rename' ? 'name' : kind === 'opacity' ? 'opacity' : 'visible'
      const value = kind === 'rename' ? (winner as Extract<Operation, { type: 'layer_rename' }>).name
        : kind === 'opacity' ? (winner as Extract<Operation, { type: 'layer_opacity' }>).opacity
          : (winner as Extract<Operation, { type: 'layer_visibility' }>).visible
      await expect.poll(async () => (await tree(page)).items['layer-1'][property]).toBe(value)
      await expect.poll(() => tree(peer)).toEqual(await tree(page))
      const finalState = await tree(page)
      await Promise.all([page.evaluate(() => window.__engine!.undo()), peer.evaluate(() => window.__engine!.undo())])
      await waitForOperations(page, 'operation_undo', 2)
      await expect.poll(() => tree(peer)).toEqual(await tree(page))
      const original = (await tree(page)).items['layer-1']
      expect(original.name).not.toMatch(/Owner name|Peer name/)
      expect(original.opacity).toBe(1)
      expect(original.visible).toBe(true)
      await Promise.all([page.evaluate(() => window.__engine!.redo()), peer.evaluate(() => window.__engine!.redo())])
      await waitForOperations(page, 'operation_redo', 2)
      await expect.poll(() => tree(page)).toEqual(finalState)
      await expect.poll(() => tree(peer)).toEqual(finalState)
      const late = await lateContext.newPage()
      await joinRoom(late, room, 'Layer property witness')
      await waitForOperations(late, 'operation_redo', 2)
      await expect.poll(() => tree(late)).toEqual(finalState)
    } finally {
      await peerContext.close()
      await lateContext.close()
    }
  })
}
