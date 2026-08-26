import { expect, test } from '@playwright/test'

import { createRoom, joinRoom, PASSWORD_INPUT, waitForRoomReady } from '../support/room'

const NAME_INPUT = 'form input[type="text"]'
const SUBMIT = 'form button[type="submit"]'

/** (#513) The join gate asks for a password only when there is one to ask for.
 *
 *  The gate cannot know that up front — nothing about a room is readable
 *  before joining it — so it finds out by trying: the first submit carries no
 *  password, and only a room that has one refuses it. Both halves are worth a
 *  browser: the passwordless case is the common one and must not gain a field,
 *  and the password case must gain it *and still let the person in*, which is
 *  a second round trip that no unit test covers.
 */
test.describe('the join gate', () => {
  test('never shows a password field for a room without one', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await studentPage.goto(`/room/${roomId}`)
      await expect(studentPage.locator(NAME_INPUT).first()).toBeVisible()
      await expect(studentPage.locator(PASSWORD_INPUT)).toHaveCount(0)

      await joinRoom(studentPage, roomId)
      // Still none after the join succeeded — the field was never the reason
      // this worked.
      await expect(studentPage.locator(PASSWORD_INPUT)).toHaveCount(0)
    } finally {
      await student.close()
    }
  })

  test('asks for a password only after a passwordless attempt is refused', async ({ page, browser }) => {
    const roomId = await createRoom(page, 'E2E locked lesson', { password: 'open-sesame' })
    await waitForRoomReady(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await studentPage.goto(`/room/${roomId}`)
      // The name field first, always: an empty page has no password field
      // either, so "there is none" only means anything once the form is up.
      await expect(studentPage.locator(NAME_INPUT).first()).toBeVisible()
      await expect(studentPage.locator(PASSWORD_INPUT)).toHaveCount(0)

      await studentPage.locator(NAME_INPUT).first().fill('Student')
      await studentPage.locator(SUBMIT).click()
      await expect(studentPage.locator(PASSWORD_INPUT)).toBeVisible()

      // A wrong one keeps them on the gate rather than letting them through.
      await studentPage.locator(PASSWORD_INPUT).fill('not-it')
      await studentPage.locator(SUBMIT).click()
      await expect(studentPage.locator(PASSWORD_INPUT)).toBeVisible()

      await studentPage.locator(PASSWORD_INPUT).fill('open-sesame')
      await studentPage.locator(SUBMIT).click()
      await waitForRoomReady(studentPage)
    } finally {
      await student.close()
    }
  })
})
