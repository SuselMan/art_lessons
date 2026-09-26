// (#536) Terminal side of the dev bridge (see devBridgePlugin.ts).
//
//   npx tsx apps/web/scripts/devbridge.ts clients
//   npx tsx apps/web/scripts/devbridge.ts eval <page|ua-part|*> '<js>' [--timeout ms]
//   npx tsx apps/web/scripts/devbridge.ts eval ipad @file.js      (code from a file)
//   npx tsx apps/web/scripts/devbridge.ts logs <page|ua-part> [--follow]
//   npx tsx apps/web/scripts/devbridge.ts wait <page|ua-part> [--timeout ms]
//
// <page> is a page id from `clients`, a prefix of one, any part of the user
// agent ("ipad", "android") or of the page address (a room id); the newest
// matching page answers, `*` means every page. The code is an async function
// body or a bare expression; the page answers with JSON.
//
// Needs a dev server started from apps/web (it writes the session file). Set
// DEVBRIDGE_DIR to read another checkout's.
import { readFileSync } from 'node:fs'
import { request } from 'node:https'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'

import { readDevBridgeSession } from './devBridgeSession.mjs'

const dir = process.env.DEVBRIDGE_DIR ?? join(import.meta.dirname, '..', 'node_modules', '.devbridge')
const session = readDevBridgeSession(dir) as { token: string; url: string | null }
const base = new URL(process.env.DEVBRIDGE_URL ?? session.url ?? 'https://localhost:5173/')

function call(path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const opts = {
      host: base.hostname, port: base.port, path: '/__devbridge' + path, method: payload ? 'POST' : 'GET',
      headers: { 'x-devbridge-token': session.token, ...(payload ? { 'content-type': 'application/json' } : {}) },
      // The dev server's own mkcert certificate, on this machine's loopback.
      rejectUnauthorized: false,
    }
    const req = (base.protocol === 'https:' ? request : httpRequest)(opts, res => {
      let raw = ''
      res.on('data', c => { raw += c })
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { reject(new Error(raw.slice(0, 300))) } })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
const [cmd, ...rest] = process.argv.slice(2)
const flag = (name: string, dflt: number): number => { const i = rest.indexOf(name); return i >= 0 ? Number(rest[i + 1]) : dflt }

if (cmd === 'clients') {
  console.log(JSON.stringify(await call('/clients'), null, 1))
} else if (cmd === 'eval') {
  const [client, codeArg] = rest
  const code = codeArg.startsWith('@') ? readFileSync(codeArg.slice(1), 'utf8') : codeArg
  const replies = await call('/eval', { client, code, timeoutMs: flag('--timeout', 60_000) }) as Array<{ id: string; ok: boolean; value?: unknown; error?: string; ms?: number }> | { error: string }
  if (!Array.isArray(replies)) { console.error(JSON.stringify(replies)); process.exit(2) }
  for (const r of replies) {
    if (r.ok) console.log(replies.length > 1 ? `[${r.id}] ` : '', typeof r.value === 'string' ? r.value : JSON.stringify(r.value))
    else console.error(`[${r.id}] ERROR (${r.ms ?? '?'} ms): ${r.error}`)
  }
  if (replies.some(r => !r.ok)) process.exit(1)
} else if (cmd === 'logs') {
  let since = 0
  do {
    const logs = await call(`/logs?client=${encodeURIComponent(rest[0] ?? '*')}&since=${since}`) as Array<{ at: number; level: string; text: string }>
    for (const l of logs) { console.log(new Date(l.at).toISOString().slice(11, 23), l.level.padEnd(9), l.text); since = l.at }
    if (rest.includes('--follow')) await sleep(1000)
  } while (rest.includes('--follow'))
} else if (cmd === 'wait') {
  const until = Date.now() + flag('--timeout', 120_000)
  for (;;) {
    const pages = await call('/clients') as Array<{ id: string; ua: string }>
    const needle = (rest[0] ?? '').toLowerCase()
    const hit = pages.find(p => p.id.startsWith(rest[0]) || p.ua.toLowerCase().includes(needle) || (p as { href?: string }).href?.toLowerCase().includes(needle))
    if (hit) { console.log(JSON.stringify(hit)); break }
    if (Date.now() > until) { console.error('no such page yet'); process.exit(1) }
    await sleep(1000)
  }
} else {
  console.error('usage: devbridge.ts clients | eval <page> <code|@file> [--timeout ms] | logs <page> [--follow] | wait <page>')
  process.exit(2)
}
