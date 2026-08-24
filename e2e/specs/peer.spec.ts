import { expect, test } from '@playwright/test'

import {
  activeLayerId, createRoom, drawStroke, hasLayerContent, INK, joinRoom,
  maxDarknessOverContent, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#491) Two people in one room — the reason this product exists.
 *
 *  Both halves matter and they fail differently. What a joiner sees comes out
 *  of the server's operation log, replayed into a fresh engine; what a peer
 *  sees mid-lesson comes down the live channel. A room can be perfectly good
 *  at one and broken at the other, and the manual pass that used to cover this
 *  needed two devices. */
test.describe('a second participant', () => {
  test('sees what was drawn before they arrived', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    await drawStroke(page, [[320, 300], [640, 300]])
    await waitForOperations(page, 'stroke')

    // A separate context, not a second tab: its own storage and its own
    // identity cookie, which is what makes it a different person rather than
    // the same one twice.
    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)
      await waitForOperations(studentPage, 'stroke')

      const layer = await activeLayerId(studentPage)
      expect(await hasLayerContent(studentPage, layer)).toBe(true)
      // Rebuilt from the log by this browser's own engine — the teacher's
      // pixels were never sent anywhere.
      expect(await maxDarknessOverContent(studentPage, layer)).toBeGreaterThan(INK)
    } finally {
      await student.close()
    }
  })

  test('sees a stroke drawn while they are watching', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)

      await drawStroke(page, [[320, 340], [640, 340]])
      await waitForOperations(page, 'stroke')

      // The student's own copy, arriving over the socket while they sit there.
      await waitForOperations(studentPage, 'stroke')
      const layer = await activeLayerId(studentPage)
      expect(await maxDarknessOverContent(studentPage, layer)).toBeGreaterThan(INK)
    } finally {
      await student.close()
    }
  })
})
