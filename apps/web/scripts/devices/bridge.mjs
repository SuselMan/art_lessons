// Shared by the device-test scripts: talk to the dev bridge (see
// ../devBridgePlugin.ts) of the dev server started from this checkout.
import { readFileSync } from 'node:fs'
import { request } from 'node:https'
import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'

import { readDevBridgeSession } from '../devBridgeSession.mjs'

export const session = readDevBridgeSession(fileURLToPath(new URL('../../node_modules/.devbridge/', import.meta.url)))
export const base = new URL(process.env.DEVBRIDGE_URL ?? session.url ?? 'https://localhost:5173/')

export function call(path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = (base.protocol === 'https:' ? request : httpRequest)({
      host: base.hostname, port: base.port, path: '/__devbridge' + path, method: payload ? 'POST' : 'GET', rejectUnauthorized: false,
      headers: { 'x-devbridge-token': session.token, ...(payload ? { 'content-type': 'application/json' } : {}) },
    }, res => { let raw = ''; res.on('data', c => { raw += c }); res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { reject(new Error(raw.slice(0, 300))) } }) })
    req.on('error', reject); if (payload) req.write(payload); req.end()
  })
}

/** Runs `code` in the page `sel` picks; returns the value (JSON-decoded when it is JSON text). */
export async function ev(sel, code, timeoutMs = 120000) {
  const r = await call('/eval', { client: sel, code, timeoutMs })
  if (!Array.isArray(r)) throw new Error(`${sel}: ${JSON.stringify(r).slice(0, 300)}`)
  const [a] = r
  if (!a.ok) throw new Error(`${sel}: ${a.error?.slice(0, 400)}`)
  return typeof a.value === 'string' && /^[[{]/.test(a.value) ? JSON.parse(a.value) : a.value
}

export const pageLib = readFileSync(new URL('./pageLib.js', import.meta.url), 'utf8')

/** Clicks through the join form if it is up, waits for the engine, installs pageLib. */
export async function joinAndInstall(sel) {
  await ev(sel, `for (let i = 0; i < 60 && !window.__engine; i++) { const b = [...document.querySelectorAll('button')].find(b => /Войти|Join/i.test(b.textContent)); if (b) b.click(); await new Promise(r => setTimeout(r, 1000)) } await new Promise(r => setTimeout(r, 2000)); return location.pathname`)
  return ev(sel, pageLib)
}
