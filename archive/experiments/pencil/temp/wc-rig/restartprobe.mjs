import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const B = 'npx tsx /home/suselman/projects/pencil-agents/watercolor-feel/apps/web/scripts/devbridge.ts'
const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] })
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
await page.goto('https://localhost:5277/?probe=' + Date.now())
await page.waitForTimeout(4000)
const id = await page.evaluate(() => sessionStorage.getItem('devbridge:id'))
console.log('id', id, execSync(`${B} eval ${id} '1+1'`, { encoding: 'utf8' }).trim())
execSync('touch /home/suselman/projects/pencil-agents/watercolor-feel/apps/web/scripts/devBridgePlugin.ts')
const t0 = Date.now()
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000))
  let alive = 'hung'
  try { alive = await Promise.race([page.evaluate(() => 'ok'), new Promise(r => setTimeout(() => r('hung'), 3000))]) } catch (e) { alive = 'nav:' + e.message.slice(0, 40) }
  let bridged = ''
  try { bridged = execSync(`${B} eval ${id} '2+2'`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch (e) { bridged = 'no' }
  console.log(Math.round((Date.now() - t0) / 1000) + 's page', alive, 'bridge', bridged)
  if (bridged === '4') break
}
await browser.close()
