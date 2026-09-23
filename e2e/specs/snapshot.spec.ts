import { expect, test } from '@playwright/test'

import {
  activeLayerId, createRoom, drawStroke, INK, joinRoom, maxDarknessOverContent,
  operations, waitForOperations, waitForRoomReady,
} from '../support/room'

/** (#491) The fast-rejoin path — the one a long lesson actually uses.
 *
 *  Every hundredth operation, a client bakes the room's layers into an image
 *  and uploads it (#149 epic, SNAPSHOT_SEQ_INTERVAL). After that, joining does
 *  not replay the whole history: the server withholds the operations the
 *  stored pixels already account for, and the joiner restores those pixels
 *  directly. It is the difference between a two-hour lesson opening in three
 *  seconds and in thirty.
 *
 *  It is also the part of the system with the worst failure mode. #369 and
 *  #372 were both snapshots that silently *lost* a layer — the pixels were
 *  withheld as covered and the operations that would have rebuilt them were
 *  withheld too — and #474 is the same shape again. Every one of those reads
 *  as an empty canvas to the person who opens the room, and none of them can
 *  be seen without opening it.
 *
 *  Slow by the standards of the rest of this suite, because there is no
 *  shortcut: the boundary is a hundred real operations. Kept anyway. */
test.describe('rejoining a room that has a snapshot', () => {
  // A hundred strokes, a snapshot bake, an upload, and a second browser.
  test.setTimeout(240_000)

  /** Draws a room past the snapshot boundary and waits until the pixels are
   *  actually stored, so a joiner will take the restore path. Shared by both
   *  tests below — it is a hundred real gestures either way, and doing it twice
   *  in two shapes would only make the file slower to read as well as to run. */
  async function roomWithStoredSnapshot(page: Parameters<typeof createRoom>[0]): Promise<string> {
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    // Short strokes, drawn in a band, so this costs as little wall clock as a
    // hundred real gestures can. They still go through the whole pointer →
    // dab → operation path; nothing here is synthesised behind the engine's
    // back.
    for (let i = 0; i < 100; i++) {
      const y = 200 + (i % 20) * 12
      const x = 300 + Math.floor(i / 20) * 40
      await drawStroke(page, [[x, y], [x + 30, y]], { size: 24 })
    }
    await waitForOperations(page, 'stroke', 100)

    // The upload is the client's own work, deferred off the drawing path, so
    // it lands some time after the hundredth stroke rather than with it.
    //
    // Asked through the teacher's own page rather than with a bare HTTP
    // client: the index endpoint is participant-only (403 otherwise), and the
    // thing that makes this browser a participant is the identity cookie it
    // is holding. A standalone request has none, and answers 403 forever,
    // which reads exactly like a snapshot that never got stored.
    await expect.poll(async () => {
      const res = await page.request.get(`/api/rooms/${roomId}/snapshots/index`)
      // 204 is the honest "not yet" — there is no snapshot to describe.
      if (res.status() !== 200) return 0
      const body = await res.json() as { layers?: unknown[] }
      return body.layers?.length ?? 0
    }, { timeout: 120_000, message: 'a snapshot should be stored for this room' }).toBeGreaterThan(0)

    return roomId
  }

  test('the joiner restores from stored pixels instead of replaying everything', async ({ page, browser }) => {
    const roomId = await roomWithStoredSnapshot(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      await joinRoom(studentPage, roomId)
      const layer = await activeLayerId(studentPage)

      // The picture is there.
      expect(await maxDarknessOverContent(studentPage, layer)).toBeGreaterThan(INK)

      // And it did not arrive as a hundred strokes. This is the assertion that
      // distinguishes "the snapshot worked" from "the snapshot was ignored and
      // the log carried everything anyway" — which looks identical on screen
      // and is the whole point of the mechanism.
      const replayed = (await operations(studentPage)).filter(op => op.type === 'stroke').length
      expect(replayed).toBeLessThan(100)
    } finally {
      await student.close()
    }
  })

  /** (#533) The other half of the same mechanism: what the joiner is shown
   *  when those stored pixels do not arrive.
   *
   *  On 2026-09-04 the answer was "an open room with a blank canvas and no
   *  message". The server had withheld the operations the snapshot covered, so
   *  there was nothing left to replay them from, and the editor announced
   *  itself ready anyway. The teacher taught the lesson over a screen share.
   *
   *  The route is aborted rather than answered with a status, because that is
   *  the shape the incident had — transfers dying on a link busy with a video
   *  call, not a server saying no. `/snapshots/index` is deliberately left
   *  alone: the failure under test is the pixels not arriving, and a room whose
   *  index also failed would be a different (and less dangerous) story. */
  test('a joiner whose snapshot never arrives is told, not shown an empty room', async ({ page, browser }) => {
    const roomId = await roomWithStoredSnapshot(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    try {
      // Two path segments after /snapshots/ — the blobs. The index has one.
      await studentPage.route('**/api/rooms/*/snapshots/*/*', route => route.abort('failed'))

      // Not joinRoom(): that waits for the room to open, and the whole claim
      // here is that it must not.
      await studentPage.goto(`/room/${roomId}`)
      await studentPage.locator('form input[type="text"]').first().fill('Student')
      await studentPage.locator('form button[type="submit"]').click()

      const alert = studentPage.getByRole('alert')
      await expect(alert, 'the failure has to be said out loud').toBeVisible({ timeout: 60_000 })
      // The canvas stays gated: an editor that accepts strokes is a claim that
      // what it is showing is the room.
      await expect(studentPage.locator('canvas').first()).toHaveCSS('pointer-events', 'none')

      // And the one thing offered has to actually work.
      await studentPage.unroute('**/api/rooms/*/snapshots/*/*')
      await alert.getByRole('button').click()

      await waitForRoomReady(studentPage)
      const layer = await activeLayerId(studentPage)
      expect(await maxDarknessOverContent(studentPage, layer)).toBeGreaterThan(INK)
    } finally {
      await student.close()
    }
  })
})
