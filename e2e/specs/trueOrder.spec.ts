import type { Page, WebSocketRoute } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  activeLayerId, contentBounds, createRoom, darkness, drawStroke, joinRoom, operations,
  waitForOperations, waitForRoomReady, type Rect,
} from '../support/room'

/** Holds back every socket.io event one page sends until `release()` — the
 *  author's side of the race #537 is about, forced rather than hoped for.
 *
 *  Only event frames (`42…`) are held: engine.io's own ping/pong keeps flowing,
 *  so the connection stays up and nothing here looks like a disconnect. What is
 *  held is exactly what a slow uplink holds — the operation this page just
 *  painted locally, and the live packets that preceded it — while everything
 *  coming *down* the socket still arrives on time. */
async function holdOutgoingEvents(page: Page): Promise<{ hold(): void; release(): void }> {
  let holding = false
  const held: Array<{ server: WebSocketRoute; message: string | Buffer }> = []
  await page.routeWebSocket(/socket\.io/, ws => {
    const server = ws.connectToServer()
    ws.onMessage(message => {
      if (holding && typeof message === 'string' && message.startsWith('42')) held.push({ server, message })
      else server.send(message)
    })
    server.onMessage(message => ws.send(message))
  })
  return {
    hold() { holding = true },
    release() {
      holding = false
      for (const { server, message } of held.splice(0)) server.send(message)
    },
  }
}

async function selectTool(page: Page, key: string, tool: string): Promise<void> {
  await page.keyboard.press(key)
  await expect.poll(() => page.evaluate(() => window.__roomStore!.getState().drawingTool)).toBe(tool)
}

/** Darkness of the composite on a grid over `rect`, in world units. */
async function darknessGrid(page: Page, rect: Rect, steps = 40): Promise<number[]> {
  const samples: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      samples.push([Math.round(rect.x + (rect.width * i) / steps), Math.round(rect.y + (rect.height * j) / steps)])
    }
  }
  const colors = await page.evaluate(points => points.map(([x, y]) => window.__engine!.pickColor(x, y)), samples)
  return colors.map(darkness)
}

function compare(a: number[], b: number[]): { maxDiff: number; differing: number } {
  let maxDiff = 0
  let differing = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    maxDiff = Math.max(maxDiff, d)
    if (d > 0.03) differing++
  }
  return { maxDiff, differing }
}

/** (#537) Every participant ends up with the picture the server's order
 *  describes — including the one whose own stroke painted before its seq was
 *  known.
 *
 *  The race, made deterministic: the teacher draws a horizontal line while her
 *  uplink is held, so it is on her layer and nowhere else. The student then
 *  erases a vertical sweep through the same spot; that erase reaches the server
 *  first and gets the *earlier* seq. Only then does the teacher's line go out.
 *
 *  True order is therefore "erase, then line": the line is whole. The student
 *  and any later joiner see exactly that. Before #537 the teacher did not —
 *  the erase arrived after her line had already been painted and cut straight
 *  through it, on her screen only, for the rest of the lesson.
 *
 *  An eraser because for it the order *is* the result: pencil over pencil
 *  saturates and can hide a swapped order, an erase over a line cannot. */
test.describe('true operation order', () => {
  test('the author of a delayed stroke re-settles into the server order', { tag: '@two-browsers' }, async ({ page, browser }) => {
    const uplink = await holdOutgoingEvents(page)
    const roomId = await createRoom(page)
    await waitForRoomReady(page)

    const student = await browser.newContext()
    const studentPage = await student.newPage()
    const late = await browser.newContext()
    const latePage = await late.newPage()
    try {
      await joinRoom(studentPage, roomId)
      const layer = await activeLayerId(page)
      expect(await activeLayerId(studentPage)).toBe(layer)

      const box = await page.locator('canvas').first().boundingBox()
      if (!box) throw new Error('e2e: the canvas has no box')
      const cx = box.width / 2
      const cy = box.height / 2

      uplink.hold()
      await drawStroke(page, [[cx - 200, cy], [cx, cy], [cx + 200, cy]])
      await waitForOperations(page, 'stroke', 1)

      await selectTool(studentPage, 'e', 'eraser')
      await drawStroke(studentPage, [[cx, cy - 150], [cx, cy], [cx, cy + 150]])
      await waitForOperations(studentPage, 'stroke', 1)
      expect((await operations(studentPage)).find(op => op.type === 'stroke')).toMatchObject({ tool: 'eraser' })
      // The erase has reached the teacher — confirmed, applied, and (before
      // the fix) painted over her own not-yet-sent line.
      await waitForOperations(page, 'stroke', 2)

      uplink.release()
      await waitForOperations(studentPage, 'stroke', 2)
      // The teacher's own line comes back confirmed on the same broadcast that
      // just reached the student.
      await page.waitForTimeout(1000)
      const authors = async (p: Page) => (await operations(p)).filter(op => op.type === 'stroke').map(op => op.userId)
      expect.soft(await authors(page), 'the teacher\'s log is in the server\'s order').toEqual(await authors(studentPage))

      await joinRoom(latePage, roomId, 'Late')
      await waitForOperations(latePage, 'stroke', 2)

      const bounds = await contentBounds(latePage, layer)
      expect(bounds, 'the joiner replays the line onto the layer').not.toBeNull()
      // Let the re-settle (if any) and the reveal finish before reading.
      await page.waitForTimeout(500)
      // Densely over the crossing — the erase is ~50 world px wide, and a grid
      // over the whole line would put one or two samples in it — and coarsely
      // over the whole line, for anything else that might differ.
      const b = bounds!
      const crossing = { x: b.x + b.width / 2 - 80, y: b.y, width: 160, height: b.height }
      const measure = async (p: Page) => ({ crossing: await darknessGrid(p, crossing), line: await darknessGrid(p, b) })
      const teacher = await measure(page)
      const studentGrid = await measure(studentPage)
      const joiner = await measure(latePage)

      const teacherVsStudent = compare([...teacher.crossing, ...teacher.line], [...studentGrid.crossing, ...studentGrid.line])
      const joinerVsStudent = compare([...joiner.crossing, ...joiner.line], [...studentGrid.crossing, ...studentGrid.line])
      const lightest = (g: number[]) => Math.min(...rowThrough(g, 40)).toFixed(3)
      console.log('[#537] lightest point on the line through the crossing, teacher/student/joiner:',
        lightest(teacher.crossing), lightest(studentGrid.crossing), lightest(joiner.crossing))
      console.log('[#537] teacher vs student:', JSON.stringify(teacherVsStudent),
        'joiner vs student:', JSON.stringify(joinerVsStudent))

      // The line is whole through the crossing on the replay — the server
      // order's own answer.
      expect(Math.min(...rowThrough(joiner.crossing, 40))).toBeGreaterThan(0.08)
      expect(joinerVsStudent.differing).toBe(0)
      expect(teacherVsStudent.differing, 'the teacher sees what everyone else sees').toBe(0)
    } finally {
      await student.close()
      await late.close()
    }
  })
})

/** The darkness samples along the horizontal middle of the grid — the line's
 *  own centre, since the grid covers the line's bounds. */
function rowThrough(grid: number[], steps: number): number[] {
  const mid = Math.round(steps / 2)
  const row: number[] = []
  for (let i = 0; i <= steps; i++) row.push(grid[i * (steps + 1) + mid])
  return row
}
