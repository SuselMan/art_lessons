(() => {
  const e = window.__engine, gl = e.gl
  if (e.__so) return 'already'; e.__so = true
  const rec = window.__settleRec = []
  const orig = Object.getPrototypeOf(e)._startSettle
  e._startSettle = function (scratch, ops, complete) {
    const n = ops.length
    const wrapped = ops.map((op, i) => () => {
      gl.finish(); const t = performance.now(); op(); gl.finish(); const d = performance.now() - t
      if (d > 30) rec.push([Math.round(d), i + '/' + n, String(op).replace(/\s+/g, ' ').slice(0, 90)])
    })
    return orig.call(this, scratch, wrapped, complete)
  }
  return 'settleops'
})()
