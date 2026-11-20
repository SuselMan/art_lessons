// Standalone hardware-GPU witness; run with NODE_PATH pointing to an existing Playwright installation.
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
async function main() {
  const out = process.env.QA_OUTPUT
  if (!out || !process.env.QA_ROOM_ID) throw new Error('QA_OUTPUT and QA_ROOM_ID required')
  await fs.mkdir(out, { recursive: true })
  const browser = await chromium.launch({ headless: process.env.QA_HEADLESS === '1', executablePath: process.env.QA_CHROME || undefined, args: ['--no-sandbox', ...(process.env.QA_HEADLESS === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])], env: process.env.QA_HEADLESS === '1' ? process.env : { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } })
  const context = await browser.newContext({ baseURL: process.env.QA_URL || 'http://127.0.0.1:53860', viewport: { width: 1365, height: 900 } })
  if (process.env.QA_ACCESS) { const access=JSON.parse(await fs.readFile(process.env.QA_ACCESS,'utf8')); await context.addCookies(access.cookies) }
  const page = await context.newPage()
  const errors = [], httpErrors=[]
  page.on('response',r=>{if(r.status()>=400)httpErrors.push({path:new URL(r.url()).pathname,status:r.status()})})
  try {
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`/room/${process.env.QA_ROOM_ID}`)
    await page.locator('form input[type="text"]').first().fill('GPU witness')
    await page.locator('form button[type="submit"]').click()
    await page.waitForFunction(() => window.__engine && getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none', undefined, { timeout: 90000 })
    const result = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl'), ext = gl.getExtension('WEBGL_debug_renderer_info')
      const blob = await window.__engine.exportPNG()
      return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), width: canvas.width, height: canvas.height, operations: window.__engine.getOperations().map(o => o.id), png: Array.from(new Uint8Array(await blob.arrayBuffer())) }
    })
    await fs.writeFile(`${out}/device-export.png`, Buffer.from(result.png))
    delete result.png
    let drawMs=null
    if (process.env.QA_DRAW === '1') {
      await page.evaluate(() => { const s=window.__roomStore.getState(); s.setTool('digitalBrush'); s.setToolSetting('digitalBrush','brush','imported-4647a7f86bbd076ed16ea278'); s.setToolSetting('digitalBrush','size',60) })
      await page.waitForFunction(() => getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none')
      const before=await page.evaluate(()=>window.__engine.getOperations().filter(o=>o.type==='stroke').length)
      const box=await page.locator('canvas').first().boundingBox()
      const started=Date.now()
      await page.mouse.move(box.x+box.width*.4,box.y+box.height*.65);await page.mouse.down()
      await page.mouse.move(box.x+box.width*.65,box.y+box.height*.72,{steps:24});await page.mouse.up()
      await page.waitForFunction(n=>window.__engine.getOperations().filter(o=>o.type==='stroke').length>n,before,{timeout:60000})
      drawMs=Date.now()-started
    }
    await fs.writeFile(`${out}/device-report.json`, JSON.stringify({ ...result, errors, drawMs }, null, 2))
    await page.screenshot({ path: `${out}/device.png` })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(JSON.stringify({ renderer: result.renderer, operationCount: result.operations.length, errors, drawMs }))
  } catch(error) { await page.screenshot({path:`${out}/device-failure.png`,timeout:5000}).catch(()=>{}); await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,httpErrors,body:await page.locator('body').innerText({timeout:5000}).catch(()=>''),engine:await page.evaluate(()=>({engine:!!window.__engine,store:!!window.__roomStore})).catch(()=>null)},null,2)); throw error } finally { await context.close(); await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
