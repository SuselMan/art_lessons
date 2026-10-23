(() => {
  const e = window.__engine
  if (e.__fl) { window.__fl.length = 0; return 'reset' }
  e.__fl = 1; const L = window.__fl = []
  const wrap = (name, tag) => { const o = e[name].bind(e); e[name] = function (...a) { const t = performance.now(); const r = o(...a); L.push([tag, Math.round(t * 10) / 10, Math.round((performance.now() - t) * 10) / 10, tag === 'D' ? (this.__lastPartial ? 1 : 0) : (tag === 'S' && this._settle ? this._settle.next : -1)]); return r } }
  const tp = e._takePaperPartial.bind(e); e._takePaperPartial = function () { const r = tp(); this.__lastPartial = r; return r }
  wrap('_display', 'D'); wrap('_tickSettle', 'S'); wrap('_updateWetTexture', 'W'); wrap('_flushLiveComposite', 'C')
  const gl = e.gl; const f = gl.finish.bind(gl)
  return 'installed'
})()
