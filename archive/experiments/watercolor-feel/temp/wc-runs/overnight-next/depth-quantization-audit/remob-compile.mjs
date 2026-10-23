// Isolated, persistent-browser clean replay for human-ranked experiments.
// No rooms, checkpoints, source mutations or server writes.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim()
const sourceFiles = ['apps/web/src/engine/index.ts','apps/web/src/engine/src/raster/shaders.ts','apps/web/src/engine/src/presets/watercolorPresets.ts','apps/web/src/engine/src/watercolor/brushDrag.ts','apps/web/src/engine/src/raster/WatercolorSettlePlan.ts','apps/web/src/engine/src/raster/WatercolorPasses.ts','apps/web/src/engine/src/dabs/RibbonStrokePainter.ts','apps/web/src/engine/src/watercolor/wetDiffusion.ts','apps/web/src/engine/src/dabs/markerRibbon.ts']
const sourceSha256 = Object.fromEntries(sourceFiles.filter(f => existsSync(f)).map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]))
const { chromium } = createRequire(process.cwd() + '/package.json')('playwright')
const [inputFile, output, variantArg = 'baseline'] = process.argv.slice(2)
if (variantArg !== 'baseline' && process.env.QA_ALLOW_PATCHES !== '1') throw Error('Release source verification must use baseline/no runtime patches')
const experiment = variantArg.endsWith('.json') ? JSON.parse(readFileSync(variantArg, 'utf8')) : null
const experimentSha256 = experiment ? createHash('sha256').update(readFileSync(variantArg)).digest('hex') : null
const candidateId = experiment?.id || variantArg
const variant = experiment?.runtimePatches ? experiment.parent || 'baseline' : candidateId
const runtimePatches = experiment?.runtimePatches || []
for (const patch of runtimePatches) {
  if (!['vite-module-exact', 'vite-module-regex', 'shader-exact'].includes(patch.kind)) throw Error('Unknown runtime patch kind ' + patch.kind)
  if (patch.kind === 'shader-exact') patch.selector ||= patch.before
  // Historical metadata called this regex, but sourcePattern is literal source.
  if (patch.kind === 'vite-module-regex') { patch.before = patch.sourcePattern; patch.after = patch.replacement }
  if (!patch.before || typeof patch.after !== 'string') throw Error('Invalid runtime patch')
}
const validVariants = new Set(['baseline', 'landing-rich', 'brush-step-short', 'brush-mix-low', 'pool-color-sync', 'tide-body', 'pool-structure', 'pool-structure-soft', 'combined-soft', 'combined-gentle', 'gentle-directional', 'gentle-turn-trail'])
if (variant !== 'baseline') throw Error('New source search requires baseline parent, no historical builtins');
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
      return original.call(this, shader, "// remob18-realcompile-20261005-unique-v2\n"+source)
    }
  }, { variant, runtimePatches })
  await page.goto(process.env.APP_URL || 'https://localhost:5288/create')
  await page.evaluate(async () => { window.__searchEngineClass = (await import('/src/engine/index.ts')).PencilEngine })
  const result=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;document.body.append(canvas);const e=new window.__searchEngineClass(canvas,{pageWidth:128,pageHeight:128,paper:'medium',userId:'compileaudit'});await e.paperReady();const p=e._watercolorPasses||e;const status={};for(const key of ['_fieldOpProg','_fieldOpHighProg']){const program=p[key];status[key]={present:!!program,link:program?e.gl.getProgramParameter(program,e.gl.LINK_STATUS):false,log:program?e.gl.getProgramInfoLog(program):null};}const result={status,error:e.gl.getError(),lost:e.gl.isContextLost(),shaderCounts:window.__searchCustomReplacements};e.destroy();e.gl.getExtension('WEBGL_lose_context')?.loseContext();return result;});
  writeFileSync(output+'/compile-report.json',JSON.stringify({sourceCommit,sourceSha256,experimentSha256,modulePatchCounts,result,errors},null,2));
} finally {await browser.close()}
