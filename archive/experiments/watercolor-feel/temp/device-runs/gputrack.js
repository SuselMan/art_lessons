// Installed into a page: counts the bytes of every WebGL texture and
// renderbuffer the engine's context holds. window.__gpuBytes() -> MB summary.
(() => {
  const e = window.__engine; if (!e) return 'no engine'
  const gl = e.gl
  if (gl.__tracked) return 'already'
  gl.__tracked = true
  const tex = new Map(); const rb = new Map(); let bound = new Map(); let boundRb = null
  const unit = () => gl.getParameter(gl.ACTIVE_TEXTURE)
  const oBind = gl.bindTexture.bind(gl), oImg = gl.texImage2D.bind(gl), oDel = gl.deleteTexture.bind(gl)
  gl.bindTexture = (t, x) => { bound.set(unit() + ':' + t, x); return oBind(t, x) }
  gl.texImage2D = (...a) => {
    const t = bound.get(unit() + ':' + a[0])
    let w = 0, h = 0, level = a[1]
    if (a.length >= 9) { w = a[3]; h = a[4] } else if (a[5]) { w = a[5].width || a[5].videoWidth || 0; h = a[5].height || a[5].videoHeight || 0 }
    if (t) { const m = tex.get(t) || {}; m[level] = w * h * 4; tex.set(t, m) }
    return oImg(...a)
  }
  const oGen = gl.generateMipmap.bind(gl)
  gl.generateMipmap = (target) => { const t = bound.get(unit() + ':' + target); if (t) { const m = tex.get(t) || {}; m.mip = Math.round((m[0] || 0) / 3); tex.set(t, m) } return oGen(target) }
  gl.deleteTexture = (t) => { tex.delete(t); return oDel(t) }
  const oBRb = gl.bindRenderbuffer.bind(gl), oRbS = gl.renderbufferStorage.bind(gl), oDRb = gl.deleteRenderbuffer.bind(gl)
  gl.bindRenderbuffer = (t, r) => { boundRb = r; return oBRb(t, r) }
  gl.renderbufferStorage = (t, f, w, h) => { if (boundRb) rb.set(boundRb, w * h * 4); return oRbS(t, f, w, h) }
  gl.deleteRenderbuffer = (r) => { rb.delete(r); return oDRb(r) }
  window.__gpuBytes = () => {
    let t = 0, n = 0; for (const m of tex.values()) { n++; for (const v of Object.values(m)) t += v }
    let r = 0; for (const v of rb.values()) r += v
    return { texMB: Math.round(t / 1048576), textures: n, rbMB: Math.round(r / 1048576) }
  }
  return 'tracking (from now on - earlier textures are not counted)'
})()
