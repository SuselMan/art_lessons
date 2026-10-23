// Injected before the app: wraps every WebGL draw call in a GPU timer query
// and labels it by program (fragment shader fingerprint) and, for the shared
// dab program, by u_inkMode. window.__gpuProf.report() returns totals.
(() => {
  const labels = new Map()
  const pending = []
  const totals = new Map()
  let ext = null, gl0 = null, noTimer = false, cpuOnly = false
  const labelFor = (gl, prog) => {
    if (labels.has(prog)) return labels.get(prog)
    let label = 'other'
    try {
      const shaders = gl.getAttachedShaders(prog) || []
      let src = ''
      for (const s of shaders) if (gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER) src = gl.getShaderSource(s) || ''
      if (/u_inkMode/.test(src)) label = 'DAB'
      else if (/u_stencil/.test(src)) label = 'DIFFUSE'
      else if (/u_hold/.test(src)) label = 'REVEAL'
      else if (/u_tau/.test(src) && /u_mode/.test(src)) label = 'FIELDOP'
      else if (/v_ink\b/.test(src) || /u_washWater/.test(src)) label = 'RIBBON'
      else if (/u_wetMap/.test(src)) label = 'PAPER_COMPOSE'
      else if (/u_layer\b/.test(src)) label = 'LAYER_COMPOSE'
      else label = 'other:' + src.replace(/\s+/g, ' ').slice(0, 50)
    } catch (e) { label = 'err' }
    labels.set(prog, label)
    return label
  }
  const wrap = (proto, name) => {
    const orig = proto[name]
    proto[name] = function (...args) {
      const gl = this
      if (!gl0) {
        gl0 = gl
        ext = gl.getExtension('EXT_disjoint_timer_query') || gl.getExtension('EXT_disjoint_timer_query_webgl2')
        if (!ext) { noTimer = true; cpuOnly = true }
      }
      const prog = gl.getParameter(gl.CURRENT_PROGRAM)
      let label = labelFor(gl, prog)
      if (label === 'DAB') {
        const loc = gl.getUniformLocation(prog, 'u_inkMode')
        const m = loc ? gl.getUniform(prog, loc) : -1
        label = 'DAB:' + Math.round(m)
      }
      if (cpuOnly || gl !== gl0) {
        const t0 = performance.now(); orig.apply(gl, args); const dt = performance.now() - t0
        const t = totals.get(label) || { ns: 0, calls: 0, cpuMs: 0 }
        t.calls++; t.cpuMs += dt; totals.set(label, t)
        return
      }
      const q = ext.createQueryEXT ? ext.createQueryEXT() : gl.createQuery()
      if (ext.beginQueryEXT) ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q); else gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
      const t0 = performance.now()
      orig.apply(gl, args)
      const dt = performance.now() - t0
      if (ext.endQueryEXT) ext.endQueryEXT(ext.TIME_ELAPSED_EXT); else gl.endQuery(ext.TIME_ELAPSED_EXT)
      pending.push({ q, label, cpuMs: dt })
    }
  }
  wrap(WebGLRenderingContext.prototype, 'drawArrays')
  wrap(WebGLRenderingContext.prototype, 'drawElements')
  if (window.WebGL2RenderingContext) { wrap(WebGL2RenderingContext.prototype, 'drawArrays'); wrap(WebGL2RenderingContext.prototype, 'drawElements') }
  const collect = () => {
    if (!ext || !gl0) return
    const gl = gl0
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    let i = 0
    while (i < pending.length) {
      const p = pending[i]
      const avail = ext.getQueryObjectEXT ? ext.getQueryObjectEXT(p.q, ext.QUERY_RESULT_AVAILABLE_EXT) : gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)
      if (!avail) { i++; continue }
      const ns = ext.getQueryObjectEXT ? ext.getQueryObjectEXT(p.q, ext.QUERY_RESULT_EXT) : gl.getQueryParameter(p.q, gl.QUERY_RESULT)
      if (ext.deleteQueryEXT) ext.deleteQueryEXT(p.q); else gl.deleteQuery(p.q)
      const t = totals.get(p.label) || { ns: 0, calls: 0, cpuMs: 0 }
      if (!disjoint) t.ns += ns
      t.calls++; t.cpuMs += p.cpuMs
      totals.set(p.label, t)
      pending.splice(i, 1)
    }
  }
  setInterval(collect, 200)
  window.__gpuProf = {
    reset() { collect(); totals.clear(); pending.length = 0 },
    report() {
      collect()
      const out = { timer: !noTimer, pending: pending.length, rows: [] }
      for (const [label, t] of totals) out.rows.push({ label, gpuMs: +(t.ns / 1e6).toFixed(1), calls: t.calls, cpuMs: +t.cpuMs.toFixed(1) })
      out.rows.sort((a, b) => b.gpuMs - a.gpuMs)
      return out
    },
  }
})()
