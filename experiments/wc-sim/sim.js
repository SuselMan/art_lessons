import { makeProgram, PingPong } from './gl.js'
import { DISPLAY, DRY_ALL, FLUX, PIG_D, PIG_G, TILE_SCAN, WATER } from './shaders.js'
import { makeTarget } from './gl.js'
import { PIGMENTS } from './pigments.js'

// Tunable physics, per substep. Units: water depth in "brush levels" (a fully
// loaded brush lays ~1), pigment mass in the same units × concentration.
export const DEFAULTS = {
  kFlow: 0.24,       // pipe conductance
  damp: 0.98,         // pipe flux memory (momentum)
  hScale: 0.004,      // how tall the paper grain is for the water
  breach: 0.35,      // height step that lets water jump onto dry paper
  tilt: 0.0,         // board tilt (gravity along −y), total drop over the sheet
  wFlow: 0.004,      // thinner surface films are pinned (no flow)
  wEps: 0.004,       // surface water counts as "wet" above this
  sWet: 0.09,        // capillary water counts as "wet" above this
  creepLo: 0.05, creepHi: 0.06, // damp paper lets new water in above this capillary level
  sPin: 0.01,        // pinned contact line lets go once the paper is this dry
  capMin: 0.04, capMax: 0.12, absorb: 0.004, kCap: 0.004, sSrc: 0.08,
  evap: 0.000006,     // surface evaporation per step
  edgeBoost: 20.0,    // extra evaporation on the rim of the wet area
  evapS: 0.00002,    // capillary evaporation once the surface is dry
  blurK: 0.02,       // wet-mask blur (smaller = wider rim)
  settle: 0.0006, lift: 0.001, w0: 0.03, wDry: 0.0015, wLift: 0.05,
  loose: 8.0,        // lift ×this while the pigment has not been through a full drying
  kDiff: 0.02,       // Brownian pigment mixing
  granMul: 1.5,
  thick: 3.0,        // display: pigment mass → KM layer thickness
  shade: 0.15,        // display: paper relief shading
  brushRate: 0.25, brushMix: 0.03,
}

export class Sim {
  constructor(gl, quad, n, type, paper) {
    this.gl = gl
    this.quad = quad
    this.n = n
    this.type = type
    this.paper = paper
    this.P = { ...DEFAULTS }
    this.progs = {
      flux: makeProgram(gl, 'flux', FLUX),
      water: makeProgram(gl, 'water', WATER),
      pigD: makeProgram(gl, 'pigD', PIG_D),
      pigG: makeProgram(gl, 'pigG', PIG_G),
      dryAll: makeProgram(gl, 'dryAll', DRY_ALL),
      display: makeProgram(gl, 'display', DISPLAY),
      tileScan: makeProgram(gl, 'tileScan', TILE_SCAN),
    }
    this.tiles = makeTarget(gl, n / 16, n / 16, gl.UNSIGNED_BYTE)
    this.tilePx = new Uint8Array((n / 16) * (n / 16) * 4)
    this.region = null        // active rectangle [x0,y0,x1,y1) in cells, null = all dry
    this.pendingRegion = undefined
    this.scanEvery = 64
    this.useRegion = true
    this.W = new PingPong(gl, n, n, type)
    this.F = new PingPong(gl, n, n, type)
    this.G = new PingPong(gl, n, n, type)
    this.D = new PingPong(gl, n, n, type)
    for (const pp of [this.W, this.F, this.G, this.D]) {
      if (!pp.a.ok || !pp.b.ok) throw new Error('float render target incomplete')
    }
    this.brush = null // { a:[x,y], b:[x,y], radius, level, dryness, pressure, pig:[4] }
    this.steps = 0
    this.clear()
  }

  clear() {
    this.region = null
    this.pendingRegion = undefined
    const gl = this.gl
    gl.clearColor(0, 0, 0, 0)
    for (const pp of [this.W, this.F, this.G, this.D]) {
      for (const t of [pp.a, pp.b]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  _bind(prog, target, textures) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null)
    gl.useProgram(prog.p)
    let unit = 0
    for (const [name, tex] of Object.entries(textures)) {
      const loc = prog.uni[name]
      if (loc === undefined) continue
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(loc, unit)
      unit++
    }
    const u = prog.uni
    if (u.u_px) gl.uniform2f(u.u_px, 1 / this.n, 1 / this.n)
    if (u.u_n) gl.uniform1f(u.u_n, this.n)
    if (u.u_paperInv) gl.uniform1f(u.u_paperInv, 1 / this.paper.size)
    return u
  }

  _brushUniforms(u) {
    const gl = this.gl, b = this.brush
    if (!b) { gl.uniform4f(u.u_brush2, 0, 0, 0, 0); return }
    gl.uniform4f(u.u_seg, b.a[0], b.a[1], b.b[0], b.b[1])
    gl.uniform4f(u.u_brush, b.radius, b.level, this.P.brushRate, b.dryness)
    gl.uniform4f(u.u_brush2, b.pressure, this.P.brushMix, 1, b.seed || 0)
    gl.uniform4f(u.u_bpig, b.pig[0], b.pig[1], b.pig[2], b.pig[3])
  }

  // grow the active rectangle (brush footprint, in cells)
  touch(x0, y0, x1, y1) {
    const n = this.n
    const r = [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(n, Math.ceil(x1)), Math.min(n, Math.ceil(y1))]
    if (!this.region) this.region = r
    else this.region = [Math.min(this.region[0], r[0]), Math.min(this.region[1], r[1]), Math.max(this.region[2], r[2]), Math.max(this.region[3], r[3])]
    if (this.pendingRegion !== undefined) this.pendingRegion = undefined
  }

  // Shrink the active rectangle to the tiles that are still wet, plus a margin
  // the water can't cross before the next scan (it moves ≤1 cell per step).
  // Applied one step late, so both ping-pong buffers agree outside it.
  _scan() {
    const gl = this.gl, n = this.n, t = n / 16
    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, t, t)
    const u = this._bind(this.progs.tileScan, this.tiles, { u_W: this.W.read.tex, u_G: this.G.read.tex })
    gl.uniform3f(u.u_thr, this.P.wEps * 0.25, 0.01, 1e-4)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.readPixels(0, 0, t, t, gl.RGBA, gl.UNSIGNED_BYTE, this.tilePx)
    let x0 = t, y0 = t, x1 = -1, y1 = -1
    for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
      if (this.tilePx[(y * t + x) * 4] > 127) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    }
    if (x1 < 0) { this.pendingRegion = null; return }
    const m = this.scanEvery + 8
    this.pendingRegion = [Math.max(0, x0 * 16 - m), Math.max(0, y0 * 16 - m), Math.min(n, (x1 + 1) * 16 + m), Math.min(n, (y1 + 1) * 16 + m)]
  }

  step() {
    const gl = this.gl, P = this.P, n = this.n
    if (this.brush) {
      // margin: the brush footprint plus what the water can cover before the
      // next scan (≤1 cell per step)
      const b = this.brush, r = b.radius + this.scanEvery + 8
      this.touch(Math.min(b.a[0], b.b[0]) - r, Math.min(b.a[1], b.b[1]) - r, Math.max(b.a[0], b.b[0]) + r, Math.max(b.a[1], b.b[1]) + r)
    }
    if (!this.useRegion) this.region = [0, 0, n, n]
    if (!this.region) return
    if (this.steps % this.scanEvery === 0 && this.useRegion && !this.brush) this._scan()
    // (while the brush is down the rectangle only grows; the scan resumes after)
    gl.viewport(0, 0, n, n)
    const R = this.region
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(R[0], R[1], R[2] - R[0], R[3] - R[1])
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const pap = this.paper.tex

    // 1. pipes
    let u = this._bind(this.progs.flux, this.F.write, { u_paper: pap, u_W: this.W.read.tex, u_F: this.F.read.tex })
    gl.uniform4f(u.u_flow, P.kFlow, P.damp, P.hScale, P.breach)
    gl.uniform2f(u.u_mask, P.wEps, P.sWet)
    gl.uniform1f(u.u_tilt, P.tilt)
    gl.uniform1f(u.u_wFlow, P.wFlow)
    gl.uniform2f(u.u_creep, P.creepLo, P.creepHi)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.F.swap()

    // 2. water (writes W.write, W.read stays the old state for the pigment passes)
    u = this._bind(this.progs.water, this.W.write, { u_paper: pap, u_W: this.W.read.tex, u_F: this.F.read.tex })
    gl.uniform4f(u.u_cap, P.capMin, P.capMax, P.absorb, P.kCap)
    gl.uniform4f(u.u_evap, P.evap, P.edgeBoost, P.evapS, P.sSrc)
    gl.uniform4f(u.u_mk, P.wEps, P.sWet, P.blurK, P.sPin)
    this._brushUniforms(u)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 3. settle / lift
    u = this._bind(this.progs.pigD, this.D.write, { u_paper: pap, u_W: this.W.read.tex, u_G: this.G.read.tex, u_D: this.D.read.tex })
    const pg = (k) => PIGMENTS.map((p) => p[k])
    gl.uniform4fv(u.u_gran, pg('gran').map((v) => Math.min(1, v * P.granMul)))
    gl.uniform4fv(u.u_dens, pg('dens'))
    gl.uniform4fv(u.u_stain, pg('stain'))
    gl.uniform4f(u.u_ex, P.settle, P.lift, P.w0, P.wDry)
    gl.uniform1f(u.u_wLift, P.wLift)
    gl.uniform1f(u.u_loose, P.loose)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 4. pigment transport
    u = this._bind(this.progs.pigG, this.G.write, {
      u_paper: pap, u_W: this.W.read.tex, u_F: this.F.read.tex, u_G: this.G.read.tex,
      u_D: this.D.read.tex, u_Dn: this.D.write.tex,
    })
    gl.uniform1f(u.u_kDiff, P.kDiff)
    this._brushUniforms(u)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    this.W.swap(); this.D.swap(); this.G.swap()
    this.steps++
    gl.disable(gl.SCISSOR_TEST)
    if (this.pendingRegion !== undefined && this.steps % this.scanEvery === 1) {
      this.region = this.pendingRegion
      this.pendingRegion = undefined
    }
  }

  dryAll() {
    const gl = this.gl, n = this.n
    gl.viewport(0, 0, n, n)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this._bind(this.progs.dryAll, this.D.write, { u_G: this.G.read.tex, u_D: this.D.read.tex })
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.D.swap()
    for (const pp of [this.W, this.F, this.G]) {
      // everything is now "dried once": fix = 1 (W.a = 2), so it lifts like dry paint
      gl.clearColor(0, 0, 0, pp === this.W ? 2 : 0)
      for (const t of [pp.a, pp.b]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
    }
    gl.clearColor(0, 0, 0, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.region = null
    this.pendingRegion = undefined
  }

  render(canvasW, canvasH, view) {
    const gl = this.gl
    gl.viewport(0, 0, canvasW, canvasH)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const u = this._bind(this.progs.display, null, {
      u_W: this.W.read.tex, u_G: this.G.read.tex, u_D: this.D.read.tex, u_paper: this.paper.tex,
    })
    gl.uniform1f(u.u_thick, this.P.thick)
    gl.uniform1f(u.u_shade, this.P.shade)
    gl.uniform1f(u.u_view, view)
    gl.uniform3f(u.u_paperCol, 0.965, 0.955, 0.93)
    PIGMENTS.forEach((p, i) => {
      gl.uniform3fv(u['u_K' + i], p.K)
      gl.uniform3fv(u['u_S' + i], p.S)
    })
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // Blocks until the GPU is done; used only for timing.
  finish() {
    const px = new Uint8Array(4)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px)
  }

  // Largest surface-water depth inside a rectangle of cells (float readback).
  maxSurface(x0, y0, x1, y1) {
    const gl = this.gl
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0))
    const w = Math.min(this.n, Math.ceil(x1)) - x0, h = Math.min(this.n, Math.ceil(y1)) - y0
    const buf = new Float32Array(w * h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.W.read.fb)
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, buf)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    let m = 0, wetCount = 0
    for (let i = 0; i < buf.length; i += 4) { m = Math.max(m, buf[i]); if (buf[i] > this.P.wFlow) wetCount++ }
    return { max: m, wetFrac: wetCount / (w * h) }
  }

  // Debug: sums over the whole grid (float readback, slow — dev only).
  totals() {
    const gl = this.gl, n = this.n
    const buf = new Float32Array(n * n * 4)
    const sum = (t) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
      gl.readPixels(0, 0, n, n, gl.RGBA, gl.FLOAT, buf)
      const s = [0, 0, 0, 0]
      let wet = 0
      for (let i = 0; i < buf.length; i += 4) { s[0] += buf[i]; s[1] += buf[i + 1]; s[2] += buf[i + 2]; s[3] += buf[i + 3]; if (buf[i] > this.P.wEps) wet++ }
      return { s, wet }
    }
    const W = sum(this.W.read), G = sum(this.G.read), D = sum(this.D.read)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const r = (v) => +v.toFixed(1)
    return { w: r(W.s[0]), s: r(W.s[1]), wetCells: W.wet, pinned: r(W.s[3]), g: G.s.map(r), d: D.s.map(r) }
  }

  shaderSizes() {
    return Object.fromEntries(Object.entries(this.progs).map(([k, p]) => [k, p.fsLength]))
  }

  destroy() {
    const gl = this.gl
    for (const pp of [this.W, this.F, this.G, this.D]) pp.destroy(gl)
    for (const p of Object.values(this.progs)) gl.deleteProgram(p.p)
  }
}
