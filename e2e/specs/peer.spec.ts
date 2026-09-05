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

  /** (#538) What a joiner is shown when the room cannot be assembled at all.
   *
   *  The last thing a join does is a run of calls that happen exactly once:
   *  resume the display, fold the log into the layer panel's state, mark the
   *  restore done, apply the participants, the palette and the frozen flag,
   *  start the history backfill. None of it was inside a `catch`, and the
   *  `finally` underneath announced the room as open regardless — so a throw
   *  on the first of those lines produced an editor with the preloader gone,
   *  the pencil live, and a layer panel still holding `makeInitialLayerState()`
   *  from before the room was known. It said nothing.
   *
   *  Sentry had been collecting exactly that since 24.08 in two flavours, both
   *  as unhandled rejections: a tile allocation refused inside `resumeDisplay`
   *  on a tablet out of graphics memory (JAVASCRIPT-D/E/G) and a `TypeError`
   *  out of the layer-state sync right after it (JAVASCRIPT-K).
   *
   *  The fault goes in through `window.__engine`, the handle dev builds already
   *  publish (`lib/devEngineHandle.ts`) — not through a hook added for the
   *  test. It patches the same object the join tail is about to call, so the
   *  throw lands at the real site rather than at a stand-in for it, and it is
   *  one-shot so the retry has something to succeed at. */
  test('is told when the room cannot be assembled, instead of getting a half-open editor', async ({ page, browser }) => {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)
    await drawStroke(page, [[320, 300], [640, 300]])
    await waitForOperations(page, 'stroke')

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await studentPage.addInitScript(() => {
        let engine: unknown
        // A setter rather than polling: the assignment happens in the same
        // synchronous block that builds the engine, well before the join tail
        // runs, and waiting for it with an interval would be a race dressed up
        // as a wait.
        Object.defineProperty(globalThis, '__engine', {
          configurable: true,
          get: () => engine,
          set(next: unknown) {
            engine = next
            if (!next) return
            const target = next as { resumeDisplay: () => void; __e2eFaulted?: boolean }
            if (target.__e2eFaulted) return
            target.__e2eFaulted = true
            const original = target.resumeDisplay.bind(target)
            let thrown = false
            target.resumeDisplay = () => {
              if (thrown) { original(); return }
              thrown = true
              throw new Error('e2e: tile allocation refused')
            }
          },
        })
      })

      // Not joinRoom(): that waits for the room to open, and the claim here is
      // that it must not.
      await studentPage.goto(`/room/${roomId}`)
      await studentPage.locator('form input[type="text"]').first().fill('Student')
      await studentPage.locator('form button[type="submit"]').click()

      const alert = studentPage.getByRole('alert')
      await expect(alert, 'a room that did not come together has to say so').toBeVisible({ timeout: 60_000 })
      // The canvas stays gated for the same reason as #533: an editor that
      // accepts strokes is a claim that what it shows is the room, and the
      // layer state behind this one is not this room's.
      await expect(studentPage.locator('canvas').first()).toHaveCSS('pointer-events', 'none')

      // And the one thing offered has to work. The fault is spent, so the
      // resync this button asks for gets all the way through.
      await alert.getByRole('button').click()

      await waitForRoomReady(studentPage)
      const layer = await activeLayerId(studentPage)
      expect(await maxDarknessOverContent(studentPage, layer)).toBeGreaterThan(INK)
    } finally {
      await student.close()
    }
  })
})
