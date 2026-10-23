// (#432) Pen-to-ink on prod: laptop Chrome (GPU) is the author, the Android
// tablet is the peer. Reads the tablet's window.__liveLatency.
//   node measure.mjs [strokes=30]
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const req = createRequire('/home/suselman/projects/pencil-agents/627-rest-bugs/package.json')
const { chromium } = req('playwright')
const WebSocket = req('ws')

const ADB = `${process.env.HOME}/tools/platform-tools/adb`
const DEV = process.env.TABLET ?? '192.168.1.36:38337'
const CDP_PORT = 9333
const STROKES = Number(process.argv[2] ?? 30)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const adb = (...args) => execFileSync(ADB, ['-s', DEV, ...args], { encoding: 'utf8' })

async function tabletPage(urlPart) {
  for (let i = 0; i < 30; i++) {
    const tabs = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json()
    const t = tabs.find(x => x.type === 'page' && x.url.includes(urlPart))
    if (t) return t
    await sleep(1000)
  }
  throw new Error('tablet tab not found')
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
  let n = 0
  const pending = new Map()
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
  const ready = new Promise(r => ws.on('open', r))
  return {
    ready,
    async eval(expression) {
      await ready
      const id = ++n
      const p = new Promise(r => pending.set(id, r))
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
      const d = await p
      if (d.result?.exceptionDetails) throw new Error(JSON.stringify(d.result.exceptionDetails).slice(0, 300))
      return d.result?.result?.value
    },
    close() { ws.close() },
  }
}

const out = { at: new Date().toISOString() }
adb('forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote')
adb('shell', 'svc', 'power', 'stayon', 'true')
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] })
let roomId
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('https://grafetto.com/create')
  await page.locator('form input[type="text"]').first().fill('latency-432 (temp)')
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/room\/[^/?#]+/, { timeout: 30000 })
  roomId = page.url().match(/\/room\/([^/?#]+)/)[1]
  const roomUrl = `https://grafetto.com/room/${roomId}`
  out.roomId = roomId
  await page.locator('canvas').first().waitFor({ timeout: 60000 })
  await page.waitForFunction(() => window.__liveLatency !== undefined, null, { timeout: 30000 })
  out.laptopBundleHasMeter = true

  // Tablet: open the room in the foreground (a background tab is frozen).
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${roomUrl}?t=${Date.now()}`, '-p', 'com.android.chrome')
  const tab = await tabletPage(roomId)
  let t = cdp(tab.webSocketDebuggerUrl)
  // A service worker may still serve the pre-deploy bundle: without the meter, reload once.
  if (!(await t.eval('window.__liveLatency !== undefined'))) {
    await t.eval('location.reload()').catch(() => {})
    t.close(); await sleep(6000)
    t = cdp((await tabletPage(roomId)).webSocketDebuggerUrl)
  }
  out.tabletUA = await t.eval('navigator.userAgent')
  out.tabletBundleHasMeter = await t.eval('window.__liveLatency !== undefined')
  // Join form, if the tablet is asked for a name.
  for (let i = 0; i < 20; i++) {
    const state = await t.eval(`(() => {
      const input = document.querySelector('form input[type="text"]')
      const submit = document.querySelector('form button[type="submit"]')
      if (input && submit) {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(input, 'Tablet'); input.dispatchEvent(new Event('input', { bubbles: true }))
        submit.click(); return 'joined-form'
      }
      return document.querySelector('canvas') ? 'canvas' : 'waiting'
    })()`)
    if (state === 'canvas') break
    await sleep(1500)
  }
  await sleep(8000) // restore, clock sync
  await t.eval('window.__liveLatency.reset()')

  // Author draws slow strokes — many 60 ms live packets each.
  const box = await page.locator('canvas').first().boundingBox()
  for (let s = 0; s < STROKES; s++) {
    const y = box.y + 150 + (s % 12) * 50
    await page.mouse.move(box.x + 250, y)
    await page.mouse.down()
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(box.x + 250 + i * 18, y + (i % 2) * 8)
      await sleep(40)
    }
    await page.mouse.up()
    await sleep(300)
  }
  await sleep(3000)
  out.stats = await t.eval('window.__liveLatency.stats()')
  t.close()

  const del = await page.evaluate(async id => (await fetch(`/api/rooms/${id}`, { method: 'DELETE' })).status, roomId)
  out.roomDeleted = del
} finally {
  await browser.close()
  adb('shell', 'svc', 'power', 'stayon', 'false')
  adb('forward', '--remove', `tcp:${CDP_PORT}`)
}
console.log(JSON.stringify(out, null, 2))
