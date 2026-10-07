/** Logic/API gate with software Dawn only. Never use these timings as device performance. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const directory = path.resolve(process.env.WC_WEBGPU_BUNDLE || 'temp/webgpu-poc-dist')
const out = path.resolve(process.env.WC_WEBGPU_OUTPUT || 'temp/webgpu-poc')
fs.mkdirSync(out, { recursive: true })
const server = http.createServer((req, res) => {
  const file = path.resolve(directory, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!file.startsWith(directory + '/')) { res.writeHead(403).end(); return }
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream')
    res.end(fs.readFileSync(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan', '--disable-vulkan-surface'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const result = { softwareOnly: true, errors }
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/webgpu-poc.html`)
  await page.getByRole('button', { name: 'Dense zigzag', exact: true }).click({ timeout: 15000 })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.evaluate(() => window.__watercolorGpuPoc.whenIdle())
  await page.getByRole('button', { name: 'Check replay bytes', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.startsWith('Same-device replay:'), null, { timeout: 30000 })
  result.replay = await page.locator('[role=status]').textContent()
  result.field = await page.evaluate(async () => {
    const state = await window.__watercolorGpuPoc.readState()
    let mass = 0, mobile = 0, water = 0, negative = 0
    for (let k = 0; k < state.length; k += 16) {
      mass += state[k + 3] + state[k + 7]; mobile += state[k + 3]; water += state[k + 8]
      for (let c = 0; c < 9; c++) if (!Number.isFinite(state[k + c]) || state[k + c] < -1e-6) negative++
    }
    const pixels = await window.__watercolorGpuPoc.readPixels()
    let colored = 0
    for (let k = 0; k < pixels.rgba.length; k += 4) if (Math.max(...pixels.rgba.subarray(k, k + 3)) - Math.min(...pixels.rgba.subarray(k, k + 3)) > 10) colored++
    const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.rgba), canvas.width, canvas.height), 0, 0)
    document.body.append(canvas)
    return { mass, mobile, water, negative, colored, readbackPng: canvas.toDataURL() }
  })
  fs.writeFileSync(path.join(out, 'software-render.png'), Buffer.from(result.field.readbackPng.split(',')[1], 'base64'))
  delete result.field.readbackPng
  result.oracle = await page.evaluate(() => window.__watercolorGpuPoc.checkOracle())
  await page.getByRole('button', { name: 'Dry all', exact: true }).click()
  result.dry = await page.evaluate(async () => {
    const state = await window.__watercolorGpuPoc.readState()
    let mobile = 0, water = 0, mass = 0
    for (let k = 0; k < state.length; k += 16) { mobile += state[k + 3]; water += state[k + 8]; mass += state[k + 7] }
    return { mobile, water, mass }
  })
  await page.getByRole('button', { name: 'Check replay bytes', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.startsWith('Same-device replay:'), null, { timeout: 30000 })
  result.dryReplay = await page.locator('[role=status]').textContent()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.startsWith('Prototype undo'), null, { timeout: 30000 })
  result.undoMass = await page.evaluate(async () => { const state = await window.__watercolorGpuPoc.readState(); let mass = 0; for (let k = 0; k < state.length; k += 16) mass += state[k + 3] + state[k + 7]; return mass })
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.startsWith('Replay complete:'), null, { timeout: 30000 })
  result.redoMass = await page.evaluate(async () => { const state = await window.__watercolorGpuPoc.readState(); let mass = 0; for (let k = 0; k < state.length; k += 16) mass += state[k + 3] + state[k + 7]; return mass })
  result.metrics = await page.evaluate(() => ({ ...window.__watercolorGpuPoc.metrics, timings: window.__watercolorGpuPoc.timingSummary }))
  result.pass = errors.length === 0 && result.replay.includes('0 different floats') && result.dryReplay.includes('0 different floats') && result.field.mass > 100 && result.field.colored > 1000 && result.field.negative === 0 && result.oracle.pass && result.dry.mobile === 0 && result.dry.water === 0 && result.undoMass === 0 && result.redoMass === result.dry.mass
} catch (error) { result.pass = false; result.error = String(error) }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(out, 'software-report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); if (!result.pass) process.exitCode = 1 }
