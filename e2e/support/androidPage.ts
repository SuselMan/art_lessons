import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { expect } from '@playwright/test'

// Android Chrome can hang connectOverCDP. Use its page WebSocket directly,
// owning exactly one new target and closing only that target in finally.
export async function androidPage(endpoint: string, url: string) {
  // Android's /json/new can refuse target creation in background Chrome.
  // A unique QA URL launched by the paired helper owns a separate tab.
  execFileSync(join(homedir(), '.local/bin/home-devices'), ['adb', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', 'com.android.chrome'], { timeout: 30_000 })
  type Target = { id: string; url: string; webSocketDebuggerUrl: string }
  let target: Target | undefined
  await expect.poll(async () => {
    target = ((await (await fetch(`${endpoint}/json/list`)).json()) as Target[]).find(tab => tab.url === url)
    return !!target
  }, { timeout: 30_000 }).toBe(true)
  const owned = target!

  const wire = new WebSocket(owned.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  wire.on('message', raw => {
    const reply = JSON.parse(String(raw)) as { id?: number; result?: unknown; error?: { message: string } }
    if (!reply.id) return
    const wait = pending.get(reply.id)
    if (!wait) return
    clearTimeout(wait.timer); pending.delete(reply.id)
    if (reply.error) wait.reject(new Error(reply.error.message)); else wait.resolve(reply.result)
  })
  await new Promise<void>((resolve, reject) => { wire.once('open', resolve); wire.once('error', reject) })
  const call = (method: string, params: object = {}) => new Promise<unknown>((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Android CDP timeout: ${method}`)) }, 30_000)
    pending.set(id, { resolve, reject, timer }); wire.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async <T>(fn: () => T): Promise<T> => {
    const reply = await call('Runtime.evaluate', { expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true }) as { result: { value: T }; exceptionDetails?: unknown }
    if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails))
    return reply.result.value
  }
  return { call, evaluate, close: async () => {
    for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(new Error('Android QA target closed')) }
    pending.clear(); wire.close(); await fetch(`${endpoint}/json/close/${owned.id}`)
  } }
}
