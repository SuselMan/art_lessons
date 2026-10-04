// Isolated, persistent-browser clean replay for human-ranked experiments.
// No rooms, checkpoints, source mutations or server writes.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright')
const [inputFile, output, variantArg = 'baseline'] = process.argv.slice(2)
const experiment = variantArg.endsWith('.json') ? JSON.parse(readFileSync(variantArg, 'utf8')) : null
const experimentSha256 = experiment ? createHash('sha256').update(readFileSync(variantArg)).digest('hex') : null
const candidateId = experiment?.id || variantArg
const variant = experiment?.runtimePatches ? experiment.parent || 'combined-gentle' : candidateId
const runtimePatches = experiment?.runtimePatches || []
for (const patch of runtimePatches) {
  if (!['vite-module-exact', 'vite-module-regex', 'shader-exact'].includes(patch.kind)) throw Error('Unknown runtime patch kind ' + patch.kind)
  if (patch.kind === 'shader-exact') patch.selector ||= patch.before
  // Historical metadata called this regex, but sourcePattern is literal source.
  if (patch.kind === 'vite-module-regex') { patch.before = patch.sourcePattern; patch.after = patch.replacement }
  if (!patch.before || typeof patch.after !== 'string') throw Error('Invalid runtime patch')
}
const validVariants = new Set(['baseline', 'landing-rich', 'brush-step-short', 'brush-mix-low', 'pool-color-sync', 'tide-body', 'pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail'])
if (!validVariants.has(variant)) throw Error('Unknown experiment variant: ' + variant)
const input = JSON.parse(readFileSync(inputFile, 'utf8'))
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-certificate-errors'] })
const reports = []
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let replacements = 0
  const modulePatchCounts = runtimePatches.map(() => 0)
  const fulfillPatched = async (route, response, body) => {
    const pathname = new URL(route.request().url()).pathname
    for (const [i, patch] of runtimePatches.entries()) {
      if (patch.kind === 'shader-exact' || pathname !== patch.module) continue
      const count = body.split(patch.before).length - 1
      if (count !== (patch.countPerResponse || 1)) throw Error('Module patch ' + i + ' expected ' + (patch.countPerResponse || 1) + ', got ' + count)
      body = body.split(patch.before).join(patch.after)
      modulePatchCounts[i]++
    }
    await route.fulfill({ response, body })
  }
  for (const module of new Set(runtimePatches.filter(p => p.kind !== 'shader-exact').map(p => p.module))) {
    await page.route('**' + module + '*', async route => {
      const response = await route.fetch()
      await fulfillPatched(route, response, await response.text())
    })
  }
  const landingVariants = ['landing-rich', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail']
  const structureVariants = ['pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail']
  if (landingVariants.includes(variant) || variant === 'tide-body') {
    await page.route('**/src/engine/src/presets/watercolorPresets.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const pattern = landingVariants.includes(variant)
        ? /WATERCOLOR_START_EXCESS_BASE = 2(?:\.0)?\b/g
        : /WC_TIDE_RIM = 0?\.4\b/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one ' + variant + ' constant, got ' + matches.length)
      replacements++
      let patched = body.replace(pattern, landingVariants.includes(variant) ? 'WATERCOLOR_START_EXCESS_BASE = 5' : 'WC_TIDE_RIM = 0')
      if (variant === 'gentle-turn-trail') {
        const edits = [
          [/WC_SLOW_RUN_RADII = 0?\.8\b/g, 'WC_SLOW_RUN_RADII = 2.4'],
          [/WC_SLOW_GAIN = 0?\.8\b/g, 'WC_SLOW_GAIN = 0.2666666667'],
          [/Math\.min\(0?\.65, previous \+ 0?\.2 \* turn \* pigmentGate\)/g, 'Math.min(0.2166666667, previous + 0.0666666667 * turn * pigmentGate)'],
        ]
        for (const [pattern, after] of edits) {
          if ((patched.match(pattern) || []).length !== 1) throw Error('Turn trail pattern not unique: ' + pattern)
          patched = patched.replace(pattern, after)
        }
      }
      await fulfillPatched(route, response, patched)
    })
  }
  if (variant === 'pool-color-sync') {
    await page.route('**/src/engine/index.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      // The colour stamp currently receives water puddle level here while
      // the matching deposit stamp receives pigmentPoolByDab. Use one pool
      // multiplier for both records, as the ribbon-band path already does.
      const pattern = /puddleByDab\.get\(drawable\[i\]\)\s*\?\?\s*1,\s*poolBlot/g
      const matches = body.match(pattern) || []
      if (matches.length !== 1) throw Error('Expected one colour-stamp pool argument, got ' + matches.length)
      replacements++
      await fulfillPatched(route, response, body.replace(pattern, 'pigmentPoolByDab.get(drawable[i]) ?? 0.5, poolBlot'))
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
      await fulfillPatched(route, response, body.replace(pattern, 'contact.radius * 0.3 / S'))
    })
  }
  await page.addInitScript(({ variant, runtimePatches }) => {
    const proto = WebGLRenderingContext.prototype
    const original = proto.shaderSource
    window.__searchShaderReplacements = 0
    window.__searchDirectionalReplacements = 0
    window.__searchCustomReplacements = runtimePatches.map(() => 0)
    proto.shaderSource = function(shader, source) {
      if (variant === 'brush-mix-low' && source.includes('float mixFraction = 0.18 *')) {
        const before = 'float mixFraction = 0.18 * max(donor - neighbour, 0.0) / max(donor, 1e-4);'
        if (source.split(before).length !== 2) throw Error('Unexpected brush mixing shader')
        source = source.replace(before, before.replace('0.18', '0.06'))
        window.__searchShaderReplacements++
      }
      if (variant === 'gentle-directional' && source.includes('float mixFraction = 0.18 *')) {
        const edits = [
          ['float mixFraction = 0.18 *', 'float mixFraction = 0.08 *'],
          ['float amount = (0.18 * max(dot(velocity, direction), 0.0)', 'float amount = (0.42 * max(dot(velocity, direction), 0.0)'],
        ]
        for (const [before, after] of edits) {
          if (source.split(before).length !== 2) throw Error('Directional shader replacement not unique')
          source = source.replace(before, after)
        }
        window.__searchDirectionalReplacements++
      }
      if (['pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail'].includes(variant) && source.includes('float wcPoolBlot(')) {
        const before = /float wcPoolBlot\(vec2 wp, vec2 seed, float puddle, float paperWet, float on\) \{[\s\S]*?\n  \}/g
        if ((source.match(before) || []).length !== 1) throw Error('Expected one pool-blot function per shader')
        const soft = variant === 'pool-structure-soft' || variant === 'combined-soft'
        const gentle = ['combined-gentle', 'gentle-directional', 'gentle-turn-trail'].includes(variant)
        source = source.replace(before, `float wcPoolBlot(vec2 wp, vec2 seed, float puddle, float paperWet, float on) {
    float pool = on * mix(${gentle ? '0.15' : soft ? '0.35' : '0.65'}, 1.0, smoothstep(0.5, 0.95, puddle));
    if (pool <= 0.0) return 1.0;
    float n = wcFbm(wp * ${soft || gentle ? '0.03' : '0.018'} + seed * 1.7 + vec2(13.0, 5.0));
    return mix(1.0, ${gentle ? '0.7 + 0.6 * smoothstep(0.3, 0.7, n)' : soft ? '0.4 + 1.2 * smoothstep(0.3, 0.7, n)' : '0.08 + 1.84 * smoothstep(0.38, 0.62, n)'}, pool);
  }`)
        window.__searchShaderReplacements++
      }
      for (const [i, patch] of runtimePatches.entries()) {
        if (patch.kind !== 'shader-exact' || !source.includes(patch.selector)) continue
        const count = source.split(patch.before).length - 1
        if (count !== (patch.countPerShader || 1)) throw Error('Shader patch ' + i + ' expected ' + (patch.countPerShader || 1) + ', got ' + count)
        source = source.split(patch.before).join(patch.after)
        window.__searchCustomReplacements[i]++
      }
      return original.call(this, shader, source)
    }
  }, { variant, runtimePatches })
  await page.goto(process.env.APP_URL || 'https://localhost:5277/create')
  await page.evaluate(async () => { window.__searchEngineClass = (await import('/src/engine/index.ts')).PencilEngine })
  for (const test of input.cases) {
    const result = await page.evaluate(async test => {
      const started = performance.now()
      const shaderReplacementsBefore = window.__searchShaderReplacements
      const directionalBefore = window.__searchDirectionalReplacements
      const customBefore = [...window.__searchCustomReplacements]
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700
      document.body.append(canvas)
      const e = new window.__searchEngineClass(canvas, { pageWidth: 3508, pageHeight: 2480, paper: 'medium', userId: 'search' })
      let draws = 0
      const programDraws = { brush: 0, diffuse: 0, fieldHigh: 0 }
      const fieldHighModes = {}
      const draw = e.gl.drawArrays.bind(e.gl)
      e.gl.drawArrays = (...args) => {
        const program = e.gl.getParameter(e.gl.CURRENT_PROGRAM)
        if (program === e._brushDragProg) { draws++; programDraws.brush++ }
        if (program === e._diffuseProg) programDraws.diffuse++
        if (program === e._fieldOpHighProg) {
          programDraws.fieldHigh++
          if (e._fieldOpHighUni?.u_mode) {
            const mode = e.gl.getUniform(program, e._fieldOpHighUni.u_mode)
            fieldHighModes[mode] = (fieldHighModes[mode] || 0) + 1
          }
        }
        return draw(...args)
      }
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
        return { png: btoa(binary), gpu, draws, programDraws, fieldHighModes, lost, error, shaderReplacements: window.__searchShaderReplacements - shaderReplacementsBefore,
                 directionalReplacements: window.__searchDirectionalReplacements - directionalBefore,
                 customReplacements: window.__searchCustomReplacements.map((n, i) => n - customBefore[i]),
                 timings: { setup: ready-started, paint: painted-ready, dry: dried-painted, export: performance.now()-dried } }
      } finally {
        e.destroy(); e.gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove()
      }
    }, test)
    const bytes = Buffer.from(result.png, 'base64'); delete result.png
    writeFileSync(output + '/' + test.id + '.png', bytes)
    result.id = test.id; result.variant = candidateId; result.pngSha256 = createHash('sha256').update(bytes).digest('hex')
    reports.push(result)
    writeFileSync(output + '/report.json', JSON.stringify({ base: input.base, variant: candidateId, parent: variant, experimentSha256, modulePatchCounts, replacements, errors, complete: false, cases: reports }, null, 2))
    console.log(JSON.stringify(result))
  }
  // Vite may request both the HMR URL and the plain import URL. Every response
  // is checked above for exactly one replacement; at least one must be served.
  if (variant === 'brush-step-short' && replacements < 1) throw Error('Contact patch not applied')
  if (landingVariants.includes(variant) && replacements < 1) throw Error('Landing patch not applied')
  if (variant === 'pool-color-sync' && replacements < 1) throw Error('Colour pool patch not applied')
  if (variant === 'tide-body' && replacements < 1) throw Error('Tide patch not applied')
  if (variant === 'brush-mix-low' && !reports.every(r => r.shaderReplacements > 0)) throw Error('Shader patch not reached')
  if (structureVariants.includes(variant) && !reports.every(r => r.shaderReplacements > 0)) throw Error('Pool shader patch not reached')
  if (variant === 'gentle-directional' && !reports.every(r => r.directionalReplacements > 0 && r.draws > 0)) throw Error('Directional shader/draw not reached')
  for (const [i, patch] of runtimePatches.entries()) {
    if (patch.kind === 'shader-exact' ? !reports.every(r => r.customReplacements[i] > 0) : modulePatchCounts[i] < 1) throw Error('Custom patch not reached ' + i)
  }
  if (errors.length) throw Error('Browser errors ' + errors.join('; '))
  writeFileSync(output + '/report.json', JSON.stringify({ base: input.base, variant: candidateId, parent: variant, experimentSha256, modulePatchCounts, replacements, errors, complete: true, cases: reports }, null, 2))
} finally { await browser.close() }
