(async () => {
  const m = await import('/src/engine/src/raster/shaders.ts')
  const N = window.__stressN || 200
  const FRAG = window.__stressFrag || m.WC_FIELD_OP_FRAG
  const res = { ok: 0, fail: 0, lostAt: null, ms: 0, noGl: null }
  const t0 = performance.now()
  for (let i = 0; i < N; i++) {
    const c = document.createElement('canvas'); c.width = c.height = 16
    const gl = c.getContext('webgl')
    if (!gl) { res.noGl = i; break }
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s }
    const salt = `// salt ${Date.now()} ${i} ${Math.random()}\n`
    const p = gl.createProgram()
    gl.attachShader(p, sh(gl.VERTEX_SHADER, salt + m.DISPLAY_VERT))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, salt + FRAG))
    gl.linkProgram(p)
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
    if (gl.isContextLost()) { res.lostAt = i; break }
    if (ok) res.ok++; else res.fail++
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 0))
  }
  res.ms = Math.round(performance.now() - t0)
  return res
})()
