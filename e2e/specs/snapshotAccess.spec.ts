import { expect, test } from '@playwright/test'
import { createRoom, joinRoom, waitForRoomReady } from '../support/room'
import { interruptTransport } from '../support/network'

test('snapshot HTTP access survives socket disconnect and is revoked by a password change', async ({ page, browser }) => {
  const roomId = await createRoom(page, 'Snapshot access', { password: 'first-password' })
  await waitForRoomReady(page)
  const student = await browser.newContext()
  const stranger = await browser.newContext()
  try {
    const studentPage = await student.newPage()
    const transport = await interruptTransport(studentPage)
    const endpoint = `/api/rooms/${roomId}/snapshots/index`
    expect((await stranger.request.get(new URL(endpoint, page.url()).href)).status()).toBe(403)
    await joinRoom(studentPage, roomId, 'Student', 'first-password')
    expect((await studentPage.request.get(endpoint)).status()).toBe(204)
    await studentPage.route('**/socket.io/**', route => route.abort())
    await transport.cut()
    // Wait for the actual server-side disconnect, without disabling HTTP.
    await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().participants.some(p => p.name === 'Student'))).toBe(false)
    expect((await studentPage.request.get(endpoint)).status()).toBe(204)
    expect((await studentPage.request.get(`/api/rooms/${roomId}/operations?beforeSeq=10`)).status()).toBe(200)
    const access = await (await page.request.get(`/api/rooms/${roomId}/access`)).json()
    const studentId = access.participants.find((p: { name: string }) => p.name === 'Student').userId
    expect((await page.request.post(`/api/rooms/${roomId}/kick`, { data: { userId: studentId } })).status()).toBe(200)
    expect((await studentPage.request.get(endpoint)).status()).toBe(403)
    expect((await page.request.delete(`/api/rooms/${roomId}/blocks/${studentId}`)).status()).toBe(200)
    expect((await studentPage.request.get(endpoint)).status()).toBe(204)
    expect((await page.request.patch(`/api/rooms/${roomId}/access`, { data: { password: 'new-password' } })).status()).toBe(200)
    expect((await studentPage.request.get(endpoint)).status()).toBe(403)
    expect((await page.request.get(endpoint)).status()).toBe(204)
  } finally {
    await student.close()
    await stranger.close()
  }
})
