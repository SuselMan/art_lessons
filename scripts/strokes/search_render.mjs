// Isolated, persistent-browser clean replay for human-ranked experiments.
// No rooms, checkpoints, source mutations or server writes.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright')
const [inputFile, output, variant = 'baseline'] = process.argv.slice(2)
const input = JSON.parse(readFileSync(inputFile, 'utf8'))
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-certificate-errors'] })
const reports = []
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let replacements = 0
  if (variant === 'landing-rich') {
    await page.route('**/src/engine/src/presets/watercolorPresets.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const pattern = /WATERCOLOR_START_EXCESS_BASE = 2(?:\.0)?\b/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one landing-pigment constant, got ' + matches.length)
      replacements++
      await route.fulfill({ response, body: body.replace(pattern, 'WATERCOLOR_START_EXCESS_BASE = 5') })
    })
  }
  if (variant === 'brush-step-short') {
    await page.route('**/src/engine/index.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const pattern = /contact\.radius \* 0?\.65\s*\/\s*S/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one compiled contact-step constant, got ' + matches.length)
      replacements++
      await route.fulfill({ response, body: body.replace(pattern, 'contact.radius * 0.3 / S') })
    })
  }
  await page.addInitScript(({ variant }) => {
    const proto = WebGLRenderingContext.prototype
    const original = proto.shaderSource
    window.__searchShaderReplacements = 0
    proto.shaderSource = function(shader, source) {
      if (variant === 'brush-mix-low' && source.includes('float mixFraction = 0.18 *')) {
        const before = 'float mixFraction = 0.18 * max(donor - neighbour, 0.0) / max(donor, 1e-4);'
        if (source.split(before).length !== 2) throw Error('Unexpected brush mixing shader')
        source = source.replace(before, before.replace('0.18', '0.06'))
        window.__searchShaderReplacements++
      }
      return original.call(this, shader, source)
    }
  }, { variant })
  await page.goto(process.env.APP_URL || 'https://localhost:5277/create')
  await page.evaluate(async () => { window.__searchEngineClass = (await import('/src/engine/index.ts')).PencilEngine })
  for (const test of input.cases) {
    const result = await page.evaluate(async test => {
      const started = performance.now()
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700
      document.body.append(canvas)
      const e = new window.__searchEngineClass(canvas, { pageWidth: 3508, pageHeight: 2480, paper: 'medium', userId: 'search' })
      let draws = 0
      const draw = e.gl.drawArrays.bind(e.gl)
      e.gl.drawArrays = (...args) => { if (e.gl.getParameter(e.gl.CURRENT_PROGRAM) === e._brushDragProg) draws++; return draw(...args) }
      const idle = async () => {
        const start = performance.now()
        while (e._settle || e._opQueue.length || e._rebuildJobs.size || e._pendingRebuilds.size) {
          if (performance.now() - start > 180000) throw Error('Settle timeout')
          await new Promise(r => setTimeout(r, 16))
        }
      }
      try {
        await e.paperReady()
        const layers = [...new Set(test.ops.map(op => op.layerId))]
        layers.forEach(id => e.initLayer(id))
        e.setCompositeOrder(layers.map(id => ({ id, opacity: 1 })))
        const ready = performance.now()
        for (const op of test.ops) { e.appendOperation(op, 'remote'); await idle() }
        await idle()
        const painted = performance.now()
        e.watercolorDryAll(); await idle()
        const dried = performance.now()
        const blob = await e.exportPNG(false)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        const ext = e.gl.getExtension('WEBGL_debug_renderer_info')
        const gpu = ext ? e.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : e.gl.getParameter(e.gl.RENDERER)
        const lost = e.gl.isContextLost(), error = e.gl.getError()
        if (lost || error) throw Error('GPU context/error ' + error)
        return { png: btoa(binary), gpu, draws, lost, error, shaderReplacements: window.__searchShaderReplacements,
                 timings: { setup: ready-started, paint: painted-ready, dry: dried-painted, export: performance.now()-dried } }
      } finally {
        e.destroy(); e.gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove()
      }
    }, test)
    const bytes = Buffer.from(result.png, 'base64'); delete result.png
    writeFileSync(output + '/' + test.id + '.png', bytes)
    result.id = test.id; result.variant = variant; result.pngSha256 = createHash('sha256').update(bytes).digest('hex')
    reports.push(result)
    writeFileSync(output + '/report.json', JSON.stringify({ base: input.base, variant, replacements, errors, cases: reports }, null, 2))
    console.log(JSON.stringify(result))
  }
  // Vite may request both the HMR URL and the plain import URL. Every response
  // is checked above for exactly one replacement; at least one must be served.
  if (variant === 'brush-step-short' && replacements < 1) throw Error('Contact patch not applied')
  if (variant === 'landing-rich' && replacements < 1) throw Error('Landing patch not applied')
  if (variant === 'brush-mix-low' && !reports.every(r => r.shaderReplacements > 0)) throw Error('Shader patch not reached')
  if (errors.length) throw Error('Browser errors ' + errors.join('; '))
  writeFileSync(output + '/report.json', JSON.stringify({ base: input.base, variant, replacements, errors, complete: true, cases: reports }, null, 2))
} finally { await browser.close() }
