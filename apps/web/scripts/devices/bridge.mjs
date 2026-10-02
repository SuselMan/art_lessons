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
export async function joinAndInstall(sel, roomId) {
  // (#692) A new room's join gate has an empty required name. A disabled Join
  // button never reaches the engine, however many times the rig clicks it.
  // Poll with short bridge calls: Safari may suspend a long timer while the
  // page navigates, and a single 60-second eval used to expire at 120 seconds.
  const deadline = Date.now() + 90000
  for (;;) {
    let ready = false
    try {
      ready = await ev(sel, `
      if (${JSON.stringify(roomId ?? null)} && location.pathname !== '/room/' + ${JSON.stringify(roomId ?? null)}) return false;
      const canvas = document.querySelector('canvas');
      if (window.__engine && canvas && getComputedStyle(canvas).pointerEvents !== 'none') return true;
      const form = document.querySelector('form');
      const input = form?.querySelector('input[type="text"]');
      if (input && !input.value.trim()) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'QA device');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const button = form?.querySelector('button[type="submit"]');
      // Reply before submitting: joining can replace the page's bridge
      // listener during React refresh, otherwise the successful click loses
      // its acknowledgement and the rig reports a timeout.
      if (button && !button.disabled) setTimeout(() => button.click(), 0);
      return false;
      `, Math.min(10000, Math.max(1, deadline - Date.now())))
    } catch (error) {
      // Navigation briefly removes the page from the bridge registry. A
      // timed-out eval can also have completed its submit during a refresh.
      // Retry these observations, but keep the original bounded deadline.
      if (!/no live page matches|timeout after/.test(String(error))) throw error
    }
    if (ready) break
    if (Date.now() >= deadline) throw new Error(`${sel}: room did not become drawable within 90 seconds`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return ev(sel, pageLib)
}
