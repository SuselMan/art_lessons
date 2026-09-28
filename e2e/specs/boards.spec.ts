import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, drawStroke, INK, joinRoom, maxDarknessOverContent,
  maxDarknessOverRect, operations, type Rect, waitForOperations, waitForRoomReady,
} from '../support/room'
import { slow } from '../support/pace'

/** What the store says about where this client is in the lesson — the
 *  fields ADR 014 §4 puts there, read together so an assertion can quote
 *  the whole picture when it fails. */
interface BoardState {
  lessonId: string | null
  boardId: string | null
  activeBoardId: string | null
  following: boolean
  boards: Array<{ id: string; name: string }>
}

function boardState(page: Page): Promise<BoardState> {
  return page.evaluate(() => {
    const s = window.__roomStore!.getState()
    return {
      lessonId: s.lessonId, boardId: s.boardId, activeBoardId: s.activeBoardId, following: s.following,
      boards: s.boards.map(b => ({ id: b.id, name: b.name })),
    }
  })
}

/** Resolves once this client is on `boardId` *and* can draw on it.
 *
 *  Two waits, because a page turn has two halves: the store's `boardId`
 *  flips when the board's `room_state` arrives, and the canvas is gated
 *  (`pointer-events: none`) from the moment the switch is asked for until
 *  that state has been folded into a fresh engine. A stroke drawn between
 *  the two would land on nothing. */
async function waitForBoard(page: Page, boardId: string): Promise<void> {
  await page.waitForFunction(id => window.__roomStore!.getState().boardId === id, boardId, { timeout: slow(30_000) })
  await waitForRoomReady(page)
}

/** The board `name` says a participant is on, as the teacher's page sees it
 *  — `peer_board_changed` folded into the store, which is also what the
 *  strip's per-tile head count reads. */
async function waitForPeerOnBoard(page: Page, name: string, boardId: string): Promise<void> {
  await page.waitForFunction(
    ([who, id]) => window.__roomStore!.getState().participants.some(p => p.name === who && p.boardId === id),
    [name, boardId] as const,
    { timeout: slow(15_000) },
  )
}

function strokeCount(page: Page): Promise<number> {
  return operations(page).then(ops => ops.filter(op => op.type === 'stroke').length)
}

/** The strip is behind a header toggle; a second press would close it. */
async function openStrip(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Boards', exact: true })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await expect(page.getByRole('region', { name: 'Boards' })).toBeVisible()
}

/** One tile per board, in strip order. A tile is a `div[role=button]` (it
 *  holds a real button, the "⋮" menu) — see BoardStrip's own comment. */
function tiles(page: Page): Locator {
  return page.getByRole('region', { name: 'Boards' }).locator('[role="button"][aria-pressed]')
}

async function tileMenu(page: Page, index: number, item: string): Promise<void> {
  await tiles(page).nth(index).getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** The strip's chip for a student who stepped off the teacher's board. */
function teacherChip(page: Page): Locator {
  return page.getByRole('button', { name: /^Teacher is on/ })
}

/** Where a stroke drawn *below* `before` landed, read off the grown bounds.
 *
 *  Two horizontal strokes one above the other make the content bounds grow
 *  downward, and the newcomer is the bottom of the union — which is how one
 *  page reads the *other* person's stroke without being told where they
 *  drew. Only a slice as tall as the first stroke, not the whole difference:
 *  the gap between the two is empty on this board but not necessarily on
 *  another, and these rects are read on both. (Same brush, same slope, so
 *  the two strokes are the same height.) */
function strokeBelow(before: Rect, after: Rect): Rect {
  const bottom = after.y + after.height
  return { x: after.x, y: bottom - before.height, width: after.width, height: before.height }
}

async function activeContent(page: Page): Promise<Rect | null> {
  return contentBounds(page, await activeLayerId(page))
}

/** (#569, epic #176, ADR 014 §7 step 6) A lesson with two boards, a teacher
 *  turning pages and a student following them.
 *
 *  Unit tests cover the reducer, the follow rule and the socket's two
 *  channels one at a time. What only a browser can show is the promise the
 *  pieces make together: that turning a page swaps the engine for a
 *  different board's content and *nothing else* — the other board's strokes
 *  are neither lost nor shown where they do not belong, on either screen.
 *  Every "is the ink there / not there" below is a pixel read out of the
 *  live framebuffer (see support/room.ts), never an inspection of the log
 *  alone: a log that carried the right operations into the wrong engine
 *  would look fine to the log.
 *
 *  One test rather than eight, because each step is the previous one's
 *  setup — two people, two boards, and strokes whose positions the later
 *  steps read back. Steps name the claim being made. */
test.describe('boards', () => {
  test('the teacher turns pages, the student follows, and both boards keep their ink', { tag: '@two-browsers' }, async ({ page: teacher, browser }) => {
    // Eight round trips of switching boards, each a fresh engine restore, plus
    // a reload — well over the single-scenario default.
    test.setTimeout(slow(240_000))

    const lessonId = await createRoom(teacher, 'E2E boards')
    await waitForRoomReady(teacher)

    const student = await browser.newContext()
    const studentPage = await student.newPage()

    // Where the ink is, in world space, for the reads later on.
    let teacherInk!: Rect   // teacher's stroke on board 2
    let studentInk!: Rect   // student's stroke on board 2
    let board1Ink!: Rect    // teacher's stroke on board 1
    let strayInk!: Rect     // student's stroke on board 1, drawn out of the teacher's sight
    let board2 = ''

    try {
      await test.step('the owner adds a board and is moved onto it', async () => {
        const before = await boardState(teacher)
        expect(before.lessonId).toBe(lessonId)
        expect(before.boardId).toBe(lessonId)

        await openStrip(teacher)
        await teacher.getByRole('button', { name: 'New board' }).click()
        await teacher.waitForFunction(id => window.__roomStore!.getState().boardId !== id, lessonId, { timeout: slow(30_000) })
        await waitForRoomReady(teacher)

        const after = await boardState(teacher)
        board2 = after.boardId!
        expect(board2).not.toBe(lessonId)
        expect(after.boards.map(b => b.id)).toEqual([lessonId, board2])
        // The owner never follows: their own move is what "the teacher's
        // board" means, so it is announced as the active one.
        expect(after.activeBoardId).toBe(board2)
        await expect(tiles(teacher)).toHaveCount(2)
        await expect(tiles(teacher).nth(1)).toHaveAttribute('aria-pressed', 'true')
      })

      await test.step('a student joining by the lesson URL lands on the teacher\'s board', async () => {
        await joinRoom(studentPage, lessonId, 'Student')
        const s = await boardState(studentPage)
        expect(s.lessonId).toBe(lessonId)
        expect(s.boardId).toBe(board2)
        expect(s.following).toBe(true)
        // The URL stays the lesson's — a board is not a place a link can
        // point at (ADR 014 §4).
        expect(new URL(studentPage.url()).pathname).toBe(`/room/${lessonId}`)

        await openStrip(studentPage)
        await expect(tiles(studentPage)).toHaveCount(2)
        await expect(tiles(studentPage).nth(1)).toHaveAttribute('aria-pressed', 'true')
        await expect(tiles(studentPage).nth(1).getByLabel('The teacher is on this board')).toBeVisible()
        await expect(tiles(studentPage).nth(0).getByLabel('The teacher is on this board')).toHaveCount(0)
      })

      await test.step('both draw on board 2 and each sees the other\'s stroke', async () => {
        await drawStroke(teacher, [[420, 320], [820, 340]])
        await waitForOperations(teacher, 'stroke', 1)
        teacherInk = (await activeContent(teacher))!
        expect(teacherInk).not.toBeNull()

        // Down the live channel of the board, into the student's own engine.
        await waitForOperations(studentPage, 'stroke', 1)
        expect(await maxDarknessOverRect(studentPage, teacherInk)).toBeGreaterThan(INK)

        await drawStroke(studentPage, [[420, 520], [820, 540]])
        await waitForOperations(studentPage, 'stroke', 2)
        await waitForOperations(teacher, 'stroke', 2)
        const union = (await activeContent(teacher))!
        studentInk = strokeBelow(teacherInk, union)
        expect(studentInk.height).toBeGreaterThan(20)
        expect(await maxDarknessOverRect(teacher, studentInk)).toBeGreaterThan(INK)
        expect(await maxDarknessOverRect(studentPage, studentInk)).toBeGreaterThan(INK)
      })

      await test.step('the teacher goes back to board 1, the student follows, and board 1 is blank for both', async () => {
        await tiles(teacher).nth(0).click()
        await waitForBoard(teacher, lessonId)
        // Nobody clicked anything on the student's side.
        await waitForBoard(studentPage, lessonId)
        const s = await boardState(studentPage)
        expect(s.following).toBe(true)
        expect(s.activeBoardId).toBeNull()

        // Blank on both screens: no operations, no content bounds, and paper
        // where board 2's ink was. The last read is the one that matters —
        // an engine that kept board 2's pixels while the log said "empty"
        // would pass the first two.
        for (const p of [teacher, studentPage]) {
          expect(await strokeCount(p)).toBe(0)
          expect(await activeContent(p)).toBeNull()
          expect(await maxDarknessOverRect(p, teacherInk)).toBeLessThan(INK)
          expect(await maxDarknessOverRect(p, studentInk)).toBeLessThan(INK)
        }

        await drawStroke(teacher, [[420, 420], [820, 440]])
        await waitForOperations(teacher, 'stroke', 1)
        board1Ink = (await activeContent(teacher))!
        await waitForOperations(studentPage, 'stroke', 1)
        expect(await maxDarknessOverRect(studentPage, board1Ink)).toBeGreaterThan(INK)
      })

      await test.step('back on board 2, the earlier strokes are intact for both', async () => {
        await tiles(teacher).nth(1).click()
        await waitForBoard(teacher, board2)
        await waitForBoard(studentPage, board2)

        for (const p of [teacher, studentPage]) {
          await waitForOperations(p, 'stroke', 2)
          expect(await maxDarknessOverRect(p, teacherInk)).toBeGreaterThan(INK)
          expect(await maxDarknessOverRect(p, studentInk)).toBeGreaterThan(INK)
          // And board 1's stroke stayed on board 1.
          expect(await maxDarknessOverRect(p, board1Ink)).toBeLessThan(INK)
        }
      })

      await test.step('a student who picks a board by hand stops following, sees the chip, and returns by it', async () => {
        const board2Name = (await boardState(studentPage)).boards[1].name
        await tiles(studentPage).nth(0).click()
        await waitForBoard(studentPage, lessonId)
        expect((await boardState(studentPage)).following).toBe(false)
        await expect(teacherChip(studentPage)).toBeVisible()
        await expect(teacherChip(studentPage)).toContainText(board2Name)
        // The teacher's marker stays on board 2 while the student's frame
        // moved to board 1.
        await expect(tiles(studentPage).nth(0)).toHaveAttribute('aria-pressed', 'true')
        await expect(tiles(studentPage).nth(1).getByLabel('The teacher is on this board')).toBeVisible()

        // The teacher is told where the student went: in the store, and on
        // the strip as a head count over board 1.
        await waitForPeerOnBoard(teacher, 'Student', lessonId)
        await expect(tiles(teacher).nth(0).getByTitle('1 person on this board')).toBeVisible()

        // The student draws on board 1 while the teacher is on board 2. The
        // negative claim — that the teacher saw nothing — is ordered rather
        // than timed: the student's page turn below drains its outbox before
        // it asks to move, and the move is announced on the lesson channel,
        // so once the teacher's page has seen the student arrive on board 2
        // the server has long since decided who gets the stroke.
        await drawStroke(studentPage, [[420, 620], [820, 640]])
        await waitForOperations(studentPage, 'stroke', 2)
        strayInk = strokeBelow(board1Ink, (await activeContent(studentPage))!)
        expect(strayInk.height).toBeGreaterThan(20)

        await teacherChip(studentPage).click()
        await waitForBoard(studentPage, board2)
        expect((await boardState(studentPage)).following).toBe(true)
        await expect(teacherChip(studentPage)).toHaveCount(0)
        await waitForPeerOnBoard(teacher, 'Student', board2)

        expect(await strokeCount(teacher)).toBe(2)
        expect(await maxDarknessOverRect(teacher, strayInk)).toBeLessThan(INK)
      })

      await test.step('a reload puts the student back on the teacher\'s board', async () => {
        await studentPage.reload()
        await studentPage.locator('form input[type="text"]').first().fill('Student')
        await studentPage.locator('form button[type="submit"]').click()
        await waitForRoomReady(studentPage)

        const s = await boardState(studentPage)
        expect(s.boardId).toBe(board2)
        expect(s.following).toBe(true)
        await waitForOperations(studentPage, 'stroke', 2)
        expect(await maxDarknessOverRect(studentPage, teacherInk)).toBeGreaterThan(INK)
        expect(await maxDarknessOverRect(studentPage, studentInk)).toBeGreaterThan(INK)
      })

      await test.step('the owner renames board 2 and the student\'s strip follows', async () => {
        await tileMenu(teacher, 1, 'Rename')
        const input = teacher.getByRole('region', { name: 'Boards' }).getByRole('textbox', { name: 'Rename' })
        await input.fill('Cube')
        await input.press('Enter')

        await studentPage.waitForFunction(
          () => window.__roomStore!.getState().boards.some(b => b.name === 'Cube'), undefined, { timeout: slow(15_000) },
        )
        await openStrip(studentPage)
        await expect(tiles(studentPage).nth(1)).toHaveAttribute('aria-label', 'Cube')
      })

      await test.step('deleting the board the student is on evacuates them to board 1', async () => {
        // The owner steps off it first (one cannot pull the board out from
        // under oneself), the student follows, then picks it again by hand
        // so that they are the one standing on it when it goes.
        await tiles(teacher).nth(0).click()
        await waitForBoard(teacher, lessonId)
        await waitForBoard(studentPage, lessonId)
        await tiles(studentPage).nth(1).click()
        await waitForBoard(studentPage, board2)
        await waitForPeerOnBoard(teacher, 'Student', board2)

        await tileMenu(teacher, 1, 'Delete board')
        await teacher.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()

        await expect(tiles(teacher)).toHaveCount(1)
        // Moved by the server, not by anything the student did.
        await waitForBoard(studentPage, lessonId)
        const s = await boardState(studentPage)
        expect(s.boards.map(b => b.id)).toEqual([lessonId])
        // The student had opted out by hand, but the page they picked is gone
        // with the board, so the pick is void: being evacuated by the server
        // puts them back to following (handleRoomState, the "evacuated"
        // branch). No chip either — the teacher is here.
        expect(s.following).toBe(true)
        await expect(teacherChip(studentPage)).toHaveCount(0)
        // A lesson with one board has nothing to turn, so a student's strip
        // (and its toggle) go away with the board; the owner keeps theirs for
        // the "+" — see `stripAvailable` in Room/index.tsx.
        await expect(studentPage.getByRole('region', { name: 'Boards' })).toHaveCount(0)
        await expect(studentPage.getByRole('button', { name: 'Boards', exact: true })).toHaveCount(0)

        // And what they are looking at is board 1: the teacher's stroke and
        // the one they drew there themselves, nothing from the board that
        // was just deleted.
        await waitForOperations(studentPage, 'stroke', 2)
        expect(await maxDarknessOverRect(studentPage, board1Ink)).toBeGreaterThan(INK)
        expect(await maxDarknessOverRect(studentPage, strayInk)).toBeGreaterThan(INK)
        expect(await maxDarknessOverRect(studentPage, teacherInk)).toBeLessThan(INK)
        expect(await maxDarknessOverContent(studentPage, await activeLayerId(studentPage))).toBeGreaterThan(INK)
      })
    } finally {
      await student.close()
    }
  })
})
