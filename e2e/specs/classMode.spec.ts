import type { BrowserContext, Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

/** What the store says about class mode on one page — read together so a
 *  failing assertion can quote the whole picture. */
interface ClassState {
  userId: string
  lessonId: string | null
  boardId: string | null
  following: boolean
  activeAssignmentId: string | null
  spotlightBoardId: string | null
  handsRaised: string[]
  personal: Array<{ id: string; ownerId: string; thumbnailUpdatedAt?: string }>
}

function classState(page: Page): Promise<ClassState> {
  return page.evaluate(() => {
    const s = window.__roomStore!.getState()
    return {
      userId: s.userId, lessonId: s.lessonId, boardId: s.boardId, following: s.following,
      activeAssignmentId: s.activeAssignmentId, spotlightBoardId: s.spotlightBoardId, handsRaised: s.handsRaised,
      personal: s.boards.filter(b => b.ownerId).map(b => ({ id: b.id, ownerId: b.ownerId!, thumbnailUpdatedAt: b.thumbnailUpdatedAt })),
    }
  })
}

async function waitForBoard(page: Page, boardId: string): Promise<void> {
  await page.waitForFunction(id => window.__roomStore!.getState().boardId === id, boardId, { timeout: 30_000 })
  await waitForRoomReady(page)
}

/** On a classmate's work, where the pen is refused: the board has arrived and
 *  its content is up, and the canvas stays closed to input — the same
 *  `pointer-events: none` a frozen room gets, so a stroke is never drawn into
 *  the void. `waitForRoomReady` would wait for it to open forever. */
async function waitForReadOnlyBoard(page: Page, boardId: string): Promise<void> {
  await page.waitForFunction(id => window.__roomStore!.getState().boardId === id, boardId, { timeout: 30_000 })
  await expect(page.getByText(/work — you can look, not draw/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    return canvas ? getComputedStyle(canvas).pointerEvents : null
  })).toBe('none')
}

/** This client's own board in the running round, once the server has told
 *  it about one. */
async function ownBoard(page: Page): Promise<string> {
  const handle = await page.waitForFunction(() => {
    // Undefined until the room page has mounted — a latecomer is asked this
    // straight after submitting the join form.
    const s = window.__roomStore?.getState()
    if (!s) return null
    return s.boards.find(b => b.assignmentId === s.activeAssignmentId && b.ownerId === s.userId)?.id ?? null
  }, undefined, { timeout: 30_000 })
  return (await handle.jsonValue())!
}

function strokesBy(page: Page, userId: string): Promise<number> {
  return operations(page).then(ops => ops.filter(op => op.type === 'stroke' && op.userId === userId).length)
}

/** The Class tab of the right-hand panel, opened if it is not already. Its
 *  first section is "where the class is" for the teacher, "my boards" for a
 *  student. */
async function openClassTab(page: Page, section: 'Where the class is' | 'My boards'): Promise<Locator> {
  const region = page.getByRole('region', { name: section })
  if (!(await region.isVisible())) await page.getByRole('button', { name: /^Open Class/ }).click()
  await expect(region).toBeVisible()
  return region
}

/** The big grid of one assignment's works, opened from the Class tab. */
async function openGrid(page: Page, assignment: string): Promise<Locator> {
  const places = await openClassTab(page, 'Where the class is')
  await places.getByRole('button', { name: `All works: ${assignment}` }).click()
  const grid = page.getByRole('dialog', { name: 'Class' })
  await expect(grid).toBeVisible()
  return grid
}

/** (#595, ADR 015 §9 step 7, §11) A lesson in two phases: the teacher explains
 *  on their own board, then hands out an assignment, walks the class, shows
 *  one work to everyone, calls the class back — and sends it back to the same
 *  work, which is the ordinary rhythm of a lesson rather than an edge case.
 *
 *  Unit tests cover the server's rights and channels and the client's follow
 *  rule one at a time; this is the promise they make together, in a real
 *  browser with real canvases — who ends up on which board without touching
 *  anything, whose pen is refused where, and that the work is still there
 *  when the class comes back. One test, because every step is the next one's
 *  setup. */
test.describe('class mode', () => {
  test('hand out, draw, walk the class, show one to all, call everyone back and send them back', async ({ page: teacher, browser }) => {
    test.setTimeout(300_000)

    const lessonId = await createRoom(teacher, 'E2E class')
    await waitForRoomReady(teacher)

    const contexts: BrowserContext[] = []
    const student = async (name: string, { ready = true } = {}) => {
      const context = await browser.newContext()
      contexts.push(context)
      const page = await context.newPage()
      if (ready) {
        await joinRoom(page, lessonId, name)
      } else {
        // joinRoom waits for a canvas that takes a pen; a latecomer arriving
        // while a classmate's work is shown lands on a closed one.
        await page.goto(`/room/${lessonId}`)
        await page.locator('form input[type="text"]').first().fill(name)
        await page.locator('form button[type="submit"]').click()
      }
      return page
    }

    try {
      const alice = await student('Alice')
      const bob = await student('Bob')
      const aliceId = (await classState(alice)).userId
      const bobId = (await classState(bob)).userId
      let aliceBoard = ''
      let bobBoard = ''

      await test.step('the teacher hands out an assignment and each student is taken to a blank board of their own', async () => {
        const places = await openClassTab(teacher, 'Where the class is')
        await places.getByRole('button', { name: 'New assignment' }).click()
        await places.getByRole('button', { name: 'Hand out', exact: true }).click()

        aliceBoard = await ownBoard(alice)
        bobBoard = await ownBoard(bob)
        expect(aliceBoard).not.toBe(bobBoard)
        // Nobody on the students' side clicked anything.
        await waitForBoard(alice, aliceBoard)
        await waitForBoard(bob, bobBoard)
        expect((await classState(alice)).following).toBe(true)

        // Under teacher_only a student is told about their own board and no
        // one else's; the teacher about everyone's.
        expect((await classState(alice)).personal.map(b => b.id)).toEqual([aliceBoard])
        expect((await classState(teacher)).personal.map(b => b.id).sort()).toEqual([aliceBoard, bobBoard].sort())
        // The teacher stays where they were: handing out is not a page turn.
        expect((await classState(teacher)).boardId).toBe(lessonId)
        await expect(places.getByRole('img', { name: 'Class is here' })).toBeVisible()
        const grid = await openGrid(teacher, 'Assignment 1')
        await expect(grid.getByRole('button', { name: 'Alice' })).toBeVisible()
        await expect(grid.getByRole('button', { name: 'Bob' })).toBeVisible()
      })

      await test.step('a classmate\'s board is closed over REST too', async () => {
        const status = await bob.evaluate(id => fetch(`/api/rooms/${id}/snapshots/index`, { credentials: 'include' }).then(r => r.status), aliceBoard)
        expect(status).toBe(403)
      })

      await test.step('both draw, and their previews reach the teacher\'s grid', async () => {
        await drawStroke(alice, [[420, 320], [820, 340]])
        await drawStroke(bob, [[420, 420], [820, 440]])
        await waitForOperations(alice, 'stroke', 1)
        await waitForOperations(bob, 'stroke', 1)
        // Baked after the pen has rested, uploaded, announced to the teacher.
        await teacher.waitForFunction(ids => {
          const boards = window.__roomStore!.getState().boards
          return ids.every(id => boards.find(b => b.id === id)?.thumbnailUpdatedAt)
        }, [aliceBoard, bobBoard], { timeout: 30_000 })
      })

      await test.step('the teacher opens Alice\'s board: remarks by default, corrections in the work on request', async () => {
        await teacher.getByRole('dialog', { name: 'Class' }).getByRole('button', { name: 'Alice' }).click()
        await waitForBoard(teacher, aliceBoard)
        // A visit, not a page turn: the class did not follow the teacher here.
        expect((await classState(bob)).boardId).toBe(bobBoard)
        await expect(alice.getByText('The teacher is looking at your work')).toBeVisible()
        expect(await teacher.evaluate(() => window.__roomStore!.getState().tool)).toBe('annotatePen')

        await drawStroke(teacher, [[420, 520], [820, 540]])
        await waitForOperations(teacher, 'annotation_add', 1)
        await waitForOperations(alice, 'annotation_add', 1)

        await teacher.getByRole('button', { name: 'Edit the work' }).click()
        await drawStroke(teacher, [[420, 620], [820, 640]])
        const teacherId = (await classState(teacher)).userId
        await expect.poll(() => strokesBy(alice, teacherId)).toBe(1)
      })

      await test.step('Bob raises his hand: a badge on the Class tab, a hand by his name, and in the grid', async () => {
        await bob.getByRole('button', { name: 'Raise hand' }).click()
        await teacher.waitForFunction(id => window.__roomStore!.getState().handsRaised.includes(id), bobId)
        await expect(teacher.getByRole('button', { name: /raised hands: 1/ })).toBeVisible()
        await expect(teacher.getByRole('button', { name: "Lower Bob's hand" })).toBeVisible()
        const grid = await openGrid(teacher, 'Assignment 1')
        await expect(grid.getByTitle('Hand raised')).toBeVisible()
      })

      await test.step('"Show everyone" puts Bob\'s work in front of the class, read-only for Alice', async () => {
        const grid = teacher.getByRole('dialog', { name: 'Class' })
        await grid.getByRole('button', { name: 'Bob' }).getByRole('button', { name: 'Show everyone' }).click()
        await waitForReadOnlyBoard(alice, bobBoard)
        await expect(alice.getByText(/Bob's work/)).toBeVisible()
        // Following, so no chip: she is exactly where the teacher sent her.
        await expect(alice.getByRole('button', { name: /The teacher is showing/ })).toHaveCount(0)
        // And Bob's own stroke is on the board she is looking at.
        await expect.poll(() => strokesBy(alice, bobId)).toBe(1)
      })

      await test.step('a latecomer gets a board of their own', async () => {
        const carol = await student('Carol', { ready: false })
        const carolBoard = await ownBoard(carol)
        expect([aliceBoard, bobBoard]).not.toContain(carolBoard)
        // The spotlight is on, and following leads there first.
        await waitForReadOnlyBoard(carol, bobBoard)
      })

      await test.step('"Everyone to me" brings the class to the teacher\'s board without ending anything', async () => {
        await teacher.getByRole('dialog', { name: 'Class' }).getByRole('button', { name: 'Everyone to me' }).click()
        for (const page of [alice, bob]) await waitForBoard(page, lessonId)
        expect((await classState(alice)).activeAssignmentId).toBeNull()
        expect((await classState(alice)).spotlightBoardId).toBeNull()
        const places = await openClassTab(teacher, 'Where the class is')
        await expect(places.getByRole('button', { name: 'Send everyone here' })).toBeVisible()
      })

      await test.step('"Send everyone here" returns every student to their own work, as they left it', async () => {
        const places = await openClassTab(teacher, 'Where the class is')
        await places.getByRole('button', { name: 'Send everyone here' }).click()
        await waitForBoard(alice, aliceBoard)
        await waitForBoard(bob, bobBoard)
        await expect.poll(() => strokesBy(alice, aliceId)).toBe(1)
        await expect.poll(() => strokesBy(bob, bobId)).toBe(1)
      })

      await test.step('a student gets back to their work from "My boards" on their own', async () => {
        await (await openClassTab(teacher, 'Where the class is')).getByRole('button', { name: 'Everyone to me' }).click()
        await waitForBoard(alice, lessonId)

        const mine = await openClassTab(alice, 'My boards')
        await mine.getByRole('button', { name: 'Assignment 1' }).click()
        await waitForBoard(alice, aliceBoard)
        await expect.poll(() => strokesBy(alice, aliceId)).toBe(1)
      })
    } finally {
      for (const context of contexts) await context.close()
    }
  })
})
