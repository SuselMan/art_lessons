// (#536) Which dev server the device scripts talk to: one session file per
// dev server (see devBridgePlugin.ts); DEVBRIDGE_PORT picks one, otherwise the
// newest whose process is still alive.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function readDevBridgeSession(dir) {
  const want = process.env.DEVBRIDGE_PORT
  const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
  const files = readdirSync(dir).filter(f => /^session-.*\.json$/.test(f))
    .map(f => ({ f, mtime: statSync(join(dir, f)).mtimeMs, s: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
    .filter(x => (want ? x.f === `session-${want}.json` : alive(x.s.pid)))
    .sort((a, b) => b.mtime - a.mtime)
  if (!files.length) throw new Error(`no live dev-bridge session in ${dir}${want ? ` for port ${want}` : ''} - is the dev server running from this checkout?`)
  return files[0].s
}
