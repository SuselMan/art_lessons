import WebSocket from 'ws'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9238'
const salt = `qa_cold_${Date.now()}`
const url = `https://192.168.1.70:5308/room/hHDBT4c4?qa=${salt}`
const out = 'temp/device-runs/samsung-cold-compile.json'
const report = { source: '3d582373; engine/shader SHA equal production 16c096af', salt, url, errors: [] }
let target, ws, seq = 0
const pending = new Map()
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout ${method}`)) }, 15000)
  pending.set(id, { resolve, reject, timer })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const wait = async expression => {
  for (let i = 0; i < 140; i++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw Error(`Condition timeout: ${expression}`)
}
const wall = setTimeout(() => {
  report.wallTimeout = true
  if (target) void fetch(`${base}/json/close/${target.id}`)
}, 120000)
try {
  execFileSync('/home/suselman/.local/bin/home-devices', ['adb', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', 'com.android.chrome'], { timeout: 15000 })
  for (let i = 0; i < 40 && !target; i++) {
    const pages = await (await fetch(`${base}/json/list`)).json()
    target = pages.find(page => page.url === url)
    if (!target) await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!target) throw Error('Owned exact URL target unavailable')
  report.targetId = target.id
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  ws.on('message', data => {
    const result = JSON.parse(data)
    if (result.id && pending.has(result.id)) {
      const call = pending.get(result.id)
      clearTimeout(call.timer); pending.delete(result.id)
      result.error ? call.reject(Error(result.error.message)) : call.resolve(result.result)
    } else if (result.method === 'Runtime.exceptionThrown') report.errors.push(result.params.exceptionDetails.text)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  const source = `(() => {
    const salt = ${JSON.stringify(salt)};
    const stats = window.__coldCompile = { saltedSources: 0, links: [], lostEvents: 0 };
    document.addEventListener('webglcontextlost', () => stats.lostEvents++, true);
    const prototype = WebGLRenderingContext.prototype;
    const shaderSource = prototype.shaderSource;
    prototype.shaderSource = function(shader, source) { stats.saltedSources++; return shaderSource.call(this, shader, '// '+salt+'\\n'+source); };
    const linkProgram = prototype.linkProgram;
    prototype.linkProgram = function(program) { const before = performance.now(); linkProgram.call(this, program); const linked = this.getProgramParameter(program, this.LINK_STATUS); stats.links.push({ linked, ms: performance.now()-before, log: linked ? '' : this.getProgramInfoLog(program) }); };
  })();`
  await send('Page.addScriptToEvaluateOnNewDocument', { source })
  await send('Page.reload', { ignoreCache: true })
  await wait('!!window.__engine || !!document.querySelector("form input[type=text]")')
  if (await evaluate('!!document.querySelector("form input[type=text]")')) {
    await evaluate(`(() => {const input=document.querySelector('form input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Samsung cold compile QA');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
    await evaluate('document.querySelector("form button[type=submit]").click()')
  }
  await wait('!!window.__engine')
  await evaluate('__engine.paperReady()')
  await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
  report.result = await evaluate(`(() => {const e=__engine,g=e.gl,x=g.getExtension('WEBGL_debug_renderer_info');return{...__coldCompile,renderer:x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),paperLoaded:e._paper.loaded,gl:g.getError(),lost:g.isContextLost(),visibility:document.visibilityState,canvas:[e.canvas.width,e.canvas.height],ops:e.getOperations().length};})()`)
  const r = report.result
  report.pass = r.renderer.includes('Adreno') && r.saltedSources >= 2 && r.links.length > 10 && r.links.every(link => link.linked) && !r.lostEvents && !r.gl && !r.lost && r.paperLoaded && !report.errors.length
  if (!report.pass) throw Error('Cold compile oracle failed')
} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(wall)
  save()
  if (ws) ws.close()
  if (target) { await fetch(`${base}/json/close/${target.id}`); report.ownTargetClosed = true; save() }
}
console.log(JSON.stringify({ pass: report.pass, targetId: report.targetId, ownTargetClosed: report.ownTargetClosed, result: report.result, error: report.error }))
