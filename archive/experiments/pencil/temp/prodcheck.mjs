import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push('pageerror: ' + e.message))
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
p.on('requestfailed', r => errs.push('reqfail: ' + r.url()))
for (const u of ['https://grafetto.com/', 'https://grafetto.com/room/zzzz-nonexistent-check']) {
  await p.goto(u, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  console.log(u, '->', (await p.title()), '| text:', (await p.locator('body').innerText()).slice(0, 120).replace(/\n/g, ' '))
}
console.log('version', await p.evaluate(() => globalThis.__APP_VERSION__ ?? globalThis.grafettoVersion ?? ''))
console.log(errs.length ? errs.join('\n') : 'NO ERRORS')
await b.close()
