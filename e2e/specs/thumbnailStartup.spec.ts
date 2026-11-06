import { spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { createRoom, waitForRoomReady } from '../support/room'
import { DB_CONTAINER, DB_NAME, DB_USER } from '../support/stack'

/** A DB lock makes the live-create / durable-create gap deterministic. Only
 * this harness's disposable Postgres is locked; COMMIT closes it in finally. */
test('initial thumbnail waits for the queued room insert', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  let creationVisible = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (/\/thumbnail$/.test(message.location().url) && /status of 429/.test(message.text())
      || !creationVisible && /\/access$/.test(message.location().url) && /status of 404/.test(message.text())) {
      test.info().annotations.push({ type: 'expected-thumbnail-throttle', description: message.text() })
    } else errors.push(message.text())
  })
  let releaseAutomatic!: () => void
  const automatic = new Promise<void>(resolve => { releaseAutomatic = resolve })
  // Hold unrelated automatic preview requests; the APIRequestContext below
  // sends the exact competing POST directly, with the real guest cookie.
  await page.route('**/api/rooms/*/thumbnail', async route => { await automatic; await route.continue() })
  const command = ['exec', '-i', DB_CONTAINER, 'psql', '-X', '-qAt', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']
  const lock = spawn('docker', command, { stdio: ['pipe', 'pipe', 'pipe'] })
  console.log('QA PostgreSQL lock:', JSON.stringify({ pid: lock.pid, command, owner: '832-thumbnail-create-race', expiresAt: Date.now() + 180_000 }))
  const closed = new Promise<void>((resolve, reject) => {
    lock.once('error', reject)
    lock.once('close', code => code === 0 ? resolve() : reject(new Error(`psql exited ${code}`)))
  })
  const locked = new Promise<void>((resolve, reject) => {
    lock.stdout.on('data', chunk => { if (String(chunk).includes('locked832')) resolve() })
    lock.once('error', reject)
  })
  let released = false
  const releaseLock = async () => {
    if (released) return
    released = true
    lock.stdin.end('COMMIT;\n\\q\n')
    await closed
  }
  lock.stdin.write('BEGIN;\nLOCK TABLE "Room" IN SHARE MODE;\n\\echo locked832\n')
  try {
    await locked
    const room = await createRoom(page)
    await waitForRoomReady(page)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
    let completed = false
    const upload = page.request.post(`/api/rooms/${room}/thumbnail`, { data: { data: png.toString('base64') } }).then(response => { completed = true; return response })
    // The parent INSERT is still locked. A competing child insert must not
    // fail its FK or finish before the parent can exist.
    await new Promise(resolve => setTimeout(resolve, 1000))
    expect(completed).toBe(false)
    await releaseLock()
    expect((await upload).status()).toBe(200)
    creationVisible = true
    const stored = await page.request.get(`/api/rooms/${room}/thumbnail`)
    expect(stored.status()).toBe(200)
    expect(await stored.body()).toEqual(png)
    expect(errors).toEqual([])
  } finally {
    await releaseLock()
    releaseAutomatic()
    await page.unrouteAll({ behavior: 'wait' })
  }
})
