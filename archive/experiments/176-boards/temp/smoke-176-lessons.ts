import { chromium, type Page } from '@playwright/test'

const BASE = 'https://127.0.0.1:5176'
const SHOTS = '/tmp/claude-1000/-home-suselman-projects-pencil/23d2a062-dc56-491a-98b4-9e9f921d0ea4/scratchpad/web-smoke'
const NAME_INPUT = 'form input[type="text"]'
const SUBMIT = 'form button[type="submit"]'

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    return !!(window as any).__engine && !!canvas && getComputedStyle(canvas).pointerEvents !== 'none'
  }, undefined, { timeout: 60_000 })
}
async function draw(page: Page, points: [number, number][]) {
  await page.evaluate(() => (window as any).__engine.setSize(48))
  const box = (await page.locator('canvas').first().boundingBox())!
  const [first, ...rest] = points
  await page.mouse.move(box.x + first[0], box.y + first[1]); await page.mouse.down()
  for (const [x, y] of rest) await page.mouse.move(box.x + x, box.y + y, { steps: 8 })
  await page.mouse.up()
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] })
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 }, locale: 'en-US' })
  const page = await ctx.newPage()
  // Dev sign-in: the code comes back in the response and the form pre-fills it.
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill('smoke-owner@example.com')
  await page.locator(SUBMIT).click()
  await page.waitForFunction(() => {
    const i = document.querySelector('form input:not([type="email"])') as HTMLInputElement | null
    return !!i && i.value.length >= 4
  }, undefined, { timeout: 15_000 })
  await page.locator(SUBMIT).click()
  await page.waitForURL(/\/(my-lessons|create)/, { timeout: 15_000 })

  await page.goto(`${BASE}/create`)
  await page.locator(NAME_INPUT).first().fill('Card lesson')
  await page.locator(SUBMIT).click()
  await page.waitForURL(/\/room\/[^/]+$/); const lessonId = new URL(page.url()).pathname.split('/').pop()!
  await ready(page)
  await page.getByRole('button', { name: /^Boards$/ }).click()
  await page.getByRole('button', { name: /New board/ }).click()
  await page.waitForFunction(id => (window as any).__roomStore.getState().boardId !== id, lessonId, { timeout: 30_000 })
  await ready(page)
  const board2: string = await page.evaluate(() => (window as any).__roomStore.getState().boardId)
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('[diag]')) console.log('console:', m.text().slice(0, 160)) })
  const probe = async (tag: string) => console.log(tag, await page.evaluate(() => {
    const st = (window as any).__roomStore.getState(); const c = document.querySelector('canvas')!
    return { boardId: st.boardId, ops: (window as any).__engine.getOperations().map((o: any) => o.type), pe: getComputedStyle(c).pointerEvents, active: st.layerState.activeId, tool: st.tool }
  }))
  await page.getByRole('button', { name: /Hide boards/ }).click()
  await probe('before')
  await draw(page, [[420, 300], [820, 320]]); await page.waitForTimeout(800); await probe('after1')
  await draw(page, [[420, 500], [820, 520]]); await page.waitForTimeout(800); await probe('after2')
  await page.screenshot({ path: `${SHOTS}/debug-lessons.png` })
  await page.waitForFunction(() => (window as any).__engine.getOperations().filter((o: any) => o.type === 'stroke').length >= 2)
  await page.waitForTimeout(1200)
  // Leave through the app's own exit so the engine cleanup bakes board 2's thumbnail.
  await page.getByRole('button', { name: /leave this project/i }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Leave/i }).click()
  await page.waitForTimeout(2500)
  await page.goto(`${BASE}/my-lessons`)
  const img = page.locator(`img[src*="${board2}"]`).first()
  await img.waitFor({ timeout: 15_000 })
  await page.waitForFunction(el => (el as HTMLImageElement).naturalWidth > 0, await img.elementHandle(), { timeout: 15_000 })
  await page.screenshot({ path: `${SHOTS}/15-my-lessons-card.png` })
  console.log('LESSONS OK', { lessonId, board2, src: await img.getAttribute('src') })
  await browser.close()
}
main().catch(e => { console.error('LESSONS FAILED', e); process.exit(1) })
