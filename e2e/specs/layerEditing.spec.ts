import { expect, test } from '@playwright/test'
import { activeLayerId, createRoom, waitForRoomReady, waitForOperations } from '../support/room'

test('rename selects the whole name and typing replaces it', async ({ page }) => {
  await createRoom(page)
  await waitForRoomReady(page)
  const id = await activeLayerId(page)
  const name = await page.evaluate(id => window.__roomStore!.getState().layerState.items[id].name, id)
  const row = page.locator('div', { has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'More' }) }).last()
  await row.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const input = page.locator('input').filter({ visible: true }).last()
  await expect(input).toBeFocused()
  expect(await input.evaluate(el => {
    const input = el as HTMLInputElement
    return [input.selectionStart, input.selectionEnd, input.value.length]
  })).toEqual([0, name.length, name.length])
  await page.keyboard.type('Replacement')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(id => window.__roomStore!.getState().layerState.items[id].name, id)).toBe('Replacement')
})

test('new folders group selections in stacking order and preserve selected subtrees', async ({ page }) => {
  const roomId = await createRoom(page)
  await waitForRoomReady(page)
  const lower = await activeLayerId(page)
  await page.getByRole('button', { name: 'Add layer', exact: true }).click()
  await waitForOperations(page, 'layer_add', 1)
  const upper = await activeLayerId(page)
  const select = async (ids: string[]) => {
    await page.evaluate(ids => {
      const store = window.__roomStore!
      store.setState({ layerState: { ...store.getState().layerState, selectedIds: ids } })
    }, ids)
  }
  const folders = () => page.evaluate(() => Object.values(window.__roomStore!.getState().layerState.items)
    .filter(item => item.kind === 'folder'))
  await select([lower, upper])
  await page.getByRole('button', { name: 'Add folder', exact: true }).click()
  await expect.poll(async () => (await folders()).map(f => f.children)).toEqual([[upper, lower]])
  const first = (await folders())[0].id
  expect(await activeLayerId(page)).toBe(upper)
  // Both a parent and a child are selected; the child must stay inside its
  // original folder, and the new folder must not become its own descendant.
  await select([lower, first])
  await page.getByRole('button', { name: 'Add folder', exact: true }).click()
  await expect.poll(async () => (await folders()).length).toBe(2)
  const second = (await folders()).find(f => f.id !== first)!.id
  await expect.poll(async () => (await folders()).find(f => f.id === second)!.children).toEqual([first])
  expect((await folders()).find(f => f.id === first)!.children).toEqual([upper, lower])
  await select([])
  await page.getByRole('button', { name: 'Add folder', exact: true }).click()
  await expect.poll(async () => (await folders()).filter(f => f.children.length === 0).length).toBe(1)
  const empty = (await folders()).find(f => f.children.length === 0)!.id
  await page.reload()
  await page.locator('form button[type="submit"]').click()
  await waitForRoomReady(page)
  expect(page.url()).toContain(roomId)
  await expect.poll(async () => (await folders()).find(f => f.id === second)?.children).toEqual([first])
  expect((await folders()).find(f => f.id === first)!.children).toEqual([empty, upper, lower])
})
