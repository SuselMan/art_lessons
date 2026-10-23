// Pause the laptop peer's page via CDP and print the JS stack (or say it
// could not pause - then the main thread is stuck in a native call).
import { chromium } from 'playwright'
const b = await chromium.connectOverCDP('http://localhost:9333')
const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('/room/'))
if (!page) { console.log('no room page'); process.exit(0) }
const cdp = await page.context().newCDPSession(page)
const t = setTimeout(() => { console.log('pause did not land in 20 s: blocked outside JS'); process.exit(0) }, 20000)
cdp.on('Debugger.paused', ev => {
  clearTimeout(t)
  for (const f of ev.callFrames.slice(0, 25)) console.log(f.functionName || '(anon)', f.url.replace(/.*\/src\//, 'src/').split('?')[0] + ':' + (f.location.lineNumber + 1))
  cdp.send('Debugger.resume').finally(() => process.exit(0))
})
await cdp.send('Debugger.enable')
await cdp.send('Debugger.pause')
