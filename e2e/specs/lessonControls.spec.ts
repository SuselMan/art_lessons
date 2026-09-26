import { expect, test, type Page } from '@playwright/test'

import { createRoom, joinRoom, waitForRoomReady } from '../support/room'

/** (#493) What the owner switches on a live lesson, and the two ways out of a
 *  closed one — written before these left Room. Each goes through the button a
 *  person presses and is checked on the *other* side: a freeze is only real if
 *  the student is frozen, a reopen only if the server says the lesson is open.
 *  None of them is optimistic (the server is the only writer), so a result
 *  here is the round trip, not a local echo. */

async function openParticipants(page: Page): Promise<void> {
  // The side panel's people tab is titled after the class (#595).
  await page.getByRole('button', { name: 'Open Class' }).click()
}

const roomFrozen = (page: Page) => page.evaluate(() => window.__roomStore!.getState().roomFrozen)

async function closeLesson(page: Page, roomId: string): Promise<void> {
  const status = await page.evaluate(async id => (await fetch(`/api/rooms/${id}/closed`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closed: true }),
  })).status, roomId)
  expect(status).toBe(200)
}

test.describe('the owner’s controls', () => {
  test('freezing the room freezes the student, and unfreezing lets them go', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)
      await openParticipants(page)

      await page.getByRole('button', { name: 'Freeze project' }).click()
      await expect.poll(() => roomFrozen(studentPage)).toBe(true)
      await page.getByRole('button', { name: 'Unfreeze project' }).click()
      await expect.poll(() => roomFrozen(studentPage)).toBe(false)
    } finally {
      await student.close()
    }
  })

  test('freezing one participant freezes that participant only', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId, 'Alice')
      await openParticipants(page)
      await page.getByRole('button', { name: 'More actions' }).first().click()
      await page.getByRole('menuitem', { name: /freeze/i }).first().click()

      const me = await studentPage.evaluate(() => window.__roomStore!.getState().userId)
      await expect.poll(() => studentPage.evaluate(id =>
        window.__roomStore!.getState().participants.find(p => p.userId === id)?.frozen, me)).toBe(true)
      expect(await roomFrozen(studentPage)).toBe(false)
    } finally {
      await student.close()
    }
  })
})

test.describe('a closed lesson', () => {
  test('the owner reopens it from inside the room', async ({ page }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    await closeLesson(page, roomId)
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()

    await page.getByRole('button', { name: 'Reopen' }).click()
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeHidden()
    expect(await page.evaluate(() => window.__roomStore!.getState().room?.closedAt ?? null)).toBeNull()
  })

  // The store is patched from the REST answer, not left to the broadcast: the
  // broadcast is what tells everyone *else*, and the person who pressed the
  // button may have no socket at that moment. So here the broadcast never
  // arrives, and the room must open anyway.
  test('reopening does not wait for the broadcast', async ({ page }) => {
    let dropClosedBroadcast = false
    await page.routeWebSocket(/socket\.io/, ws => {
      const server = ws.connectToServer()
      server.onMessage(message => {
        if (dropClosedBroadcast && String(message).includes('room_closed_changed')) return
        ws.send(message)
      })
    })
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    await closeLesson(page, roomId)
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()

    dropClosedBroadcast = true
    await page.getByRole('button', { name: 'Reopen' }).click()
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeHidden()
  })

  test('a student takes a copy and lands in it', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)
      await closeLesson(page, roomId)
      await studentPage.getByRole('button', { name: 'Take a copy' }).click()
      await expect.poll(() => studentPage.url()).not.toContain(roomId)
      await expect.poll(() => studentPage.url()).toMatch(/\/room\/[^/]+$/)
    } finally {
      await student.close()
    }
  })
})
