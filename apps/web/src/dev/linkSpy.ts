// Dev only. A GPU driver that crashes while linking a shader program takes the
// browser's GPU process down with it, and the page only learns "context
// lost" (Chrome on the Galaxy Tab: SIGSEGV in QGLCLinkProgram). This records
// every link to localStorage before it happens, so after the crash the page -
// which survives - can say which program was last: `localStorage.__linkLast`.
// On from page start when `localStorage.__linkSpy === '1'`, since a room is
// entered by a full page load.

interface LinkRecord { n: number; t: number; sigs: string[]; uniforms: string[] }

function signature(src: string): string {
  let h = 0
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(16)}:${src.length}`
}

export function startLinkSpy(): void {
  let on = false
  try { on = localStorage.getItem('__linkSpy') === '1' } catch { return }
  if (!on || typeof WebGLRenderingContext === 'undefined') return
  const P = WebGLRenderingContext.prototype
  const srcOf = new WeakMap<WebGLShader, string>()
  const attached = new WeakMap<WebGLProgram, WebGLShader[]>()
  const shaderSource = P.shaderSource, attachShader = P.attachShader, linkProgram = P.linkProgram
  P.shaderSource = function (this: WebGLRenderingContext, sh: WebGLShader, src: string) {
    srcOf.set(sh, src)
    return shaderSource.call(this, sh, src)
  }
  P.attachShader = function (this: WebGLRenderingContext, pr: WebGLProgram, sh: WebGLShader) {
    attached.set(pr, [...(attached.get(pr) ?? []), sh])
    return attachShader.call(this, pr, sh)
  }
  let n = 0
  const log: LinkRecord[] = []
  // The sources themselves, for relinking each program salted (a real compile,
  // past the browser's program cache): temp/device-runs/linkall.js.
  const pairs: string[][] = []
  ;(globalThis as { __linkPairs?: string[][] }).__linkPairs = pairs
  P.linkProgram = function (this: WebGLRenderingContext, pr: WebGLProgram) {
    const srcs = (attached.get(pr) ?? []).map(sh => srcOf.get(sh) ?? '')
    const rec: LinkRecord = {
      n: ++n, t: Date.now(), sigs: srcs.map(signature),
      uniforms: srcs.map(s => (s.match(/uniform\s+\w+\s+(\w+)/g) ?? []).slice(0, 8).map(u => u.split(/\s+/).pop()).join(',')),
    }
    log.push(rec)
    pairs.push(srcs)
    try {
      localStorage.setItem('__linkLast', JSON.stringify(rec))
      localStorage.setItem('__linkLog', JSON.stringify(log.slice(-80)))
    } catch { /* full storage: the spy is best effort */ }
    linkProgram.call(this, pr)
    try { localStorage.setItem('__linkDone', String(rec.n)) } catch { /* as above */ }
  }
}
