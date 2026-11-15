import { execFileSync, spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'
import type { Operation } from '../../packages/shared/src'
import { createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'
import { DB_CONTAINER, DB_NAME, DB_USER } from '../support/stack'

test('a waiting newcomer survives the last owner leaving during snapshot preparation', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const guest = await context.newPage()
  for (const tab of [page, guest]) {
    tab.on('pageerror', error => errors.push(error.message))
    tab.on('console', message => {
      if (message.type() !== 'error') return
      const expected = /\/thumbnail$/.test(message.location().url) && /status of (403|429)/.test(message.text())
      if (expected) test.info().annotations.push({ type: 'expected-thumbnail-refusal', description: message.text() })
      else errors.push(`${message.location().url}: ${message.text()}`)
    })
  }
  const room = await createRoom(page)
  await waitForRoomReady(page)
  await expect.poll(async () => (await page.request.get(`/api/rooms/${room}/access`)).status()).toBe(200)
  const command = ['exec', '-i', DB_CONTAINER, 'psql', '-X', '-qAt', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']
  const lock = spawn('docker', command, { stdio: ['pipe', 'pipe', 'pipe'] })
  console.log('QA PostgreSQL lock:', JSON.stringify({ pid: lock.pid, command, owner: '784-release-residency', expiresAt: Date.now() + 180_000 }))
  const closed = new Promise<void>((resolve, reject) => {
    lock.once('error', reject)
    lock.once('close', code => code === 0 ? resolve() : reject(new Error(`psql exited ${code}`)))
  })
  const locked = new Promise<void>((resolve, reject) => {
    lock.stdout.on('data', chunk => { if (String(chunk).includes('locked784')) resolve() })
    lock.once('error', reject)
  })
  let released = false
  const releaseLock = async () => {
    if (released) return
    released = true
    lock.stdin.end('COMMIT;\n\\q\n')
    await closed
  }
  lock.stdin.write('BEGIN;\nLOCK TABLE "RoomLayerState" IN ACCESS EXCLUSIVE MODE;\n\\echo locked784\n')
  try {
    await locked
    const joining = joinRoom(guest, room, 'Waiting newcomer').then(() => ({ ok: true, error: '' }), error => ({ ok: false, error: String(error) }))
    // Observe the actual API query waiting on our lock, rather than guessing
    // when the join reaches snapshot preparation with a fixed timeout.
    await expect.poll(() => Number(execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-X', '-qAt', '-U', DB_USER, '-d', DB_NAME, '-c',
      `SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%RoomLayerState%'`], { encoding: 'utf8' }).trim())).toBeGreaterThan(0)
    await page.close()
    const residency = async () => {
      const response = await guest.request.get('/api/health')
      expect(response.status()).toBe(200)
      return (await response.json() as { rooms: { resident: number; idle: number } }).rooms
    }
    // Either eviction (old code) or an idle retained record (fixed code)
    // proves the owner's disconnect has actually reached the server.
    await expect.poll(async () => { const state = await residency(); return state.resident === 0 || state.idle === 1 }).toBe(true)
    expect(await residency()).toMatchObject({ resident: 1, idle: 1 })
    await releaseLock()
    expect(await joining).toEqual({ ok: true, error: '' })
    await drawStroke(guest, [[500, 250], [580, 280]])
    await waitForOperations(guest, 'stroke')
    await expect(guest.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
    const stroke = (await operations(guest)).find(op => op.type === 'stroke')!
    await expect.poll(async () => {
      const response = await guest.request.get(`/api/rooms/${room}/operations?beforeSeq=10000&limit=500`)
      expect(response.status()).toBe(200)
      return (await response.json() as Operation[]).some(op => op.id === stroke.id)
    }).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await releaseLock()
    await context.close()
  }
})
