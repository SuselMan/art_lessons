// Two (then three) participants in one room: the "dry everything" button of
// one must dry the paper of the others, and of someone joining afterwards.
// Usage: node twoclient.mjs
import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')

const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const open = async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message))
  return page
}
const ready = async (page) => {
  await page.waitForFunction(() => {
    if (!window.__engine) return false
    const c = document.querySelector('canvas')
    return !!c && getComputedStyle(c).pointerEvents !== 'none'
  }, undefined, { timeout: 60_000 })
  await page.waitForTimeout(1500)
}
const join = async (page, url, name) => {
  await page.goto(url)
  const inp = page.getByRole('textbox').first()
  try { await inp.waitFor({ timeout: 30_000 }) } catch (e) {
    await page.screenshot({ path: '/home/suselman/projects/pencil/temp/wc-runs/join_form_' + name + '.png' })
    console.log('no textbox', name, await page.evaluate(() => document.body.innerHTML.slice(0, 1500)))
    throw e
  }
  await inp.fill(name)
  await page.getByRole('button', { name: /join|войти/i }).last().click()
  try { await ready(page) } catch (e) {
    await page.screenshot({ path: '/home/suselman/projects/pencil/temp/wc-runs/join_fail_' + name + '.png' })
    console.log('join failed', name, await page.evaluate(() => ({ engine: !!window.__engine, pe: getComputedStyle(document.querySelector('canvas') || document.body).pointerEvents, text: document.body.innerText.slice(0, 300) })))
    throw e
  }
}
const wet = (page) => page.evaluate(() => window.__engine.getWatercolorPerf().wetCells)
const stroke = async (page, pts) => {
  const box = await page.locator('canvas').first().boundingBox()
  await page.mouse.move(box.x + pts[0][0], box.y + pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 30 })
  await page.mouse.up()
}
const pickWatercolor = async (page) => {
  await page.getByRole('button', { name: 'Drawing tool' }).first().click()
  await page.waitForTimeout(400)
  await page.getByText(/^Watercolor$|^Акварель$/).first().click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.evaluate(() => { const e = window.__engine; e.setPencil('normal:100:60:PB29:round'); e.setSize(80) })
}

const A = await open()
await A.goto('https://localhost:5277/create')
await A.locator('form input[type="text"]').first().fill('teacher')
await A.locator('form button[type="submit"]').click()
await A.waitForURL(/\/room\/[^/]+$/)
await ready(A)
const url = A.url()
await pickWatercolor(A)
await stroke(A, [[300, 300], [700, 320], [700, 600]])
await A.waitForTimeout(2500)
console.log('after teacher stroke   wet A', await wet(A))

// Control: someone joining now finds the teacher's water on their paper.
const C1 = await open()
await join(C1, url, 'late1')
console.log('joiner before dry      wet', await wet(C1))
await C1.context().close()

const B = await open()
await join(B, url, 'student')
await pickWatercolor(B)
console.log('student joined         wet B', await wet(B))

await A.getByRole('button', { name: /Dry everything|Высушить всё/ }).click()
await A.waitForTimeout(1500)
console.log('after teacher dries    wet A', await wet(A), ' wet B', await wet(B))

await stroke(B, [[320, 310], [650, 330]])
await B.waitForTimeout(2000)
const last = await B.evaluate(() => { const ops = window.__engine.getOperations().filter(o => o.type === 'stroke'); const o = ops[ops.length - 1]; return { wet: o.wet ?? null, washId: o.washId } })
console.log('student stroke over it', JSON.stringify(last))
console.log('ops on teacher', JSON.stringify(await A.evaluate(() => window.__engine.getOperations().map(o => o.type))))
await B.context().close()

const C2 = await open()
await join(C2, url, 'late2')
const joinedOps = await C2.evaluate(() => window.__engine.getOperations().map(o => o.type))
console.log('joiner after dry       wet', await wet(C2), ' ops', JSON.stringify(joinedOps))
await browser.close()
