import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { RoomOpenMeasurement } from '../../packages/shared/src/index'
import { createRoom, waitForRoomReady } from '../support/room'
import { DB_CONTAINER, DB_NAME, DB_USER, E2E_APP_VERSION } from '../support/stack'

function stored(attemptId: string) {
  const sql = `select row_to_json(m) from "RoomOpenMeasurement" m where "attemptId"='${attemptId}'`
  const out = execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-Atc', sql], { encoding: 'utf8' }).trim()
  return out ? JSON.parse(out) : null
}

test('saves actual room finishes and distinguishes re-entry into the same room', async ({ page }) => {
  const delivered: RoomOpenMeasurement[] = []
  page.on('request', r => { if (r.url().endsWith('/api/me/room-open')) delivered.push(r.postDataJSON()) })
  await page.bringToFront()
  const roomId = await createRoom(page, 'Open metrics')
  await waitForRoomReady(page)
  // Creating a brand-new room is not a join attempt. Time actual entries
  // through the same gate used when opening a homework link.
  await page.reload()
  await page.locator('form button[type="submit"]').click()
  await expect.poll(() => delivered.filter(m => m.report.outcome === 'ready').length).toBe(1)
  const first = delivered.find(m => m.report.outcome === 'ready')!
  await expect.poll(() => stored(first.attemptId)?.outcome).toBe('ready')
  expect(stored(first.attemptId)).toMatchObject({ roomId, totalMs: first.report.totalMs,
    appVersion: E2E_APP_VERSION, deviceType: 'desktop', wasHidden: false })
  await page.reload()
  const submit = page.locator('form button[type="submit"]')
  await expect(submit).toBeVisible()
  await submit.click()
  await expect.poll(() => delivered.filter(m => m.report.outcome === 'ready').length).toBe(2)
  const second = delivered.filter(m => m.report.outcome === 'ready')[1]
  expect(second.attemptId).not.toBe(first.attemptId)
  await expect.poll(() => stored(second.attemptId)?.outcome).toBe('ready')
})

test('a real slow entry saves both the alarm and its eventual finish', async ({ page, browser }) => {
  const roomId = await createRoom(page, 'Delayed open metrics')
  await waitForRoomReady(page)
  const peer = await browser.newPage()
  const delivered: RoomOpenMeasurement[] = []
  try {
    await peer.route('**/paper/*.paper', async route => {
      await new Promise(resolve => setTimeout(resolve, 13_000))
      await route.continue()
    })
    peer.on('request', r => { if (r.url().endsWith('/api/me/room-open')) delivered.push(r.postDataJSON()) })
    await peer.goto(new URL(`/room/${roomId}`, page.url()).href)
    await peer.bringToFront()
    await peer.locator('form button[type="submit"]').click()
    await expect.poll(() => delivered.some(m => m.report.outcome === 'stalled')).toBe(true)
    await expect.poll(() => delivered.some(m => m.report.outcome === 'ready')).toBe(true)
    const alarm = delivered.find(m => m.report.outcome === 'stalled')!
    const finish = delivered.find(m => m.report.outcome === 'ready')!
    expect(finish.attemptId).toBe(alarm.attemptId)
    expect(finish.report.totalMs).toBeGreaterThan(alarm.report.totalMs)
    await expect.poll(() => stored(finish.attemptId)?.totalMs).toBe(finish.report.totalMs)
    expect(stored(finish.attemptId).outcome).toBe('ready')
  } finally { await peer.close() }
})

test('updates delayed finishes without duplicates or downgrades and validates input', async ({ request }) => {
  await request.get('/api/me')
  const m: RoomOpenMeasurement = { attemptId: randomUUID(), roomId: 'diagnostic-room', appVersion: 'test',
    deviceType: 'tablet', wasHidden: true,
    report: { outcome: 'stalled', totalMs: 10000, stages: { join: 10000 }, reached: 'join', facts: {} } }
  expect((await request.post('/api/me/room-open', { data: m })).ok()).toBe(true)
  expect(stored(m.attemptId)).toMatchObject({ outcome: 'stalled', totalMs: 10000 })
  const finish = { ...m, report: { ...m.report, outcome: 'ready', totalMs: 25000, stages: { join: 25000 } } }
  const responses = await Promise.all([finish, m, finish, m].map(data => request.post('/api/me/room-open', { data })))
  expect(responses.every(r => r.ok())).toBe(true)
  expect(stored(m.attemptId)).toMatchObject({ outcome: 'ready', totalMs: 25000, wasHidden: true })
  expect((await request.post('/api/me/room-open', { data: { ...m, report: { ...m.report, totalMs: -1 } } })).status()).toBe(400)
})
