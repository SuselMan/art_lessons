(async () => {
  const pairs = window.__linkPairs || []
  const seen = new Set(), out = (window.__linkAllOut = [])
  for (let i = 0; i < pairs.length; i++) {
    const key = pairs[i].map(s => s.length + ':' + s.slice(0, 200)).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const c = document.createElement('canvas'); c.width = c.height = 16
    const gl = c.getContext('webgl')
    if (!gl) { out.push([i, 'no gl']); break }
    const salt = `// salt ${Date.now()} ${Math.random()}\n`
    const p = gl.createProgram()
    pairs[i].forEach((src, k) => {
      const isVert = /gl_Position/.test(src)
      const s = gl.createShader(isVert ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)
      gl.shaderSource(s, salt + src); gl.compileShader(s); gl.attachShader(p, s)
    })
    window.__linkAllAt = [i, pairs[i].map(s => s.length).join('+'), Date.now()]
    const t = performance.now()
    gl.linkProgram(p)
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
    const lost = gl.isContextLost()
    out.push([i, ok ? 'ok' : lost ? 'LOST' : 'fail', Math.round(performance.now() - t), pairs[i].map(s => s.length).join('+')])
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (lost) break
    await new Promise(r => setTimeout(r, 0))
  }
  return out
})()
