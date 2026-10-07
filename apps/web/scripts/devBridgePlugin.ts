// (#536) Dev bridge: remote eval + console for devices we cannot attach a
// debugger to. An iPad without a Mac has no remote Web Inspector, and the
// watercolour has to be measured on it the way the Android tablet is (CDP):
// run code in the real page, read the number back.
//
// How: the page (dev build only, src/dev/devBridge.ts) says hello over Vite's
// own HMR socket, which it already holds. This plugin keeps the roster, sends
// `devbridge:eval` to a page and hands the answer back to an HTTP caller -
// scripts/devbridge.ts, from a terminal on this machine.
//
// Guard rails, since this is code execution on someone's device:
//  - `apply: 'serve'`: it does not exist in a build, and the page half is
//    behind `import.meta.env.DEV`, so production bundles carry neither;
//  - the HTTP side wants a token that only this machine can read (written
//    under node_modules/.devbridge with mode 0600 on every start);
//  - a page can only answer; it cannot ask another page to run anything.
//
// Also serves the mkcert ROOT CERTIFICATE (never a key) at
// /__devbridge/rootCA.pem: installing it is how an iPad comes to trust the
// dev server's https, and Safari offers to install a profile from a link.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

type WsClient = Parameters<Parameters<ViteDevServer['ws']['on']>[1]>[1]

interface PageInfo {
  id: string
  ua: string
  href: string
  screen: string
  helloAt: number
  lastSeen: number
  client: WsClient
  logs: Array<{ at: number; level: string; text: string }>
}

interface EvalReply { reqId: string; id: string; ok: boolean; value?: unknown; error?: string; ms?: number }

const LOG_CAP = 500
export const DEVBRIDGE_DIR = join(process.cwd(), 'node_modules', '.devbridge')

export function devBridge(): Plugin {
  return {
    name: 'grafetto-devbridge',
    apply: 'serve',
    configureServer(server) {
      const token = randomBytes(16).toString('hex')
      const pages = new Map<string, PageInfo>()
      const pending = new Map<string, (r: EvalReply) => void>()

      server.httpServer?.once('listening', () => {
        mkdirSync(DEVBRIDGE_DIR, { recursive: true })
        const urls = server.resolvedUrls?.local ?? []
        const url = urls[0] ?? null
        // One file per server: an e2e run starts a second dev server from the
        // same checkout, and a single session.json was overwritten by it -
        // the terminal then talked to a server that was gone. The readers
        // pick the newest file whose process is still alive (sessionFile.ts).
        const port = url ? new URL(url).port : String(process.pid)
        writeFileSync(join(DEVBRIDGE_DIR, `session-${port}.json`), JSON.stringify({ token, url, pid: process.pid }), { mode: 0o600 })
      })

      server.ws.on('devbridge:hello', (data: { id: string; ua: string; href: string; screen: string }, client) => {
        const prev = pages.get(data.id)
        pages.set(data.id, {
          id: data.id, ua: data.ua, href: data.href, screen: data.screen,
          // A repeated hello from the same socket is a heartbeat, not a new page.
          helloAt: prev && prev.client === client ? prev.helloAt : Date.now(),
          lastSeen: Date.now(), client, logs: prev?.logs ?? [],
        })
      })
      server.ws.on('devbridge:log', (data: { id: string; level: string; text: string }) => {
        const p = pages.get(data.id)
        if (!p) return
        p.lastSeen = Date.now()
        p.logs.push({ at: Date.now(), level: data.level, text: data.text.slice(0, 4000) })
        if (p.logs.length > LOG_CAP) p.logs.splice(0, p.logs.length - LOG_CAP)
      })
      server.ws.on('devbridge:result', (data: EvalReply) => {
        const p = pages.get(data.id)
        if (p) p.lastSeen = Date.now()
        pending.get(data.reqId)?.(data)
      })

      const alive = (p: PageInfo): boolean => server.ws.clients.has(p.client)
      const listPages = () => [...pages.values()].filter(alive).map(p => ({
        id: p.id, ua: p.ua, href: p.href, screen: p.screen,
        connectedFor: Math.round((Date.now() - p.helloAt) / 1000), logs: p.logs.length,
      }))
      const pick = (sel: string): PageInfo[] => {
        const live = [...pages.values()].filter(alive)
        if (sel === '*') return live
        // An id (or its prefix), any part of the user agent ("ipad"), or of
        // the page's address (a room id). The most recent hello wins a tie.
        const needle = sel.toLowerCase()
        return live
          .filter(p => p.id.startsWith(sel) || p.ua.toLowerCase().includes(needle) || p.href.toLowerCase().includes(needle))
          .sort((a, b) => b.helloAt - a.helloAt)
          .slice(0, 1)
      }

      server.middlewares.use('/__devbridge', (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const url = new URL(req.url ?? '/', 'http://x')
        if (url.pathname === '/rootCA.pem') {
          const ca = join(homedir(), '.vite-plugin-mkcert', 'rootCA.pem')
          if (!existsSync(ca)) { send(404, { error: 'no mkcert root CA on this machine' }); return }
          res.setHeader('content-type', 'application/x-x509-ca-cert')
          res.setHeader('content-disposition', 'attachment; filename="grafetto-dev-rootCA.pem"')
          res.end(readFileSync(ca))
          return
        }
        if (req.headers['x-devbridge-token'] !== token) { send(403, { error: 'bad token' }); return }
        if (url.pathname === '/clients') { send(200, listPages()); return }
        if (url.pathname === '/logs') {
          const [p] = pick(url.searchParams.get('client') ?? '*')
          const since = Number(url.searchParams.get('since') ?? 0)
          send(200, p ? p.logs.filter(l => l.at > since) : [])
          return
        }
        if (url.pathname === '/eval' && req.method === 'POST') {
          let raw = ''
          req.on('data', c => { raw += c })
          req.on('end', () => {
            let body: { client: string; code: string; timeoutMs?: number }
            try { body = JSON.parse(raw) } catch { send(400, { error: 'bad json' }); return }
            if (!body || typeof body !== 'object' || typeof body.client !== 'string' || typeof body.code !== 'string'
              || (body.timeoutMs !== undefined && (typeof body.timeoutMs !== 'number' || !Number.isFinite(body.timeoutMs) || body.timeoutMs <= 0))) {
              send(400, { error: 'invalid eval request' }); return
            }
            const targets = pick(body.client)
            if (!targets.length) { send(404, { error: `no live page matches "${body.client}"`, pages: listPages() }); return }
            const timeoutMs = Math.min(body.timeoutMs ?? 60_000, 15 * 60_000)
            void Promise.all(targets.map(p => new Promise<EvalReply>(resolve => {
              const reqId = randomBytes(8).toString('hex')
              const timer = setTimeout(() => { pending.delete(reqId); resolve({ reqId, id: p.id, ok: false, error: `timeout after ${timeoutMs} ms` }) }, timeoutMs)
              pending.set(reqId, r => { clearTimeout(timer); pending.delete(reqId); resolve(r) })
              p.client.send('devbridge:eval', { reqId, code: body.code })
            }))).then(replies => send(200, replies))
          })
          return
        }
        send(404, { error: 'unknown route' })
      })
    },
  }
}
