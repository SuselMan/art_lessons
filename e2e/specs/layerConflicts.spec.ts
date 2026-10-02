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
