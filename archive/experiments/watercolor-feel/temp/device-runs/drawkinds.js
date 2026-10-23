(() => {
  const e = window.__engine, gl = e.gl
  if (e.__dk) return 'already'; e.__dk = true
  const agg = window.__dk = {}
  const add = (k, d, px) => { const s = agg[k] || (agg[k] = [0, 0, 0, 0]); s[0] += d; s[1]++; s[2] = Math.max(s[2], d); s[3] += px }
  const P = Object.getPrototypeOf(e)
  e._drawRibbonNibPass = function (dest, tile, dab, preset, profile, inkMode, opacity, ownTarget, ...rest) {
    gl.finish(); const t = performance.now()
    const r = P._drawRibbonNibPass.call(this, dest, tile, dab, preset, profile, inkMode, opacity, ownTarget, ...rest)
    gl.finish(); const d = performance.now() - t
    const clip = rest[8] ? 'clip' : ''; const combs = rest[9] ? 'combs' : ''
    add('nib m' + inkMode + (ownTarget ? ' cov' : '') + ' ' + clip + combs + (rest[11] ? ' tau' : ''), d, this._nibDrawCost(tile, dab, preset))
    return r
  }
  e._drawRibbonBands = function (dest, tile, bands, mode, ...rest) {
    gl.finish(); const t = performance.now()
    const r = P._drawRibbonBands.call(this, dest, tile, bands, mode, ...rest)
    gl.finish(); const d = performance.now() - t
    add('bands ' + mode + (rest[9] ? ' combs' : '') + (rest[11] ? ' tau' : ''), d, 0)
    return r
  }
  for (const n of ['_drawRibbonCompositeRect', '_finishRibbonStroke', '_fieldOp', '_diffuseWashOps', '_revealWash']) {
    const o = P[n]; if (!o) continue
    e[n] = function (...a) { gl.finish(); const t = performance.now(); const r = o.apply(this, a); gl.finish(); add(n, performance.now() - t, 0); return r }
  }
  const sc = [...e._replayRibbonChunks.values()][0]
  window.__dkDump = () => Object.entries(agg).sort((a, b) => b[1][0] - a[1][0]).map(([k, s]) => `${Math.round(s[0])}ms n=${s[1]} max=${Math.round(s[2])} avg=${(s[0] / s[1]).toFixed(2)} ns/px=${s[3] ? Math.round(s[0] * 1e6 / s[3]) : '-'} ${k}`)
  return 'dk'
})()
