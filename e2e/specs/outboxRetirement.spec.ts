import { expect, test } from '@playwright/test'
import type { SendResult } from '../../packages/shared/src'
import { createRoom, drawStroke, waitForOperations, waitForRoomReady } from '../support/room'

interface RetirementFixture {
  deleteStarted: boolean
  calls: { kind: string; board: string | null; originalEngine: boolean }[]
  release: () => void
  dispose: () => void
  remaining: () => Promise<number>
}
declare global { interface Window { __retirement?: RetirementFixture } }

for (const result of [{ ok: true, seq: 999 }, { ok: false, reason: 'target_gone' }] satisfies SendResult[]) {
  test(`${result.ok ? 'ACK' : 'recovery'} stays on its board across a real IndexedDB deletion and UI page turn`, async ({ page }) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    let ready = false
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      const expected = /\/thumbnail$/.test(message.location().url) && (/status of 429/.test(message.text()) || !ready && /status of 403/.test(message.text()))
        || message.text().includes('operation rejected by server stroke qa-retirement-') && message.text().includes('target_gone')
      if (expected) test.info().annotations.push({ type: 'expected-refusal', description: message.text() })
      else errors.push(`${message.location().url}: ${message.text()}`)
    })
    // #832: startup thumbnail race: live create_room can precede its
    // queued DB insert. Keep the request real, but wait for the actual row
    // before releasing this unrelated initial upload in the queue scenario.
    let releaseCreation!: () => void
    const creation = new Promise<void>(resolve => { releaseCreation = resolve })
    await page.route('**/api/rooms/*/thumbnail', async route => { await creation; await route.continue() })
    const room = await createRoom(page)
    await waitForRoomReady(page)
    await expect.poll(async () => (await page.request.get(`/api/rooms/${room}/access`)).status()).toBe(200)
    releaseCreation(); ready = true
    await drawStroke(page, [[500, 250], [580, 280]])
    await waitForOperations(page, 'stroke')
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
    const response = await page.request.post(`/api/rooms/${room}/boards`, { data: { name: 'Next board' } })
    expect(response.status()).toBe(201)
    const next = await response.json() as { id: string }
    // Only transport verdict and the deletion barrier are controlled. Outbox,
    // verdict handler, browser IndexedDB, engine and board switch are real.
    await page.evaluate(async ({ room, result }) => {
      const queueUrl = '/src/pages/Room/net/outbox.ts', storageUrl = '/src/pages/Room/net/outboxStorage.ts', verdictUrl = '/src/pages/Room/net/outboxVerdict.ts'
      const { Outbox } = await import(queueUrl) as typeof import('../../apps/web/src/pages/Room/net/outbox')
      const { createIndexedDbOutboxStorage } = await import(storageUrl) as typeof import('../../apps/web/src/pages/Room/net/outboxStorage')
      const { createOutboxVerdicts } = await import(verdictUrl) as typeof import('../../apps/web/src/pages/Room/net/outboxVerdict')
      const original = window.__engine!
      const template = original.getOperations().find(op => op.type === 'stroke')
      if (!template || template.type !== 'stroke') throw new Error('fixture stroke missing')
      const op = { ...template, id: 'qa-retirement-' + crypto.randomUUID() }
      const storage = createIndexedDbOutboxStorage()
      let release!: () => void
      const gate = new Promise<void>(resolve => { release = resolve })
      const calls: RetirementFixture['calls'] = []
      const record = (kind: string) => calls.push({ kind, board: window.__roomStore!.getState().boardId, originalEngine: window.__engine === original })
      const qa: RetirementFixture = { deleteStarted: false, calls, release, dispose: () => queue.dispose(), remaining: async () => (await storage.getAll(room)).filter(entry => entry.op.id === op.id).length }
      const queue = new Outbox({ roomId: room, canSend: () => window.__roomStore!.getState().boardId === room,
        storage: { ...storage, delete: async id => { qa.deleteStarted = true; await gate; await storage.delete(id) } },
        send: async () => result,
        ...createOutboxVerdicts({ pendingIdsRef: { current: new Set() }, latestKnownSeqRef: { current: 0 },
          confirmOperation: (operation, seq) => { record('confirm'); window.__engine!.confirmOperation(operation.id, seq) },
          discardOperation: operation => { record('discard'); window.__engine!.discardOperation(operation.id) },
          checkSnapshotBoundary: () => record('snapshot'), resolveTransformCommit: () => {},
          scheduleLostWorkRecovery: () => record('recover'), setLostWork: () => record('lost'),
        }),
      })
      window.__retirement = qa
      await queue.enqueue(op)
    }, { room, result })
    try {
      await expect.poll(() => page.evaluate(() => window.__retirement!.deleteStarted)).toBe(true)
      const toggle = page.getByRole('button', { name: 'Boards', exact: true })
      if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
      await page.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]').filter({ hasText: 'Next board' }).click()
      await page.waitForFunction(id => window.__roomStore!.getState().boardId === id, next.id)
      await waitForRoomReady(page)
      await page.evaluate(() => { window.__retirement!.dispose(); window.__retirement!.release() })
      await expect.poll(() => page.evaluate(() => window.__retirement!.remaining())).toBe(0)
      const calls = await page.evaluate(() => window.__retirement!.calls)
      expect(calls).toEqual((result.ok ? ['confirm', 'snapshot'] : ['discard', 'recover']).map(kind => ({ kind, board: room, originalEngine: true })))
      expect(errors).toEqual([])
    } finally { await page.evaluate(() => { window.__retirement?.dispose(); window.__retirement?.release() }) }
  })
}
