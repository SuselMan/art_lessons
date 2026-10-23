(() => {
  const e = window.__engine; const gl = e.gl
  if (e.__leaf) return 'already'; e.__leaf = true
  const agg = window.__leafAgg = {}
  const wrapOn = (obj, name, label) => {
    const o = obj[name]; if (typeof o !== 'function') return 'miss ' + name
    obj[name] = function (...a) {
      gl.finish(); const t = performance.now()
      const r = o.apply(this, a)
      gl.finish(); const d = performance.now() - t
      const k = label || name; const s = agg[k] || (agg[k] = [0, 0, 0]); s[0] += d; s[1]++; s[2] = Math.max(s[2], d)
      return r
    }
  }
  const out = []
  for (const n of ['_drawRibbonNibPass', '_drawRibbonBands', '_drawRibbonCompositeRect', '_revealBeforeBatch', '_revealAfterBatch', '_markPaperDamage', '_resolveWithinSheet', '_wetFromForeignStroke', '_finishRibbonStroke', '_advanceSettle']) out.push(wrapOn(e, n))
  const any = [...e._replayRibbonChunks.values()][0]
  if (any) { const P = Object.getPrototypeOf(any.scratch); for (const n of ['getOrCreate', 'filmBuffers', 'newFilm']) out.push(wrapOn(P, n, 'scratch.' + n)) } else out.push('no scratch proto')
  for (const n of Object.getOwnPropertyNames(Object.getPrototypeOf(e)).filter(n => /^_draw(Ribbon|Wc|Watercolor|Halo)/.test(n) && !['_drawRibbonNibPass','_drawRibbonBands','_drawRibbonCompositeRect'].includes(n))) out.push(wrapOn(e, n) || n)
  window.__leafDump = () => Object.entries(agg).sort((a, b) => b[1][0] - a[1][0]).map(([k, s]) => `${Math.round(s[0])}ms n=${s[1]} max=${Math.round(s[2])} ${k}`).join('\n')
  return out.filter(Boolean).join(',')
})()
