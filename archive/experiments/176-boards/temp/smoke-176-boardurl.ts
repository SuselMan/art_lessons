import { chromium, type Page } from '@playwright/test'

const BASE = 'https://127.0.0.1:5176'
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
function frames(page: Page, who: string) {
  page.on('websocket', ws => {
    ws.on('framereceived', f => {
      const p = String(f.payload)
      if (p.includes('room_state')) {
        const m = p.match(/"tailOperations":\[(.*?)\],"participants"/)
        const roomId = p.match(/"room":\{"id":"([^"]+)"/)?.[1]
        console.log(`${who} <- room_state room=${roomId} tailLen=${m ? (m[1] ? m[1].split('"type":"').length - 1 : 0) : '?'} snap=${p.match(/"latestSnapshotSeq":([^,]+)/)?.[1]}`)
      }
    })
    ws.on('framesent', f => { const p = String(f.payload); if (p.includes('join_room')) console.log(`${who} -> ${p.slice(0, 160)}`) })
  })
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('room')) console.log(`${who} console: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', e => console.log(`${who} pageerror ${e.message}`))
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] })
  const mk = () => browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 }, locale: 'en-US' })
  const owner = await mk(); const op = await owner.newPage()
  await op.goto(`${BASE}/create`); await op.locator(NAME_INPUT).first().fill('URL lesson'); await op.locator(SUBMIT).click()
  await op.waitForURL(/\/room\/[^/]+$/); const lessonId = new URL(op.url()).pathname.split('/').pop()!
  await ready(op)
  await op.getByRole('button', { name: /^Boards$/ }).click()
  await op.getByRole('button', { name: /New board/ }).click()
  await op.waitForFunction(id => (window as any).__roomStore.getState().boardId !== id, lessonId, { timeout: 30_000 })
  await ready(op)
  const board2: string = await op.evaluate(() => (window as any).__roomStore.getState().boardId)
  await draw(op, [[420, 300], [820, 320]]); await draw(op, [[420, 400], [820, 420]])
  await op.waitForFunction(() => (window as any).__engine.getOperations().filter((o: any) => o.type === 'stroke').length >= 2)
  await op.waitForTimeout(1500)
  console.log('owner drew 2 on', board2)

  const st = await mk(); const sp = await st.newPage(); frames(sp, 'student')
  await sp.goto(`${BASE}/room/${board2}`)
  await sp.locator(NAME_INPUT).first().fill('Student'); await sp.locator(SUBMIT).click()
  await ready(sp)
  await sp.waitForTimeout(2000)
  const s = await sp.evaluate(() => {
    const st = (window as any).__roomStore.getState()
    return { url: location.pathname, boardId: st.boardId, lessonId: st.lessonId, ops: (window as any).__engine.getOperations().length, layers: (window as any).__engine.liveLayerIds() }
  })
  console.log('student state', s)
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
