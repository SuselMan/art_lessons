// Standalone hardware-GPU witness; run with NODE_PATH pointing to an existing Playwright installation.
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
async function main() {
  const out = process.env.QA_OUTPUT
  if (!out || !process.env.QA_ROOM_ID) throw new Error('QA_OUTPUT and QA_ROOM_ID required')
  await fs.mkdir(out, { recursive: true })
  const browser = await chromium.launch({ headless: process.env.QA_HEADLESS === '1', executablePath: process.env.QA_CHROME || undefined, args: ['--no-sandbox'], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } })
  const context = await browser.newContext({ baseURL: process.env.QA_URL || 'http://127.0.0.1:53860', viewport: { width: 1365, height: 900 } })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`/room/${process.env.QA_ROOM_ID}`)
    await page.locator('form input[type="text"]').first().fill('GPU witness')
    await page.locator('form button[type="submit"]').click()
    await page.waitForFunction(() => window.__engine && getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none', { timeout: 90000 })
    const result = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl'), ext = gl.getExtension('WEBGL_debug_renderer_info')
      const blob = await window.__engine.exportPNG()
      return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), width: canvas.width, height: canvas.height, operations: window.__engine.getOperations().map(o => o.id), png: Array.from(new Uint8Array(await blob.arrayBuffer())) }
    })
    await fs.writeFile(`${out}/device-export.png`, Buffer.from(result.png))
    delete result.png
    await fs.writeFile(`${out}/device-report.json`, JSON.stringify({ ...result, errors }, null, 2))
    await page.screenshot({ path: `${out}/device.png` })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(JSON.stringify({ renderer: result.renderer, operationCount: result.operations.length, errors }))
  } finally { await context.close(); await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
