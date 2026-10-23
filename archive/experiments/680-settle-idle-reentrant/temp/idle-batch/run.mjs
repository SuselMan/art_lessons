import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
if (process.env.IDLE_GPU_SLOT !== 'granted') throw Error('Root GPU slot required')
if (!process.env.APP_URL) throw Error('Frozen candidate URL required')
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(process.argv[2] || here + '/results')
mkdirSync(out, { recursive: true })
const manifest = JSON.parse(readFileSync(here + '/source-manifest.json', 'utf8'))
for (const [file, hash] of Object.entries(manifest.files)) if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash) throw Error('Frozen source mismatch: ' + file)
const { chromium } = createRequire(process.cwd() + '/package.json')('playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-certificate-errors'] })
let timer
const results = []
try {
  for (const enabled of [false, true]) {
    const label = enabled ? 'on' : 'off'
    timer = setTimeout(() => browser.close().catch(() => {}), 120000)
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => { errors.push(error.stack || error.message); writeFileSync(out + '/' + label + '.errors.json', JSON.stringify(errors)) })
    const stage = name => { const p = { stage: name, label, at: new Date().toISOString(), source: manifest.sourceCommit }; writeFileSync(out + '/phase.json', JSON.stringify(p)); console.log(JSON.stringify(p)) }
    stage('create')
    await page.goto(process.env.APP_URL + '/create'); await page.waitForTimeout(2500)
    await page.locator('input[type="text"]').first().fill('idle batch source parity')
    await page.getByRole('button', { name: /Medium/ }).first().click()
    const a2 = page.getByText('A2', { exact: true }).first(); await a2.click(); await a2.click()
    await page.getByRole('button', { name: /Create project|Создать проект/ }).click()
    await page.waitForURL(/\/room\/[^/]+$/); await page.waitForFunction(() => !!window.__engine); await page.waitForTimeout(1000)
    const passport = await page.evaluate(() => { const e = window.__engine, gl = e.gl, d = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '', flags: Object.fromEntries(['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy','diagnosticWaterPolicy','diagnosticForeignSolvent'].map(k => [k,e._ribbonPainter[k]])), page: e._pageSize() } })
    const expected={diagnosticSegmentDelivery:'combined',diagnosticPigmentRecord:true,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticSolventField:true,diagnosticCanonicalSettleRadius:true,diagnosticLandingPolicy:'fluid',diagnosticWaterPolicy:'bottomless',diagnosticForeignSolvent:true};for(const [key,value]of Object.entries(expected))if(passport.flags[key]!==value)throw Error('Actual review flag mismatch: '+key)
    if (!/AMD|Radeon|Vega/i.test(passport.renderer) || /SwiftShader|llvmpipe/i.test(passport.renderer)) throw Error('Actual AMD required')
    await page.evaluate(readFileSync(here + '/fixedFixture.js', 'utf8')); await page.evaluate(readFileSync(here + '/canonicalProbe.js', 'utf8'))
    stage('fixed-source-settle')
    const timing = await page.evaluate(flag => window.__queueFixedFixture(flag), enabled)
    stage('post-idle-canonical')
    const canonical = await page.evaluate(() => window.__idleBatchCanonical())
    if (canonical.gl || canonical.lost || errors.length || !canonical.hashes.some(h => h.key === 'inkLoad' && h.sum[2] > 0)) throw Error('Actual GL/nonempty canonical gate failed')
    const result = { passport, timing, canonical, errors, source: manifest.sourceCommit }
    results.push(result); writeFileSync(out + '/' + label + '.json', JSON.stringify(result, null, 2))
    const png = await page.evaluate(async () => { const blob = await window.__engine.exportPNG(true); if (!blob) throw Error('null PNG'); return Array.from(new Uint8Array(await blob.arrayBuffer())) })
    writeFileSync(out + '/' + label + '.png', Buffer.from(png))
    stage('finished'); await context.close(); clearTimeout(timer)
  }
  const sourceExact = JSON.stringify(results[0].canonical.sourceOps) === JSON.stringify(results[1].canonical.sourceOps)
  const fieldsExact = JSON.stringify(results[0].canonical.hashes) === JSON.stringify(results[1].canonical.hashes)
  const pngExact = readFileSync(out + '/off.png').equals(readFileSync(out + '/on.png'))
  writeFileSync(out + '/comparison.json', JSON.stringify({ sourceExact, fieldsExact, pngExact, source: manifest.sourceCommit }))
  if (!sourceExact || !fieldsExact || !pngExact) throw Error('OFF/ON canonical source or pixels differ')
} catch (error) { writeFileSync(out + '/runner-error.json', JSON.stringify({ message: String(error), stack: error.stack })); throw error }
finally { clearTimeout(timer); await browser.close(); console.log('OWNED_CHROME_CLOSED') }
