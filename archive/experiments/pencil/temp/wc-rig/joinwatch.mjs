import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const room = process.argv[2]
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text().slice(0, 200)) })
await page.goto('https://localhost:5277/room/' + room)
const inp = page.getByRole('textbox').first(); await inp.waitFor({ timeout: 30000 }); await inp.fill('probe')
await page.getByRole('button', { name: /join|войти/i }).last().click()
const t0 = Date.now()
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(5000)
  const s = await page.evaluate(() => { const e = window.__engine; const c = document.querySelector('canvas'); return { ops: e ? e._log.entries.length : -1, pe: c ? getComputedStyle(c).pointerEvents : '-', vis: document.visibilityState, text: document.body.innerText.slice(0, 80).replace(/\n/g, ' | ') } })
  console.log(Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(s))
  if (s.pe === 'auto' && s.ops > 150) break
}
await browser.close()
