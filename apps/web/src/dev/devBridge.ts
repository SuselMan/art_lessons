// (#536) The page half of the dev bridge — see scripts/devBridgePlugin.ts for
// what it is for and its guard rails. Dev builds only: main.tsx imports this
// behind `import.meta.env.DEV`, so a production bundle does not contain it.
//
// What it does: says hello over Vite's HMR socket, runs the code the plugin
// sends (an async function body, or a bare expression), answers with the
// JSON of the result, and forwards warnings, errors and uncaught exceptions.

const ID_KEY = 'devbridge:id'

type Hot = NonNullable<ImportMeta['hot']>

function pageId(): string {
  try {
    const kept = sessionStorage.getItem(ID_KEY)
    if (kept) return kept
    const id = Math.random().toString(36).slice(2, 8)
    sessionStorage.setItem(ID_KEY, id)
    return id
  } catch {
    return Math.random().toString(36).slice(2, 8)
  }
}

/** JSON-safe copy: cycles, functions and GL handles become short strings
 *  rather than failing the whole answer. */
function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>()
  try {
    return JSON.parse(JSON.stringify(value, (_k, v: unknown) => {
      if (typeof v === 'bigint') return String(v)
      if (typeof v === 'function') return '[function]'
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[cycle]'
        seen.add(v)
        if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return Array.from(v as unknown as ArrayLike<number>).slice(0, 4096)
      }
      return v
    }) ?? null)
  } catch (e) {
    return `[unserialisable: ${String(e)}]`
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (body: string) => () => Promise<unknown>

function compile(code: string): () => Promise<unknown> {
  // A bare expression first (`__engine.getWatercolorPerf()`), then a body
  // with its own `return` (`const x = 1; return x`).
  try { return new AsyncFunction(`return (${code}\n)`) } catch { return new AsyncFunction(code) }
}

export function startDevBridge(): void {
  const hot: Hot | undefined = import.meta.hot
  if (!hot) return
  const id = pageId()
  const hello = (): void => hot.send('devbridge:hello', {
    id, ua: navigator.userAgent, href: location.href,
    screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
  })
  hello()
  hot.on('vite:ws:connect', hello)
  // Again every few seconds: a hello can be lost to a dev-server restart
  // racing the page's reconnect, and the roster should not depend on luck.
  setInterval(hello, 10_000)
  // A route change keeps the socket but moves the page: tell the roster.
  addEventListener('popstate', hello)
  const pushState = history.pushState.bind(history)
  history.pushState = (...args: Parameters<History['pushState']>) => { pushState(...args); setTimeout(hello, 0) }

  const log = (level: string, parts: unknown[]): void => {
    const text = parts.map(p => (typeof p === 'string' ? p : (() => { try { return JSON.stringify(toJsonSafe(p)) } catch { return String(p) } })())).join(' ')
    hot.send('devbridge:log', { id, level, text })
  }
  for (const level of ['warn', 'error'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => { orig(...args); log(level, args) }
  }
  addEventListener('error', e => log('exception', [e.message, e.error instanceof Error ? e.error.stack : '']))
  addEventListener('unhandledrejection', e => log('rejection', [e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)]))

  hot.on('devbridge:eval', async ({ reqId, code }: { reqId: string; code: string }) => {
    const t0 = performance.now()
    try {
      const value = await compile(code)()
      hot.send('devbridge:result', { reqId, id, ok: true, value: toJsonSafe(value), ms: Math.round(performance.now() - t0) })
    } catch (e) {
      hot.send('devbridge:result', { reqId, id, ok: false, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), ms: Math.round(performance.now() - t0) })
    }
  })
}
