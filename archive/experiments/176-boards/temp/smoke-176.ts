// (#566/#567) Smoke: two users, real browser, isolated stack on 5176/4176.
import { chromium, type Page, type BrowserContext } from '@playwright/test'

const BASE = 'https://127.0.0.1:5176'
const SHOTS = '/tmp/claude-1000/-home-suselman-projects-pencil/23d2a062-dc56-491a-98b4-9e9f921d0ea4/scratchpad/web-smoke'
const NAME_INPUT = 'form input[type="text"]'
const SUBMIT = 'form button[type="submit"]'
const BOARDS_BTN = /^(Boards|Доски)$/
const NEW_BOARD = /New board|Новая доска/
const CHIP = /Teacher is on|Учитель на доске/

type StoreShape = { boardId: string | null; lessonId: string | null; activeBoardId: string | null; following: boolean; boards: { id: string; name: string }[] }

const errors: string[] = []
function watch(page: Page, who: string) {
  page.on('pageerror', e => errors.push(`${who} pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`${who} console.error: ${m.text()}`) })
}

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    return !!(window as any).__engine && !!canvas && getComputedStyle(canvas).pointerEvents !== 'none'
  }, undefined, { timeout: 60_000 })
}
function store(page: Page): Promise<StoreShape> {
  return page.evaluate(() => {
    const s = (window as any).__roomStore.getState()
    return { boardId: s.boardId, lessonId: s.lessonId, activeBoardId: s.activeBoardId, following: s.following, boards: s.boards.map((b: any) => ({ id: b.id, name: b.name })) }
  })
}
async function waitBoard(page: Page, boardId: string) {
  await page.waitForFunction(id => (window as any).__roomStore.getState().boardId === id, boardId, { timeout: 30_000 })
  await ready(page)
}
function opsOfType(page: Page, type: string): Promise<number> {
  return page.evaluate(t => (window as any).__engine.getOperations().filter((o: any) => o.type === t).length, type)
}
async function waitOps(page: Page, type: string, n: number) {
  await page.waitForFunction(([t, k]) => (window as any).__engine.getOperations().filter((o: any) => o.type === t).length >= k, [type, n] as const, { timeout: 30_000 })
}
async function draw(page: Page, points: [number, number][]) {
  await page.evaluate(() => (window as any).__engine.setSize(48))
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas box')
  const [first, ...rest] = points
  await page.mouse.move(box.x + first[0], box.y + first[1])
  await page.mouse.down()
  for (const [x, y] of rest) await page.mouse.move(box.x + x, box.y + y, { steps: 8 })
  await page.mouse.up()
}
function tiles(page: Page) {
  return page.locator('section[aria-label="Boards"], section[aria-label="Доски"]').locator('[role=button][aria-pressed]')
}
async function shot(page: Page, name: string) { await page.screenshot({ path: `${SHOTS}/${name}.png` }) }
function assert(cond: unknown, msg: string) { if (!cond) throw new Error('ASSERT: ' + msg) }

async function main() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] })
  const ctx = (): Promise<BrowserContext> => browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 }, locale: 'en-US' })
  const owner = await ctx(); const op = await owner.newPage(); watch(op, 'owner')
  try {
    // Owner creates a lesson.
    await op.goto(`${BASE}/create`)
    await op.locator(NAME_INPUT).first().fill('Smoke lesson')
    await op.locator(SUBMIT).click()
    await op.waitForURL(/\/room\/[^/]+$/)
    const lessonId = new URL(op.url()).pathname.split('/').pop()!
    await ready(op)
    let s = await store(op)
    assert(s.lessonId === lessonId && s.boardId === lessonId, `owner seated on lesson: ${JSON.stringify(s)}`)
    await shot(op, '01-owner-lesson')

    // Owner opens the strip and adds a board.
    await op.getByRole('button', { name: BOARDS_BTN }).click()
    await shot(op, '02-owner-strip')
    await op.getByRole('button', { name: NEW_BOARD }).click()
    await op.waitForFunction(id => (window as any).__roomStore.getState().boardId !== id, lessonId, { timeout: 30_000 })
    await ready(op)
    s = await store(op)
    const board2 = s.boardId!
    assert(board2 !== lessonId && s.boards.length === 2, `owner on new board: ${JSON.stringify(s)}`)
    assert(s.activeBoardId === board2, `owner's board became active: ${JSON.stringify(s)}`)
    await draw(op, [[420, 300], [820, 320]])
    await waitOps(op, 'stroke', 1)
    await shot(op, '03-owner-board2-drawn')

    // Student joins by the lesson URL and lands on the teacher's board.
    const student = await ctx(); const sp = await student.newPage(); watch(sp, 'student')
    await sp.goto(`${BASE}/room/${lessonId}`)
    await sp.locator(NAME_INPUT).first().fill('Student')
    await sp.locator(SUBMIT).click()
    await ready(sp)
    let t = await store(sp)
    assert(t.lessonId === lessonId && t.boardId === board2 && t.following, `student landed on teacher's board: ${JSON.stringify(t)}`)
    assert(sp.url().endsWith(`/room/${lessonId}`), `student URL is the lesson: ${sp.url()}`)
    await waitOps(sp, 'stroke', 1)
    await shot(sp, '04-student-on-board2')
    await sp.getByRole('button', { name: BOARDS_BTN }).click()
    await sp.waitForTimeout(500)
    await shot(sp, '05-student-strip')
    assert(await tiles(sp).count() === 2, 'student sees two tiles')

    // Owner draws a second stroke while the student watches — live channel on the board.
    await draw(op, [[420, 420], [820, 440]])
    await waitOps(sp, 'stroke', 2)

    // Owner goes back to the first board; the follower follows.
    await tiles(op).nth(0).click()
    await waitBoard(op, lessonId)
    await waitBoard(sp, lessonId)
    t = await store(sp)
    assert(t.activeBoardId === null && t.following, `student followed: ${JSON.stringify(t)}`)
    assert((await opsOfType(sp, 'stroke')) === 0, 'lesson board is empty for the student (no leak from board 2)')
    assert((await opsOfType(op, 'stroke')) === 0, 'lesson board is empty for the owner')
    await shot(sp, '06-follower-followed')
    await shot(op, '06b-owner-back-on-lesson')

    // Student picks board 2 by hand: stops following, sees the chip, content is there.
    await tiles(sp).nth(1).click()
    await waitBoard(sp, board2)
    t = await store(sp)
    assert(!t.following, `student stopped following: ${JSON.stringify(t)}`)
    await waitOps(sp, 'stroke', 2)
    const chip = sp.getByRole('button', { name: CHIP })
    await chip.waitFor({ timeout: 10_000 })
    await shot(sp, '07-student-chip')
    // Owner sees the student's move in the roster.
    await op.waitForFunction(id => (window as any).__roomStore.getState().participants.some((p: any) => p.name === 'Student' && p.boardId === id), board2, { timeout: 10_000 })
    await shot(op, '07b-owner-sees-student-on-board2')

    // Student draws on board 2 while the owner is on the lesson board; the owner must not see it.
    await draw(sp, [[300, 600], [700, 620]])
    await waitOps(sp, 'stroke', 3)
    await sp.waitForTimeout(800)
    assert((await opsOfType(op, 'stroke')) === 0, 'owner on the lesson board saw nothing from board 2')

    // Chip: back to the teacher, following on.
    await chip.click()
    await waitBoard(sp, lessonId)
    t = await store(sp)
    assert(t.following, `student follows again: ${JSON.stringify(t)}`)
    assert(await sp.getByRole('button', { name: CHIP }).count() === 0, 'chip gone')
    await shot(sp, '08-student-returned')

    // Owner returns to board 2: the stroke the student drew there is restored.
    await tiles(op).nth(1).click()
    await waitBoard(op, board2)
    await waitBoard(sp, board2)
    await waitOps(op, 'stroke', 3)
    await shot(op, '09-owner-board2-has-3-strokes')

    // Rename + reorder + delete round trip, owner side; the student's strip follows.
    const ownerTiles = tiles(op)
    await ownerTiles.nth(1).locator('button[aria-haspopup="menu"]').click()
    await op.getByRole('menuitem', { name: /Rename|Переименовать/ }).click()
    await op.locator('section[aria-label="Boards"] input').fill('Cube')
    await op.keyboard.press('Enter')
    await sp.waitForFunction(() => (window as any).__roomStore.getState().boards.some((b: any) => b.name === 'Cube'), undefined, { timeout: 10_000 })
    await shot(sp, '10-student-sees-rename')

    // Add a third, move it left, then delete it while the student sits on it.
    await op.getByRole('button', { name: NEW_BOARD }).click()
    await op.waitForFunction(() => (window as any).__roomStore.getState().boards.length === 3, undefined, { timeout: 30_000 })
    await ready(op)
    const board3 = (await store(op)).boardId!
    await waitBoard(sp, board3) // following
    await ownerTiles.nth(2).locator('button[aria-haspopup="menu"]').click()
    await op.getByRole('menuitem', { name: /Move left|Сдвинуть влево/ }).click()
    await sp.waitForFunction(id => (window as any).__roomStore.getState().boards[1].id === id, board3, { timeout: 10_000 })
    await shot(op, '11-owner-moved-left')
    // Owner goes to the lesson board; student stays on board 3 by hand; owner deletes board 3.
    await tiles(op).nth(0).click()
    await waitBoard(op, lessonId)
    await waitBoard(sp, lessonId)
    await tiles(sp).nth(1).click()
    await waitBoard(sp, board3)
    await tiles(op).nth(1).locator('button[aria-haspopup="menu"]').click()
    await op.getByRole('menuitem', { name: /Delete board|Удалить доску/ }).click()
    await op.getByRole('dialog').getByRole('button', { name: /^(Delete|Удалить)$/ }).click()
    await op.waitForFunction(() => (window as any).__roomStore.getState().boards.length === 2, undefined, { timeout: 10_000 })
    await waitBoard(sp, lessonId) // evacuated by the server
    t = await store(sp)
    assert(t.boards.length === 2, `student strip lost the board: ${JSON.stringify(t)}`)
    await shot(sp, '12-student-evacuated')

    // Reload the student: lands on the teacher's board (lesson) with following on.
    await sp.reload()
    await sp.locator(NAME_INPUT).first().fill('Student')
    await sp.locator(SUBMIT).click()
    await ready(sp)
    t = await store(sp)
    assert(t.boardId === lessonId && t.following, `student reload lands on teacher: ${JSON.stringify(t)}`)

    // Board URL: opening /room/<board2> redirects to the lesson and selects board 2.
    const sp2 = await student.newPage(); watch(sp2, 'student-tab2')
    await sp2.goto(`${BASE}/room/${board2}`)
    await sp2.locator(NAME_INPUT).first().fill('Student')
    await sp2.locator(SUBMIT).click()
    await ready(sp2)
    await sp2.waitForURL(`${BASE}/room/${lessonId}`, { timeout: 10_000 })
    t = await store(sp2)
    assert(t.boardId === board2 && !t.following, `board URL selects that board, not following: ${JSON.stringify(t)}`)
    await waitOps(sp2, 'stroke', 3)
    await shot(sp2, '13-board-url-redirected')

    // My lessons card shows the active board's thumbnail (owner is on the lesson board now).
    await op.goto(`${BASE}/my-lessons`)
    await op.waitForTimeout(1500)
    await shot(op, '14-my-lessons')

    console.log('SMOKE OK', { lessonId, board2, board3 })
  } finally {
    console.log('errors:', errors.length ? errors : 'none')
    await browser.close()
  }
}
main().catch(e => { console.error('SMOKE FAILED', e); process.exit(1) })
