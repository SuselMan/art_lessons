// A software WebGL1 mock, just faithful enough to exercise PencilEngine's
// real pixel pipeline (dab painting, erase, layer compositing/merging) inside
// vitest's plain 'node' environment — no browser, no GPU, no headless-gl
// native dependency.
//
// Deliberate scope cut: it does NOT replicate the paper-texture shading in
// DAB_FRAG (grain/roughness modulation, tilt-direction catch — see #95). That
// is a visual-fidelity concern, orthogonal to what engine/index.structural
// tests below check. What *is* replicated faithfully is the geometry (dab
// center/radius/angle/aspect → coverage shape) and, critically, the blend
// arithmetic (ONE/ONE_MINUS_SRC_ALPHA for paint+composite, ZERO/ONE_MINUS_
// SRC_ALPHA for erase) — that's the part that makes dab order and undo/redo
// replay order observable in the resulting pixels, which is exactly the
// property structural-op undo/redo/checkpoint/merge correctness depends on.
//
// Key simplification this relies on: every AccumulationBuffer pixel always
// has R === G === B === A (DAB_FRAG's non-erase output is
// vec4(deposit,deposit,deposit,deposit); its erase output is
// vec4(0,0,0,eraseAmount) blended with (ZERO, ONE_MINUS_SRC_ALPHA), which
// scales all four channels by the same factor). So the mock stores a single
// scalar per texel instead of 4, and replicates it on readback.
//
// #123 (batched dab rendering via ANGLE_instanced_arrays): getExtension
// returns a working shim by default (mirroring real WebGL1, where the
// extension is effectively always available), so every existing pixel test
// in this suite exercises the batched path by default — the same broad
// regression coverage real browsers get. _drawInstanced below reuses
// _rasterDab per instance (same math, same call, same order as the
// uniform-driven fallback loop) so it validates that engine code packs the
// right per-dab values into the instance buffer in the right order; it does
// NOT validate that real GPU hardware actually preserves cross-instance
// blend order — that's a WebGL/OpenGL ES spec guarantee (see
// _paintDabsInstanced's docstring in engine/index.ts), checked here by
// construction (this mock always loops instances 0..N-1 in order) and,
// ideally, by an actual browser run.

type UniformValue = number | number[]

interface MockProgram {
  fragTag: 'dab' | 'composite' | 'display' | 'papergen' | 'transform' | 'other'
  uniforms: Map<string, UniformValue>
}

interface MockLocation {
  program: MockProgram
  name: string
}

interface TextureInfo {
  width: number
  height: number
  data: Float32Array // single channel, 0..1
}

interface FramebufferInfo {
  texture: object | null
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

// Arbitrary but internally-consistent enum values — the engine only ever
// compares gl.CONST to values it read off the same gl instance, never a
// hardcoded literal, so exact numbers don't matter.
const ENUM = {
  VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
  COMPILE_STATUS: 3, LINK_STATUS: 4,
  ARRAY_BUFFER: 5, STATIC_DRAW: 6,
  TEXTURE_2D: 7, RGBA: 8, UNSIGNED_BYTE: 9,
  TEXTURE_MIN_FILTER: 10, TEXTURE_MAG_FILTER: 11, LINEAR: 12,
  TEXTURE_WRAP_S: 13, TEXTURE_WRAP_T: 14, CLAMP_TO_EDGE: 15,
  FRAMEBUFFER: 16, COLOR_ATTACHMENT0: 17, FRAMEBUFFER_COMPLETE: 18,
  COLOR_BUFFER_BIT: 19, TRIANGLES: 20, FLOAT: 21,
  BLEND: 22, ONE: 23, ONE_MINUS_SRC_ALPHA: 24, ZERO: 25,
  TEXTURE0: 100, TEXTURE1: 101,
}

export class MockGL {
  // expose the enum as instance properties, mirroring WebGLRenderingContext
  readonly VERTEX_SHADER = ENUM.VERTEX_SHADER
  readonly FRAGMENT_SHADER = ENUM.FRAGMENT_SHADER
  readonly COMPILE_STATUS = ENUM.COMPILE_STATUS
  readonly LINK_STATUS = ENUM.LINK_STATUS
  readonly ARRAY_BUFFER = ENUM.ARRAY_BUFFER
  readonly STATIC_DRAW = ENUM.STATIC_DRAW
  readonly TEXTURE_2D = ENUM.TEXTURE_2D
  readonly RGBA = ENUM.RGBA
  readonly UNSIGNED_BYTE = ENUM.UNSIGNED_BYTE
  readonly TEXTURE_MIN_FILTER = ENUM.TEXTURE_MIN_FILTER
  readonly TEXTURE_MAG_FILTER = ENUM.TEXTURE_MAG_FILTER
  readonly LINEAR = ENUM.LINEAR
  readonly TEXTURE_WRAP_S = ENUM.TEXTURE_WRAP_S
  readonly TEXTURE_WRAP_T = ENUM.TEXTURE_WRAP_T
  readonly CLAMP_TO_EDGE = ENUM.CLAMP_TO_EDGE
  readonly FRAMEBUFFER = ENUM.FRAMEBUFFER
  readonly COLOR_ATTACHMENT0 = ENUM.COLOR_ATTACHMENT0
  readonly FRAMEBUFFER_COMPLETE = ENUM.FRAMEBUFFER_COMPLETE
  readonly COLOR_BUFFER_BIT = ENUM.COLOR_BUFFER_BIT
  readonly TRIANGLES = ENUM.TRIANGLES
  readonly FLOAT = ENUM.FLOAT
  readonly BLEND = ENUM.BLEND
  readonly ONE = ENUM.ONE
  readonly ONE_MINUS_SRC_ALPHA = ENUM.ONE_MINUS_SRC_ALPHA
  readonly ZERO = ENUM.ZERO
  readonly TEXTURE0 = ENUM.TEXTURE0
  readonly TEXTURE1 = ENUM.TEXTURE1

  private _textureData = new Map<object, TextureInfo>()
  private _framebuffers = new Map<object, FramebufferInfo>()
  private _activeUnit = 0
  private _textureUnits: Array<object | null> = []
  private _boundTextureTarget: object | null = null // last bound, regardless of unit (texImage2D/texParameteri target)
  private _boundFramebuffer: object | null = null
  private _currentProgram: MockProgram | null = null
  private _blendSrc: number = ENUM.ONE
  private _clearAlpha = 0
  private _shaderSources = new Map<object, { type: number; source: string }>()

  // ── vertex attributes / instancing (#123) ───────────────────────────────
  private _boundArrayBuffer: object | null = null
  private _bufferData = new Map<object, Float32Array>()
  private _attribLocByName = new Map<object, Map<string, number>>() // program -> name -> location
  private _attribNameByLoc = new Map<number, string>()
  private _nextAttribLoc = 0
  private _attribBindings = new Map<number, {
    buffer: object | null; size: number; strideBytes: number; offsetBytes: number
    divisor: number; enabled: boolean
  }>()

  // ── shaders / programs ──────────────────────────────────────────────────

  createShader(type: number): object {
    const shader = {}
    this._shaderSources.set(shader, { type, source: '' })
    return shader
  }

  shaderSource(shader: object, source: string): void {
    const entry = this._shaderSources.get(shader)
    if (entry) entry.source = source
  }

  compileShader(_shader: object): void { /* always "succeeds" */ }
  getShaderParameter(_shader: object, _pname: number): boolean { return true }
  getShaderInfoLog(_shader: object): string { return '' }
  deleteShader(shader: object): void { this._shaderSources.delete(shader) }

  createProgram(): object {
    const program: MockProgram = { fragTag: 'other', uniforms: new Map() }
    return program
  }

  attachShader(program: object, shader: object): void {
    const prog = program as MockProgram
    const src = this._shaderSources.get(shader)
    if (src && src.type === ENUM.FRAGMENT_SHADER) prog.fragTag = this._tagFragShader(src.source)
  }

  private _tagFragShader(source: string): MockProgram['fragTag'] {
    if (source.includes('u_eraseMode')) return 'dab'
    if (source.includes('u_layer')) return 'composite'
    if (source.includes('u_accumulation')) return 'display'
    if (source.includes('u_warp')) return 'papergen'
    if (source.includes('u_matrixInv')) return 'transform'
    return 'other'
  }

  linkProgram(_program: object): void { /* always "succeeds" */ }
  getProgramParameter(_program: object, _pname: number): boolean { return true }
  getProgramInfoLog(_program: object): string { return '' }
  deleteProgram(_program: object): void { /* no-op */ }

  useProgram(program: object | null): void {
    this._currentProgram = program as MockProgram | null
  }

  getUniformLocation(program: object, name: string): MockLocation {
    return { program: program as MockProgram, name }
  }

  uniform1f(loc: MockLocation, v: number): void { loc.program.uniforms.set(loc.name, v) }
  uniform1i(loc: MockLocation, v: number): void { loc.program.uniforms.set(loc.name, v) }
  uniform2f(loc: MockLocation, a: number, b: number): void { loc.program.uniforms.set(loc.name, [a, b]) }
  uniform3fv(loc: MockLocation, v: number[] | Float32Array): void { loc.program.uniforms.set(loc.name, Array.from(v)) }
  uniformMatrix3fv(loc: MockLocation, _transpose: boolean, v: number[] | Float32Array): void {
    loc.program.uniforms.set(loc.name, Array.from(v))
  }

  // Distinct per (program, name) — #123's instanced dab program has several
  // attributes (a_position/a_instA/a_instB/a_opacity) that each need their
  // own index so _drawInstanced can tell them apart via _attribNameByLoc;
  // the pre-#123 single-attribute-per-program world never needed that, only
  // a stable per-program value to round-trip through enable/pointer calls.
  getAttribLocation(program: object, name: string): number {
    let byName = this._attribLocByName.get(program)
    if (!byName) { byName = new Map(); this._attribLocByName.set(program, byName) }
    let loc = byName.get(name)
    if (loc === undefined) {
      loc = this._nextAttribLoc++
      byName.set(name, loc)
      this._attribNameByLoc.set(loc, name)
    }
    return loc
  }

  enableVertexAttribArray(loc: number): void {
    const b = this._attribBindings.get(loc) ?? { buffer: null, size: 2, strideBytes: 0, offsetBytes: 0, divisor: 0, enabled: false }
    b.enabled = true
    this._attribBindings.set(loc, b)
  }

  vertexAttribPointer(loc: number, size: number, _type: number, _normalized: boolean, strideBytes: number, offsetBytes: number): void {
    const existing = this._attribBindings.get(loc)
    this._attribBindings.set(loc, {
      buffer: this._boundArrayBuffer,
      size, strideBytes, offsetBytes,
      divisor: existing?.divisor ?? 0,
      enabled: existing?.enabled ?? false,
    })
  }

  // ── buffers ──────────────────────────────────────────────────────────────

  createBuffer(): object { return {} }

  bindBuffer(_target: number, buf: object | null): void { this._boundArrayBuffer = buf }

  // Only ARRAY_BUFFER is ever bound in this codebase (no index buffers) —
  // stores a Float32Array copy so #123's instanced attributes can be read
  // back per-instance in _drawInstanced. Pre-#123 callers (createQuadBuffer/
  // createFullscreenQuad) also call this, but the mock never needed the
  // contents before — harmless to now store them too.
  bufferData(_target: number, data: ArrayBufferView | number[] | null, _usage: number): void {
    if (!this._boundArrayBuffer || data == null) return
    const arr = ArrayBuffer.isView(data)
      ? new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4)
      : new Float32Array(data)
    this._bufferData.set(this._boundArrayBuffer, arr.slice())
  }

  deleteBuffer(): void { /* no-op */ }

  // ── textures ─────────────────────────────────────────────────────────────

  createTexture(): object { return {} }

  activeTexture(unit: number): void { this._activeUnit = unit - ENUM.TEXTURE0 }

  bindTexture(_target: number, tex: object | null): void {
    this._textureUnits[this._activeUnit] = tex
    this._boundTextureTarget = tex
  }

  texParameteri(): void { /* filtering irrelevant: mock samples 1:1, no interpolation */ }

  texImage2D(
    _target: number, _level: number, _internalFormat: number,
    width: number, height: number, _border: number,
    _format: number, _type: number, pixels: ArrayBufferView | null,
  ): void {
    const tex = this._boundTextureTarget
    if (!tex) return
    const data = new Float32Array(width * height)
    if (pixels && (pixels as Uint8Array).length > 0) {
      const src = pixels as Uint8Array
      for (let i = 0; i < width * height; i++) data[i] = src[i * 4 + 3] / 255
    }
    this._textureData.set(tex, { width, height, data })
  }

  deleteTexture(tex: object): void { this._textureData.delete(tex) }

  // Mirrors AccumulationBuffer.copyTo: reads from the bound-for-read
  // framebuffer's own texture (same convention _currentTargetTexture()
  // already uses for readPixels/drawArrays), writes into the texture bound
  // via bindTexture. Only ever called with matching source/dest dimensions
  // in this codebase, so no scaling/clipping to worry about.
  copyTexImage2D(_target: number, _level: number, _internalFormat: number, _x: number, _y: number, width: number, height: number, _border: number): void {
    const destTex = this._boundTextureTarget
    if (!destTex) return
    const srcInfo = this._currentTargetTexture()
    const data = new Float32Array(width * height)
    if (srcInfo) data.set(srcInfo.data.subarray(0, width * height))
    this._textureData.set(destTex, { width, height, data })
  }

  // ── framebuffers ─────────────────────────────────────────────────────────

  createFramebuffer(): object { return {} }

  bindFramebuffer(_target: number, fbo: object | null): void {
    this._boundFramebuffer = fbo
  }

  framebufferTexture2D(_target: number, _attachment: number, _textarget: number, texture: object, _level: number): void {
    const fbo = this._boundFramebuffer
    if (!fbo) return
    this._framebuffers.set(fbo, { texture })
  }

  checkFramebufferStatus(): number { return ENUM.FRAMEBUFFER_COMPLETE }
  deleteFramebuffer(fbo: object): void { this._framebuffers.delete(fbo) }

  // ── state ────────────────────────────────────────────────────────────────

  viewport(): void { /* mock rasterizes at the target texture's own dimensions */ }
  // BLEND is enabled at every dab/composite draw call site in this codebase
  // (beginDraw/beginErase/_compositeTextures) and disabled only around the
  // 'papergen'/'display' passes this mock doesn't rasterize — so there's no
  // draw call where tracking on/off would change rasterization behavior.
  enable(_cap: number): void { /* no-op: see above */ }
  disable(_cap: number): void { /* no-op: see above */ }

  // The dst factor is never tracked: every blendFunc call in this codebase
  // pairs its src factor with ONE_MINUS_SRC_ALPHA (paint/composite use ONE,
  // erase uses ZERO) — see the module docstring's blend-arithmetic note.
  blendFunc(src: number, _dst: number): void { this._blendSrc = src }

  clearColor(_r: number, _g: number, _b: number, a: number): void { this._clearAlpha = a }

  clear(_mask: number): void {
    const info = this._currentTargetTexture()
    if (!info) return
    info.data.fill(this._clearAlpha)
  }

  // ── draw / readback ──────────────────────────────────────────────────────

  drawArrays(_mode: number, _first: number, _count: number): void {
    const prog = this._currentProgram
    if (!prog) return
    const info = this._currentTargetTexture()
    if (!info) return // e.g. drawing to the (unmocked) canvas — display pass, not asserted on

    switch (prog.fragTag) {
      case 'dab': this._rasterDab(info, prog.uniforms); break
      case 'composite': this._rasterComposite(info, prog.uniforms); break
      case 'transform': this._rasterTransform(info, prog.uniforms); break
      // 'display' / 'papergen': visual-only passes never read back via
      // readPixels() in these tests — intentionally not rasterized.
      default: break
    }
  }

  // #123: ANGLE_instanced_arrays shim. Returns a working object (not null)
  // so every existing pixel test in this suite exercises the batched dab
  // path by default, mirroring real WebGL1 where the extension is
  // effectively always present — see the module docstring.
  getExtension(name: string): {
    vertexAttribDivisorANGLE: (index: number, divisor: number) => void
    drawArraysInstancedANGLE: (mode: number, first: number, count: number, primcount: number) => void
  } | null {
    if (name !== 'ANGLE_instanced_arrays') return null
    return {
      vertexAttribDivisorANGLE: (index: number, divisor: number) => {
        const b = this._attribBindings.get(index) ?? { buffer: null, size: 2, strideBytes: 0, offsetBytes: 0, divisor: 0, enabled: false }
        b.divisor = divisor
        this._attribBindings.set(index, b)
      },
      drawArraysInstancedANGLE: (_mode: number, _first: number, _count: number, primcount: number) => {
        this._drawInstanced(primcount)
      },
    }
  }

  readPixels(_x: number, _y: number, width: number, height: number, _format: number, _type: number, out: Uint8Array): void {
    const info = this._currentTargetTexture()
    if (!info) { out.fill(0); return }
    for (let i = 0; i < width * height; i++) {
      const v = Math.round(clamp(info.data[i] ?? 0, 0, 1) * 255)
      out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = v
    }
  }

  private _currentTargetTexture(): TextureInfo | null {
    const fbo = this._boundFramebuffer
    if (!fbo) return null
    const fboInfo = this._framebuffers.get(fbo)
    if (!fboInfo || !fboInfo.texture) return null
    return this._textureData.get(fboInfo.texture) ?? null
  }

  private _blendSrcFactor(): number {
    return this._blendSrc === ENUM.ONE ? 1 : 0
  }

  // #123: replays the same per-instance dab in submission order (0..N-1),
  // each going through the exact same _rasterDab call/blend the uniform-
  // driven fallback loop uses — this is what makes the mock a faithful
  // regression check for "did engine code pack the right values, in the
  // right order, into the instance buffer," not a check of GPU rasterizer
  // internals (see module docstring).
  private _drawInstanced(primcount: number): void {
    const prog = this._currentProgram
    if (!prog) return
    const info = this._currentTargetTexture()
    if (!info) return
    if (prog.fragTag !== 'dab') return // only the batched dab path instances in this codebase

    for (let i = 0; i < primcount; i++) {
      const merged = new Map(prog.uniforms)
      for (const [loc, b] of this._attribBindings) {
        if (!b.enabled || b.divisor !== 1) continue
        const name = this._attribNameByLoc.get(loc)
        const buf = b.buffer ? this._bufferData.get(b.buffer) : undefined
        if (!name || !buf) continue

        const strideFloats = b.strideBytes === 0 ? b.size : b.strideBytes / 4
        const base = b.offsetBytes / 4 + i * strideFloats
        const vals: number[] = []
        for (let k = 0; k < b.size; k++) vals.push(buf[base + k] ?? 0)

        // Matches DAB_VERT_INSTANCED's attribute layout in shaders.ts.
        switch (name) {
          case 'a_instA':
            merged.set('u_dabCenter', [vals[0], vals[1]])
            merged.set('u_dabRadius', vals[2])
            merged.set('u_angle', vals[3])
            break
          case 'a_instB':
            merged.set('u_aspectRatio', vals[0])
            merged.set('u_pressure', vals[1])
            merged.set('u_tiltX', vals[2])
            merged.set('u_tiltY', vals[3])
            break
          case 'a_opacity':
            merged.set('u_opacity', vals[0])
            break
          default: break
        }
      }
      this._rasterDab(info, merged)
    }
  }

  private _rasterDab(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const [cx, cy] = (uniforms.get('u_dabCenter') as number[]) ?? [0, 0]
    const dabRadius = (uniforms.get('u_dabRadius') as number) ?? 1
    const angle = (uniforms.get('u_angle') as number) ?? 0
    const aspectRatio = Math.max((uniforms.get('u_aspectRatio') as number) ?? 1, 1e-6)
    const pressure = (uniforms.get('u_pressure') as number) ?? 1
    const hardness = (uniforms.get('u_hardness') as number) ?? 0.5
    const opacity = (uniforms.get('u_opacity') as number) ?? 1
    const eraseMode = (uniforms.get('u_eraseMode') as number) ?? 0
    const innerEdge = hardness * 0.85
    const c = Math.cos(angle), s = Math.sin(angle)
    const sf = this._blendSrcFactor()

    // Bound the affected region for speed (radius*2 covers the unit quad's
    // -0.5..0.5 span already scaled by dabRadius*2 in the real vertex
    // shader; pad generously since aspect/rotation can extend the footprint).
    const pad = dabRadius * 2.5 * Math.max(aspectRatio, 1) + 2
    const minX = Math.max(0, Math.floor(cx - pad))
    const maxX = Math.min(width, Math.ceil(cx + pad))
    const minY = Math.max(0, Math.floor(cy - pad))
    const maxY = Math.min(height, Math.ceil(cy + pad))

    for (let py = minY; py < maxY; py++) {
      for (let px = minX; px < maxX; px++) {
        const dx = px + 0.5 - cx
        const dy = py + 0.5 - cy
        const rx = dx / (dabRadius * 2)
        const ry = dy / (dabRadius * 2)
        // inverse rotation of the real vertex shader's forward rotation
        const scaledX = rx * c + ry * s
        const scaledY = -rx * s + ry * c
        const aPosX = scaledX / aspectRatio
        const aPosY = scaledY
        const uvx = (aPosX * 2) / Math.max(aspectRatio, 1)
        const uvy = aPosY * 2
        const dist = Math.hypot(uvx, uvy)
        if (dist > 1) continue

        let shape = 1 - smoothstep(innerEdge, 1, dist)
        shape *= 1 - Math.exp(-8 * (1 - dist))

        const idx = py * width + px
        if (eraseMode > 0.5) {
          const eraseAmount = clamp(pressure * opacity * shape, 0, 1)
          data[idx] = eraseAmount * sf + data[idx] * (1 - eraseAmount)
        } else {
          const deposit = clamp(pressure * opacity * shape, 0, 1)
          data[idx] = deposit * sf + data[idx] * (1 - deposit)
        }
      }
    }
  }

  private _rasterComposite(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const unit = (uniforms.get('u_layer') as number) ?? 0
    const opacity = (uniforms.get('u_opacity') as number) ?? 1
    const srcTex = this._textureUnits[unit] ?? null
    const srcInfo = srcTex ? this._textureData.get(srcTex) : undefined
    const sf = this._blendSrcFactor()

    for (let i = 0; i < width * height; i++) {
      const srcAlpha = srcInfo ? clamp((srcInfo.data[i] ?? 0) * opacity, 0, 1) : 0
      data[i] = srcAlpha * sf + data[i] * (1 - srcAlpha)
    }
  }

  // Mirrors TRANSFORM_BLIT_FRAG: for each destination texel, apply the
  // (already-inverted) matrix to find where it samples from in the source.
  // u_matrixInv arrives as a flat 9-number column-major array (u_matrixInv
  // set via uniformMatrix3fv above) — mat3(m) * vec3(x,y,1) in GLSL reads
  // out as x*col0 + y*col1 + 1*col2, i.e. srcX = x*m[0] + y*m[3] + m[6],
  // srcY = x*m[1] + y*m[4] + m[7]. Nearest-neighbor rather than the real
  // shader's bilinear sample — fine for this mock's stated non-goal of
  // visual fidelity; tests should stick to boundaries where that
  // difference doesn't matter (whole-pixel translates, axis-aligned
  // scales/rotations) or use a tolerance like expectPixelsClose.
  // #133 (infinite canvas): the real engine always blends this pass now
  // (ONE, ONE_MINUS_SRC_ALPHA — see _runTransformBlit's docstring for why
  // that's equivalent to a plain replace for its old single-pass callers,
  // and necessary for the tile-aware bake's multi-pass-per-destination-tile
  // case). Must mirror that blend here, not unconditionally overwrite: a
  // transparent (out-of-source-range) sample from one pass must leave an
  // earlier pass's already-valid pixel alone, exactly like the composite/
  // dab rasterizers below already do via _blendSrcFactor().
  private _rasterTransform(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const unit = (uniforms.get('u_source') as number) ?? 0
    const [bw, bh] = (uniforms.get('u_bufferSize') as number[]) ?? [width, height]
    const m = (uniforms.get('u_matrixInv') as number[]) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
    const srcTex = this._textureUnits[unit] ?? null
    const srcInfo = srcTex ? this._textureData.get(srcTex) : undefined
    const sf = this._blendSrcFactor()

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = py * width + px
        const dstX = px + 0.5, dstY = py + 0.5
        const srcX = dstX * m[0] + dstY * m[3] + m[6]
        const srcY = dstX * m[1] + dstY * m[4] + m[7]
        let srcAlpha = 0
        if (srcInfo && srcX >= 0 && srcX < bw && srcY >= 0 && srcY < bh) {
          const sx = Math.min(Math.floor(srcX), srcInfo.width - 1)
          const sy = Math.min(Math.floor(srcY), srcInfo.height - 1)
          srcAlpha = srcInfo.data[sy * srcInfo.width + sx] ?? 0
        }
        data[idx] = srcAlpha * sf + data[idx] * (1 - srcAlpha)
      }
    }
  }
}
