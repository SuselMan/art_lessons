import { build } from 'esbuild'
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const out = 'temp/whole-plan-software'
fs.mkdirSync(out, { recursive: true })
await build({ entryPoints: ['docs/qa/harness/728-settle-plan-software/run.ts'], outfile: out + '/run.js', bundle: true, format: 'esm', platform: 'browser', loader: { '.txt': 'text' }, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'false' } })
const server = http.createServer((req, res) => {
 const url = new URL(req.url, 'http://localhost').pathname
 const base = url.startsWith('/paper/') ? path.resolve('apps/web/public') : path.resolve(out)
 if (url === '/favicon.ico') { res.writeHead(204).end(); return }
 if (url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<html/>'); return }
 const file = path.resolve(base, '.' + url)
 if (!file.startsWith(base + '/')) { res.writeHead(403).end(); return }
 try { res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream'); res.end(fs.readFileSync(file)) } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan', '--disable-vulkan-surface'] })
const errors = []
try {
 const page = await browser.newPage(); page.setDefaultTimeout(180000)
 page.on('pageerror', e => errors.push(String(e)))
 page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
 await page.goto('http://127.0.0.1:' + server.address().port)
 const result = await page.evaluate(async () => { const { runWholePlan } = await import('/run.js'); return runWholePlan() })
 fs.writeFileSync(out + '/latest.json', JSON.stringify({ errors, result }, null, 2))
 console.log(JSON.stringify({ errors, result }))
 if (!result.exact || errors.length) process.exitCode = 1
} catch (e) {
 fs.writeFileSync(out + '/failure.json', JSON.stringify({ errors, failure: String(e) }, null, 2)); throw e
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
