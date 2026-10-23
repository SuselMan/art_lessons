(() => {
  const P = WebGLRenderingContext.prototype
  if (P.__spy) return 'already'
  P.__spy = true
  const srcOf = new WeakMap(), att = new WeakMap()
  const oShader = P.shaderSource, oAttach = P.attachShader, oLink = P.linkProgram
  P.shaderSource = function (sh, src) { srcOf.set(sh, src); return oShader.call(this, sh, src) }
  P.attachShader = function (pr, sh) { const l = att.get(pr) || []; l.push(sh); att.set(pr, l); return oAttach.call(this, pr, sh) }
  let n = 0
  const sig = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ':' + s.length }
  P.linkProgram = function (pr) {
    const srcs = (att.get(pr) || []).map(sh => srcOf.get(sh) || '')
    const rec = { n: ++n, t: Date.now(), sigs: srcs.map(sig), uniforms: srcs.map(s => (s.match(/uniform\s+\w+\s+(\w+)/g) || []).slice(0, 6).map(u => u.split(/\s+/).pop()).join(',')) }
    localStorage.__linkLast = JSON.stringify(rec)
    const log = JSON.parse(localStorage.__linkLog || '[]'); log.push(rec); localStorage.__linkLog = JSON.stringify(log.slice(-80))
    const r = oLink.call(this, pr)
    localStorage.__linkDone = String(rec.n)
    return r
  }
  localStorage.__linkLog = '[]'; localStorage.removeItem('__linkLast'); localStorage.removeItem('__linkDone')
  return 'spy on'
})()
