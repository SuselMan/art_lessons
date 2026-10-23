// Ilya's repeats of the archive's strokes, rendered clean by the engine of
// this checkout (#536).
//
//   node scripts/strokes/app_render.mjs <ops.json> <out.png>
//
// <ops.json> is a room's operation log (psql: jsonb_agg(data order by seq)
// from "Operation"). A fresh A2 landscape room is made on the local dev stack
// (https://localhost:5277, dev build - it has window.__engine), the log is
// appended op by op as remote operations - strokes, undo, clear, layers; not
// the reference photo - and once the paint has settled, every layer that
// carries strokes is exported together. Opening the room itself would not do:
// a room comes back from its checkpoint, so the old strokes would keep the
// engine version they were painted with.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const { chromium } = createRequire(process.env.GALLERY_NODE_REQUIRE || process.cwd()+'/package.json')('playwright')

const [opsFile, out] = process.argv.slice(2)
const base = process.env.APP_URL || 'https://localhost:5301'
if(process.env.GALLERY_GPU_SLOT!=='granted')throw Error('Explicit gallery GPU slot required')
const ops = JSON.parse(readFileSync(opsFile, 'utf8')).filter(o => o.type !== 'image_import')
const strokeLayers = [...new Set(ops.filter(o => o.type === 'stroke').map(o => o.layerId))]

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
let page,progressTimer,nativeBatchSkipped=[],errors=[],glWarnings=[],failedRequests=[]
const phase=(stage,details={})=>{const value={stage,at:new Date().toISOString(),...details};writeFileSync(out+'.phase.json',JSON.stringify(value,null,2));console.log('PHASE',JSON.stringify(value))}
phase('start',{ops:ops.length})
const watchdog=setTimeout(()=>browser.close().catch(()=>{}),900000)
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  page = await ctx.newPage()
  page.on('console', m => { if (/WebGL|GL_|context lost|GPU/i.test(m.text()) && glWarnings.length < 10) glWarnings.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)failedRequests.push({url:r.url(),status:r.status()})});
  phase('create');await page.goto(`${base}/create`)
  await page.waitForTimeout(2500) // the form fills its saved defaults after load
  await page.locator('input[type="text"]').first().fill('strokes-app')
  await page.getByRole('button', { name: /Medium/ }).first().click()
  // A2, then once more to turn it landscape (3508 x 2480, the boards' size).
  const a2 = page.getByText('A2', { exact: true }).first()
  await a2.click()
  await a2.click()
  await page.getByRole('button', { name: /Create project|Создать проект/ }).click()
  await page.waitForURL(/\/room\/[^/]+$/)
  phase('room',{url:page.url()});await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 60_000 })
  await page.waitForTimeout(2500)
  const flags=await page.evaluate(()=>{const p=window.__engine._ribbonPainter;return Object.fromEntries(['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy','diagnosticWaterPolicy','diagnosticForeignSolvent'].map(k=>[k,p[k]]))})
  const expected={diagnosticSegmentDelivery:'combined',diagnosticPigmentRecord:true,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticSolventField:true,diagnosticCanonicalSettleRadius:true,diagnosticLandingPolicy:'fluid',diagnosticWaterPolicy:'bottomless',diagnosticForeignSolvent:true}
  if(JSON.stringify(flags)!==JSON.stringify(expected))throw Error('Accepted source flags mismatch '+JSON.stringify(flags))
  if(process.env.GALLERY_NATIVE_BATCH==='1'){const skipped=await page.evaluate(async ops=>{const {undoneInBatch}=await import('/src/pages/Room/undoneInBatch.ts');const ids=undoneInBatch(ops);window.__engine.setUnpaintedInBatch(ids);return [...ids]},ops);nativeBatchSkipped=skipped;phase('native-batch',{skipped})}
  const model=await page.evaluate(({phase,fibres})=>{const e=window.__engine;e._settlePlan.diagnosticPlateauPhase=phase;e._wcGradientFibres=fibres;if(fibres)e._watercolorPasses.warmGradientFibres();return {phase:e._settlePlan.diagnosticPlateauPhase,fibres:e._wcGradientFibres,rebase:e._wcSourceFilmRebase,page:e._pageSize()}},{phase:process.env.GALLERY_RING_PHASE==='1',fibres:process.env.GALLERY_GRADIENT_FIBRES==='1'});if(model.page.w!==3508||model.page.h!==2480)throw Error('Physical gallery page mismatch '+JSON.stringify(model));phase('engine-ready',{flags,model});progressTimer=setInterval(async()=>{try{phase('progress',await page.evaluate(()=>({queue:window.__engine._opQueue.length,settleNext:window.__engine._settle?.next,settleLength:window.__engine._settle?.ops?.length,rebuild:window.__engine._rebuildJobs.size,pending:window.__engine._pendingRebuilds.size,lost:window.__engine.gl.isContextLost()})))}catch{}},15000);const opTimes=[];let n = 0,index=0
  for (const op of ops) {
    const opStarted=Date.now();await page.evaluate(op => { window.__engine.appendOperation(op, 'remote') }, op)
    opTimes.push({id:op.id,type:op.type,appendWallMs:Date.now()-opStarted});if (op.type === 'stroke') n++;index++;if(index%5===0)phase('append',{index,ops:ops.length,strokes:n})
    // Every operation, not only strokes, gets its step: an undo landing while
    // the stroke before it is still settling made the same log paint
    // differently run to run (sheet 1, slot 12 - #681).
    await page.waitForTimeout(+(process.env.APP_STEP || 400))
  }
  phase('dry-immediate');await page.evaluate(() => {const e=window.__engine;e.appendOperation({id:'gallery-final-dry-'+crypto.randomUUID(),type:'paper_dry',userId:'gallery-render',seq:e._log.entries.length,timestamp:Date.now()},'remote')});
  await page.waitForFunction(() => {const e=window.__engine;return !e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size}, undefined, {timeout:600000});
  phase('export');const png = await page.evaluate(async ids => {
    const e = window.__engine
    e.setCompositeOrder(ids.map(id => ({ id, opacity: 1 })))
    const b = await e.exportPNG(false)
    const buf = new Uint8Array(await b.arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192))
    return btoa(s)
  }, strokeLayers)
  writeFileSync(out, Buffer.from(png, 'base64'))
  const gpu = await page.evaluate(() => (() => {const gl=window.__engine.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');return {lost:gl.isContextLost(),error:gl.getError(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}})())
  const report={version:process.env.GALLERY_SOURCE_VERSION || 'combined-unlabelled',model,flags,nativeBatchSkipped,opTimes,strokes:n,layers:strokeLayers,errors:errors.slice(0,3),gpu,glWarnings,finished:new Date().toISOString(),room:page.url().split('/').pop()};writeFileSync(out+'.report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
  if (errors.length || gpu.lost || gpu.error) throw new Error('GPU render failed')
} catch (error) {
  writeFileSync(out+'.failure.json',JSON.stringify({errors,failedRequests,dom:page&&!page.isClosed()?await page.evaluate(()=>({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,1500)})).catch(()=>null):null},null,2));
  phase('failed',{message:String(error)});console.error('render failed', JSON.stringify({ url: page?.url() }))
  if (page) await page.screenshot({ path: out + '.failed.png', timeout: 5000 }).catch(() => {})
  throw error
} finally {
  if(process.env.GALLERY_NATIVE_BATCH==='1'&&page&&!page.isClosed())await page.evaluate(()=>window.__engine?.setUnpaintedInBatch(null)).catch(()=>{});phase('closing');clearInterval(progressTimer);clearTimeout(watchdog)
  await browser.close()
}
