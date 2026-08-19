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

export type UniformValue = number | number[]

interface MockProgram {
  fragTag: 'dab' | 'composite' | 'display' | 'papergen' | 'transform' | 'imageBlit' | 'smudge' | 'smudgePickup'
    | 'areaTransform' | 'areaMask' | 'other'
  uniforms: Map<string, UniformValue>
}

export interface MockLocation {
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

/** texture2D() against this mock's single-channel storage, in the same
 *  top-down convention the rest of the file uses (see copyTexImage2D's own
 *  comment). Nearest rather than bilinear: real smudge sampling is LINEAR,
 *  but the two agree wherever it matters here — imprint and patch are the
 *  same size in a normal stroke, so every lookup lands mid-texel — and
 *  nearest keeps the mock's arithmetic exactly reproducible. Out of range
 *  clamps to the edge, matching CLAMP_TO_EDGE; an unbound texture reads 0,
 *  the same graceful degrade the rasterizers' own guards give. */
function sampleUnit(info: TextureInfo | undefined, u: number, v: number): number {
  if (!info) return 0
  const x = clamp(Math.floor(u * info.width), 0, info.width - 1)
  const y = clamp(Math.floor(v * info.height), 0, info.height - 1)
  return info.data[y * info.width + x] ?? 0
}

// Arbitrary but internally-consistent enum values — the engine only ever
// compares gl.CONST to values it read off the same gl instance, never a
// hardcoded literal, so exact numbers don't matter.
const ENUM = {
  VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
  COMPILE_STATUS: 3, LINK_STATUS: 4,
  ARRAY_BUFFER: 5, STATIC_DRAW: 6,
  TEXTURE_2D: 7, RGBA: 8, UNSIGNED_BYTE: 9, LUMINANCE: 26, LUMINANCE_ALPHA: 27,
  TEXTURE_MIN_FILTER: 10, TEXTURE_MAG_FILTER: 11, LINEAR: 12, NEAREST: 29,
  LINEAR_MIPMAP_LINEAR: 61, NO_ERROR: 0, MAX_TEXTURE_SIZE: 62,
  TEXTURE_WRAP_S: 13, TEXTURE_WRAP_T: 14, CLAMP_TO_EDGE: 15,
  FRAMEBUFFER: 16, COLOR_ATTACHMENT0: 17, FRAMEBUFFER_COMPLETE: 18,
  COLOR_BUFFER_BIT: 19, TRIANGLES: 20, FLOAT: 21,
  BLEND: 22, ONE: 23, ONE_MINUS_SRC_ALPHA: 24, ZERO: 25, SRC_ALPHA: 28,
  // (#446) The selection mask's own upload format — one byte per texel,
  // which this mock's single-scalar-per-texel model happens to match exactly.
  ALPHA: 30,
  TEXTURE0: 100, TEXTURE1: 101,
  UNPACK_ALIGNMENT: 102,
  // #141: infinite-canvas paper texture wrap mode — REPEAT vs CLAMP_TO_EDGE
  // is otherwise never observable through this mock (texParameteri used to
  // be a total no-op — see its own comment), so a test asserting the fix
  // actually requests REPEAT for an infinite room needs a real, distinct
  // enum value here.
  REPEAT: 200,
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
  readonly LUMINANCE = ENUM.LUMINANCE
  readonly LUMINANCE_ALPHA = ENUM.LUMINANCE_ALPHA
  readonly TEXTURE_MIN_FILTER = ENUM.TEXTURE_MIN_FILTER
  readonly TEXTURE_MAG_FILTER = ENUM.TEXTURE_MAG_FILTER
  readonly LINEAR = ENUM.LINEAR
  readonly NEAREST = ENUM.NEAREST
  readonly LINEAR_MIPMAP_LINEAR = ENUM.LINEAR_MIPMAP_LINEAR
  readonly NO_ERROR = ENUM.NO_ERROR
  readonly MAX_TEXTURE_SIZE = ENUM.MAX_TEXTURE_SIZE
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
  readonly SRC_ALPHA = ENUM.SRC_ALPHA
  readonly ALPHA = ENUM.ALPHA
  readonly TEXTURE0 = ENUM.TEXTURE0
  readonly TEXTURE1 = ENUM.TEXTURE1
  readonly REPEAT = ENUM.REPEAT
  readonly UNPACK_ALIGNMENT = ENUM.UNPACK_ALIGNMENT

  private _textureData = new Map<object, TextureInfo>()
  // #141 introspection only (see texParameteri) — never read by any
  // rasterization path in this mock.
  private _textureWrap = new Map<object, { wrapS: number; wrapT: number }>()
  private _mipmapGenerations = new Map<object, number>()
  private _minFilter = new Map<object, number>()
  private _framebuffers = new Map<object, FramebufferInfo>()
  private _activeUnit = 0
  private _textureUnits: Array<object | null> = []
  private _boundTextureTarget: object | null = null // last bound, regardless of unit (texImage2D/texParameteri target)
  private _boundFramebuffer: object | null = null
  private _currentProgram: MockProgram | null = null
  private _blendSrc: number = ENUM.ONE
  private _blendDst: number = ENUM.ONE_MINUS_SRC_ALPHA
  private _blendEnabled = true
  private _clearAlpha = 0
  private _shaderSources = new Map<object, { type: number; source: string }>()

  // ── vertex attributes / instancing (#123) ───────────────────────────────
  private _viewport = { x: 0, y: 0, w: 0, h: 0 }
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
    if (!src) return
    if (src.type === ENUM.FRAGMENT_SHADER) prog.fragTag = this._tagFragShader(src.source)
  }

  private _tagFragShader(source: string): MockProgram['fragTag'] {
    if (source.includes('u_eraseMode')) return 'dab'
    // Order matters against 'dab' above only: DAB_FRAG is caught by
    // u_eraseMode first, and these two names appear in no other shader.
    if (source.includes('u_patchOrigin')) return 'smudge'
    if (source.includes('u_rate')) return 'smudgePickup'
    if (source.includes('u_layer')) return 'composite'
    if (source.includes('u_accumulation')) return 'display'
    if (source.includes('u_warp')) return 'papergen'
    // (#446) Both selection shaders must be caught *before* 'transform':
    // AREA_TRANSFORM_FRAG declares u_matrixInv too, and tagging it as the
    // plain transform would silently rasterize it with no mask at all — an
    // engine test would then watch a whole layer move and call it a passing
    // selection test.
    if (source.includes('u_srcOrigin')) return 'areaTransform'
    if (source.includes('u_dstOrigin')) return 'areaMask'
    if (source.includes('u_matrixInv')) return 'transform'
    if (source.includes('u_imageRect')) return 'imageBlit'
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
  uniform4f(loc: MockLocation, a: number, b: number, c: number, d: number): void { loc.program.uniforms.set(loc.name, [a, b, c, d]) }
  uniform4fv(loc: MockLocation, v: number[] | Float32Array): void { loc.program.uniforms.set(loc.name, Array.from(v)) }
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

  disableVertexAttribArray(loc: number): void {
    const b = this._attribBindings.get(loc)
    if (b) b.enabled = false
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

  // Filtering (MIN/MAG_FILTER) is irrelevant: mock sampling is always 1:1,
  // no interpolation. Wrap mode (WRAP_S/T) IS recorded (#141) — needed so a
  // test can confirm the infinite-canvas paper texture actually requests
  // REPEAT (vs a bounded room's CLAMP_TO_EDGE) — see getTextureWrap. Never
  // consulted by any sampling code in this mock (texture2D-equivalent reads
  // — _rasterComposite/_rasterTransform's nearest-neighbor lookups — still
  // don't wrap/clamp), purely an introspection hook.
  texParameteri(_target: number, pname: number, param: number): void {
    const tex = this._boundTextureTarget
    if (!tex) return
    const wrap = this._textureWrap.get(tex) ?? { wrapS: ENUM.CLAMP_TO_EDGE, wrapT: ENUM.CLAMP_TO_EDGE }
    if (pname === ENUM.TEXTURE_WRAP_S) wrap.wrapS = param
    if (pname === ENUM.TEXTURE_WRAP_T) wrap.wrapT = param
    this._textureWrap.set(tex, wrap)
    // (#365) MIN_FILTER is recorded now too — see generateMipmap.
    if (pname === ENUM.TEXTURE_MIN_FILTER) this._minFilter.set(tex, param)
  }

  // pixelStorei affects only real-GL row-alignment during unpack — this
  // mock reads whole typed arrays directly (no row-stride math), so it's a
  // true no-op; kept only so callers (e.g. paperLoader.ts's
  // uploadPaperTexture, matching real-browser practice for a LUMINANCE
  // upload) don't hit a missing-method error under vitest's mocked gl.
  pixelStorei(_pname: number, _param: number): void { /* no-op */ }

  // Two overloads, exactly as real WebGL1 has them. The 6-argument form takes
  // a DOM source (an HTMLImageElement — reference-image import, #88/#398)
  // instead of a size plus a pixel array; it arrives here as
  // (target, level, internalFormat, format, type, source), so `format` lands
  // in `width`'s slot and the source in `_border`'s. Told apart by the 7th
  // argument being absent, which is the only difference real GL uses too.
  // A DOM source has no readable pixels outside a browser, so it uploads as
  // uniformly opaque (1.0) — enough for the image-blit rasterizer below to
  // make the *placement* of an imported image observable, which is what the
  // tests here are about; its content is not.
  texImage2D(
    _target: number, _level: number, _internalFormat: number,
    width: number, height: number, _border: number | { width: number; height: number },
    format?: number, _type?: number, pixels?: ArrayBufferView | null,
  ): void {
    const tex = this._boundTextureTarget
    if (!tex) return
    if (format === undefined) {
      const source = _border as { width: number; height: number }
      const data = new Float32Array(source.width * source.height).fill(1)
      this._textureData.set(tex, { width: source.width, height: source.height, data })
      return
    }
    const data = new Float32Array(width * height)
    if (pixels && (pixels as Uint8Array).length > 0) {
      const src = pixels as Uint8Array
      // LUMINANCE (unused directly by paperLoader.ts anymore, kept for any
      // other single-channel caller): 1 byte per texel, already the real
      // value — no channel to pick out. LUMINANCE_ALPHA (paperLoader.ts's
      // baked paper-grain uploads, R=height/A=catch — see paperNoise.ts's
      // paperCatchValue): 2 bytes per texel; this mock's own single-scalar-
      // per-texel model (see the module docstring) stores just the first
      // (height) channel — it never rasterizes DAB_FRAG's/PAPER_BLEND_
      // FRAG's paper sampling anyway (documented scope cut), so this is
      // introspection-only, never read back for paper. RGBA
      // (AccumulationBuffer's checkpoint/undo pixel restore): 4 bytes per
      // texel, alpha carries the value — see the module docstring's
      // "R===G===B===A" invariant.
      // ALPHA (#446, the selection mask): 1 byte per texel carrying coverage
      // directly — same single-byte layout as LUMINANCE, different meaning.
      if (format === ENUM.LUMINANCE || format === ENUM.ALPHA) {
        for (let i = 0; i < width * height; i++) data[i] = src[i] / 255
      } else if (format === ENUM.LUMINANCE_ALPHA) {
        for (let i = 0; i < width * height; i++) data[i] = src[i * 2] / 255
      } else {
        for (let i = 0; i < width * height; i++) data[i] = src[i * 4 + 3] / 255
      }
    }
    this._textureData.set(tex, { width, height, data })
  }

  deleteTexture(tex: object): void { this._textureData.delete(tex); this._textureWrap.delete(tex); this._mipmapGenerations.delete(tex); this._minFilter.delete(tex) }

  // ── #141 test introspection ─────────────────────────────────────────────
  // This mock deliberately doesn't rasterize DAB_FRAG's/PAPER_BLEND_FRAG's
  // paper-height sampling at all (see the module docstring's "deliberate
  // scope cut") or PAPER_GEN_FRAG's noise generation, so a pixel readback
  // can't observe whether the engine threaded a tile's world origin into
  // the paper-UV uniforms correctly, or whether it requested the right
  // texture size/wrap mode. These three read-only, purely-additive getters
  // let a test check that plumbing directly instead — they never influence
  // any rasterization behavior, so they can't affect any pre-#141 test.

  /** The last value a given uniform was set to on its own program (a
   *  location is permanently tied to one program — see getUniformLocation)
   *  — e.g. `readUniform(engine's cached u_paperOrigin location)`. */
  readUniform(loc: MockLocation): UniformValue | undefined {
    return loc.program.uniforms.get(loc.name)
  }

  getTextureSize(tex: object): { width: number; height: number } | null {
    const info = this._textureData.get(tex)
    return info ? { width: info.width, height: info.height } : null
  }

  getTextureWrap(tex: object): { wrapS: number; wrapT: number } | null {
    return this._textureWrap.get(tex) ?? null
  }

  // (#365) Mip chains are not rasterized here — this mock samples 1:1 and has
  // no notion of a level. What it does record is *that* a chain was asked
  // for, and the min filter each texture currently carries, which is enough
  // to pin the one invariant a mip bug actually turns on: a texture must
  // never be left asking for levels it has not been given (in real GLES2
  // that texture is incomplete and samples as opaque black — the same
  // symptom #363 chased). See getMinFilter/getMipmapGenerations.
  // This mock never fails a GL call, so it always reports a clean queue —
  // enough for paperLoader's generatePaperMipmaps to take its success path
  // (the interesting branch); the driver-refuses path is only reachable on
  // real hardware and is deliberately a graceful degrade, not an error.
  getError(): number { return ENUM.NO_ERROR }

  // (#474) Present so gpuInfo() — which every snapshot restore now calls to
  // stamp its report — exercises the same shape here as in a browser. A mock
  // that simply lacks the method turns a diagnostic into a crash, which is the
  // one thing a diagnostic must never be.
  getParameter(pname: number): number | null {
    return pname === ENUM.MAX_TEXTURE_SIZE ? 4096 : null
  }

  generateMipmap(_target: number): void {
    const tex = this._boundTextureTarget
    if (!tex) return
    this._mipmapGenerations.set(tex, (this._mipmapGenerations.get(tex) ?? 0) + 1)
  }

  /** How many times generateMipmap() has been called for this texture. */
  getMipmapGenerations(tex: object): number {
    return this._mipmapGenerations.get(tex) ?? 0
  }

  /** The texture's current TEXTURE_MIN_FILTER, or null if never set. */
  getMinFilter(tex: object): number | null {
    return this._minFilter.get(tex) ?? null
  }

  // Mirrors AccumulationBuffer.copyTo/copyRegionTo: reads a `width x
  // height` rect from the bound-for-read framebuffer's own texture (same
  // convention _currentTargetTexture() already uses for readPixels/
  // drawArrays), writing into the texture bound via bindTexture.
  // AccumulationBuffer.copyTo always passes (x,y)=(0,0) with width/height
  // matching the source exactly (a whole-buffer copy) — copyRegionTo
  // (smudge's own scratch-patch pickup, #14) passes an arbitrary sub-rect,
  // so this must actually honor x/y, not just assume (0,0) the way it used
  // to when copyTo was the only caller.
  //
  // (x,y) arrive GL-native bottom-up (row 0 = framebuffer bottom), same as
  // real copyTexImage2D — but this mock's own `data` is top-down throughout
  // (see _rasterComposite's identical topY flip for gl.viewport's y), so
  // the source rect's top-down starting row has to be recovered the same
  // way before indexing into it. Out-of-bounds rows/columns (a request
  // reaching past the source texture's own edge) read as 0 — real
  // copyTexImage2D's behavior there is implementation-defined/clamped, not
  // something any caller in this codebase relies on (see
  // _paintOneSmudgeDab's own bounds check, which skips a dab rather than
  // ever requesting an out-of-range rect).
  copyTexImage2D(_target: number, _level: number, _internalFormat: number, x: number, y: number, width: number, height: number, _border: number): void {
    const destTex = this._boundTextureTarget
    if (!destTex) return
    const srcInfo = this._currentTargetTexture()
    const data = new Float32Array(width * height)
    if (srcInfo) {
      const topY = srcInfo.height - (y + height)
      for (let row = 0; row < height; row++) {
        const srcRow = topY + row
        if (srcRow < 0 || srcRow >= srcInfo.height) continue
        for (let col = 0; col < width; col++) {
          const srcCol = x + col
          if (srcCol < 0 || srcCol >= srcInfo.width) continue
          data[row * width + col] = srcInfo.data[srcRow * srcInfo.width + srcCol]
        }
      }
    }
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

  // Infinite canvas (#133 Phase 1): _drawTileComposite positions a tile via
  // gl.viewport (see its own comment in engine/index.ts for why — a real
  // ANGLE/D3D driver bug with the shader-transform approach this replaced),
  // so unlike every other draw in this codebase (which always sets the
  // viewport to the full target size), a composite draw can now rasterize
  // into a sub-rect. Recorded here and consulted by _rasterComposite.
  viewport(x: number, y: number, w: number, h: number): void { this._viewport = { x, y, w, h } }
  // Tracked since #330: BLEND used to be enabled at every dab/composite draw
  // call site in this codebase (beginDraw/beginErase/_compositeTextures) and
  // disabled only around the 'papergen'/'display' passes this mock doesn't
  // rasterize, so on/off could safely be ignored. That stopped being true when
  // marker's composite pass moved to AccumulationBuffer.beginReplaceDraw() — a
  // real dab draw with blending genuinely off, whose output *overwrites* the
  // destination. Left untracked, this mock would keep silently modelling it as
  // the "over" blend the fix exists to remove.
  enable(cap: number): void { if (cap === ENUM.BLEND) this._blendEnabled = true }
  disable(cap: number): void { if (cap === ENUM.BLEND) this._blendEnabled = false }

  /** True when the last draw call ran with blending on. Exposed for tests that
   *  assert *which* blend mode a pass uses (see index.marker.test.ts) — the
   *  rasterizers below consult the same flag. */
  get blendEnabled(): boolean { return this._blendEnabled }

  /** Per-u_inkMode snapshot of the most recent dab draw (#330).
   *
   *  Reading `blendEnabled`/`readUniform` after the fact can't answer "how was
   *  *that* pass drawn": marker fires three dab draws per dab in a fixed order
   *  (coverage 3 -> inkLoad 4 -> composite 2), each with its own blend state
   *  and its own u_opacity, and every one of them is immediately followed by
   *  endDraw() turning blending back off. Recording at draw time is the only
   *  way to assert on a pass that isn't the last one.
   *
   *  Keyed by ink mode rather than appended to a log so this stays O(1) — a
   *  pencil pixel test draws thousands of dabs through this same path. */
  private _dabDraws = new Map<number, { blendEnabled: boolean; opacity: number; count: number }>()

  private _recordDabDraw(uniforms: Map<string, UniformValue>): void {
    const inkMode = (uniforms.get('u_inkMode') as number) ?? 0
    this._dabDraws.set(inkMode, {
      blendEnabled: this._blendEnabled,
      opacity: (uniforms.get('u_opacity') as number) ?? 1,
      count: (this._dabDraws.get(inkMode)?.count ?? 0) + 1,
    })
  }

  /** The most recent dab draw made with this u_inkMode plus how many there have
   *  been, or undefined if no such draw happened. See _dabDraws. */
  lastDabDraw(inkMode: number): { blendEnabled: boolean; opacity: number; count: number } | undefined {
    return this._dabDraws.get(inkMode)
  }

  // Both factors are tracked since #416: smudge's own "lay" pass is the one
  // draw in this codebase that pairs ONE with ONE (a plain sum — it adds
  // `carried * a` onto a destination the paired erase pass has already
  // scaled by (1 - a), which is what makes the two together an exact
  // per-pixel lerp). Every other call site still pairs its src factor with
  // ONE_MINUS_SRC_ALPHA — see the module docstring's blend-arithmetic note.
  blendFunc(src: number, dst: number): void { this._blendSrc = src; this._blendDst = dst }

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
      case 'dab': this._recordDabDraw(prog.uniforms); this._rasterDab(info, prog.uniforms); break
      case 'composite': this._rasterComposite(info, prog.uniforms); break
      case 'transform': this._rasterTransform(info, prog.uniforms); break
      case 'areaTransform': this._rasterAreaTransform(info, prog.uniforms); break
      case 'areaMask': this._rasterAreaMask(info, prog.uniforms); break
      case 'imageBlit': this._rasterImageBlit(info, prog.uniforms); break
      case 'smudge': this._rasterSmudge(info, prog.uniforms); break
      case 'smudgePickup': this._rasterSmudgePickup(info, prog.uniforms); break
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

  /** The `dst * (1 - srcAlpha)` weight every rasterizer below pairs with
   *  _blendSrcFactor(). 0 with blending off (#330): the source simply replaces
   *  whatever was there, which is exactly what marker's composite pass now
   *  relies on. */
  private _blendDstWeight(srcAlpha: number): number {
    if (!this._blendEnabled) return 0
    if (this._blendDst === ENUM.ONE) return 1
    // (#446) `dst *= src.a` — AccumulationBuffer.beginKeepDraw, the "keep only
    // what the mask covers" half of the selection mask pass.
    if (this._blendDst === ENUM.SRC_ALPHA) return srcAlpha
    return 1 - srcAlpha
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
        // #330: mirrors DAB_FRAG — v_localUV (a_position * 2) is already the
        // dab's normalized space, so no second divide by aspectRatio here. See
        // that shader's own comment for what the extra divide used to do.
        const uvx = aPosX * 2
        const uvy = aPosY * 2
        const dist = Math.hypot(uvx, uvy)
        if (dist > 1) continue

        let shape = 1 - smoothstep(innerEdge, 1, dist)
        shape *= 1 - Math.exp(-8 * (1 - dist))

        const idx = py * width + px
        if (eraseMode > 0.5) {
          const eraseAmount = clamp(pressure * opacity * shape, 0, 1)
          data[idx] = eraseAmount * sf + data[idx] * this._blendDstWeight(eraseAmount)
        } else {
          const deposit = clamp(pressure * opacity * shape, 0, 1)
          data[idx] = deposit * sf + data[idx] * this._blendDstWeight(deposit)
        }
      }
    }
  }

  // Mirrors SMUDGE_TRANSFER_FRAG (#416) — circular-only (angle=0,
  // aspectRatio=1 always for a smudge dab, see _paintOneSmudgeDab), so this
  // skips _rasterDab's rotation/aspect math entirely. Both of a dab's draws
  // come through here: u_mode 0 is the erase half (dst *= 1-a, under
  // beginErase()) and u_mode 1 the additive half (dst += carried*a, under
  // beginAdditiveDraw()), and because both compute `a` from the same
  // uniforms the pair is an exact per-pixel lerp here just as it is on a
  // real GPU — which is the property the smudge tests actually lean on.
  //
  // No paperCatch weighting: this mock doesn't replicate paper-texture
  // shading at all (see the module's own scope-cut doc comment at the top of
  // this file), so every dab behaves as if paperCatch were a flat 1.0 and
  // `a` reduces to strength*shape. Nothing in this test suite asserts on the
  // grain the real shader preserves through a smudge.
  //
  // For the same reason the deposit's own tooth term (u_grainRelief, see
  // smudgeGrain.ts) is left out entirely rather than evaluated at that flat
  // 1.0: the term is a *deviation from the catch channel's mean*, so its
  // neutral value is the one at catch 0.5, not the one at catch 1.0 — which
  // is exactly `tooth == 1`, i.e. omitting it. Evaluating it against the
  // mock's flat catch instead would silently scale every smudge deposit here
  // by 1 + relief, which is not what any GPU does anywhere.
  private _rasterSmudge(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const [cx, cy] = (uniforms.get('u_dabCenter') as number[]) ?? [0, 0]
    const dabRadius = (uniforms.get('u_dabRadius') as number) ?? 1
    const hardness = (uniforms.get('u_hardness') as number) ?? 0.5
    const mode = (uniforms.get('u_mode') as number) ?? 0
    const strength = (uniforms.get('u_strength') as number) ?? 0
    const carriedUnit = (uniforms.get('u_carried') as number) ?? 0
    const carriedTex = this._textureUnits[carriedUnit] ?? null
    const carried = carriedTex ? this._textureData.get(carriedTex) : undefined
    const [patchX, patchGlY] = (uniforms.get('u_patchOrigin') as number[]) ?? [0, 0]
    const patchSize = (uniforms.get('u_patchSize') as number) ?? 1
    // u_patchOrigin arrives GL-native (bottom-up, since the real shader reads
    // gl_FragCoord); this mock is top-down throughout, so recover the patch's
    // own top row the same way copyTexImage2D above does.
    const patchTopY = height - patchGlY - patchSize
    const innerEdge = hardness * 0.85
    const sf = this._blendSrcFactor()

    const pad = dabRadius * 2.5 + 2
    const minX = Math.max(0, Math.floor(cx - pad))
    const maxX = Math.min(width, Math.ceil(cx + pad))
    const minY = Math.max(0, Math.floor(cy - pad))
    const maxY = Math.min(height, Math.ceil(cy + pad))

    for (let py = minY; py < maxY; py++) {
      for (let px = minX; px < maxX; px++) {
        const uvx = (px + 0.5 - cx) / dabRadius
        const uvy = (py + 0.5 - cy) / dabRadius
        const dist = Math.hypot(uvx, uvy)
        if (dist > 1) continue

        let shape = 1 - smoothstep(innerEdge, 1, dist)
        shape *= 1 - Math.exp(-8 * (1 - dist))

        const a = clamp(strength * shape, 0, 1)
        const idx = py * width + px
        if (mode > 0.5) {
          const src = sampleUnit(carried, (px + 0.5 - patchX) / patchSize, (py + 0.5 - patchTopY) / patchSize) * a
          data[idx] = src * sf + data[idx] * this._blendDstWeight(src)
        } else {
          data[idx] = a * sf + data[idx] * this._blendDstWeight(a)
        }
      }
    }
  }

  // Mirrors SMUDGE_PICKUP_FRAG (#416): the imprint the stump carries, blended
  // toward the patch of canvas under this dab, per texel. Blending is off for
  // this pass (it writes the imprint's new value outright), so this ignores
  // the blend state entirely — deliberately, not by omission.
  //
  // Source and target are addressed by normalized uv rather than by index:
  // they are the same size in every ordinary stroke, but a stroke whose brush
  // size changes mid-gesture resamples the imprint into the new patch size
  // exactly this way on a real GPU.
  private _rasterSmudgePickup(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const extent = this._boundQuadExtent()
    const rate = (uniforms.get('u_rate') as number) ?? 0
    const patchUnit = (uniforms.get('u_patch') as number) ?? 0
    const carriedUnit = (uniforms.get('u_carried') as number) ?? 1
    const patchTex = this._textureUnits[patchUnit] ?? null
    const carriedTex = this._textureUnits[carriedUnit] ?? null
    const patch = patchTex ? this._textureData.get(patchTex) : undefined
    const carried = carriedTex ? this._textureData.get(carriedTex) : undefined
    if (!patch) return // nothing bound — see _rasterSmudge's identical guard reasoning

    for (let ty = 0; ty < height; ty++) {
      const clipY = 2 * ((ty + 0.5) / height) - 1
      if (Math.abs(clipY) > extent) continue
      for (let tx = 0; tx < width; tx++) {
        const clipX = 2 * ((tx + 0.5) / width) - 1
        if (Math.abs(clipX) > extent) continue
        // DISPLAY_VERT's own v_uv = a_position * 0.5 + 0.5, and its
        // a_position *is* the clip coordinate — so for the fullscreen quad
        // this is exactly (tx + 0.5) / width, as it was before the quad
        // extent was honoured at all.
        const u = clipX * 0.5 + 0.5
        const v = clipY * 0.5 + 0.5
        const p = sampleUnit(patch, u, v)
        const c = sampleUnit(carried, u, v)
        data[ty * width + tx] = c + (p - c) * rate
      }
    }
  }

  /** Half-width of the quad currently bound as a_position, in clip units: 1
   *  for createFullscreenQuad's -1..1, 0.5 for createQuadBuffer's -0.5..0.5
   *  dab quad.
   *
   *  Every DISPLAY_VERT-based pass writes its target through a quad it
   *  assumes covers the whole framebuffer, so a pass handed the *dab* quad
   *  by mistake silently writes only the middle quarter of it and samples
   *  its source over the middle half — which is precisely how a wide smudge
   *  stroke came to stamp square blocks (the imprint's outer ring kept
   *  whatever stale patch the pooled buffer last held, and got laid straight
   *  back onto the canvas). Rasterizing the *intent* rather than the
   *  geometry made that invisible here, so the coverage is modelled. */
  private _boundQuadExtent(): number {
    const data = this._boundArrayBuffer ? this._bufferData.get(this._boundArrayBuffer) : undefined
    if (!data || data.length === 0) return 1
    let max = 0
    for (const v of data) max = Math.max(max, Math.abs(v))
    return max
  }

  private _rasterComposite(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const unit = (uniforms.get('u_layer') as number) ?? 0
    const opacity = (uniforms.get('u_opacity') as number) ?? 1
    const srcTex = this._textureUnits[unit] ?? null
    const srcInfo = srcTex ? this._textureData.get(srcTex) : undefined
    const sf = this._blendSrcFactor()
    const vp = this._viewport

    // The common case (composite/beginDraw/beginErase always set viewport to
    // the full target size) keeps the original 1:1 same-size blend. Only
    // _drawTileComposite ever sets a sub-rect (a tile positioned via
    // gl.viewport rather than a shader transform — see its own comment),
    // in which case DISPLAY_VERT's quad UV (0,0)-(1,1) spans that sub-rect,
    // not the full target, and must sample the source texture across its
    // own full extent accordingly (mirrors what the real fixed-function
    // rasterizer + fragment shader do).
    if (!srcInfo || (vp.x === 0 && vp.y === 0 && vp.w === width && vp.h === height)) {
      for (let i = 0; i < width * height; i++) {
        const srcAlpha = srcInfo ? clamp((srcInfo.data[i] ?? 0) * opacity, 0, 1) : 0
        data[i] = srcAlpha * sf + data[i] * (1 - srcAlpha)
      }
      return
    }

    // gl.viewport's y is bottom-up; this mock's data (like every buffer in
    // the real engine) is top-down — recover the top-down top edge the same
    // way _drawTileComposite derived its bottom-up glY from screenTop.
    const topY = height - (vp.y + vp.h)
    for (let dy = 0; dy < vp.h; dy++) {
      const py = topY + dy
      if (py < 0 || py >= height) continue
      for (let dx = 0; dx < vp.w; dx++) {
        const px = vp.x + dx
        if (px < 0 || px >= width) continue
        const u = (dx + 0.5) / vp.w
        const v = (dy + 0.5) / vp.h
        const sx = Math.min(Math.floor(u * srcInfo.width), srcInfo.width - 1)
        const sy = Math.min(Math.floor(v * srcInfo.height), srcInfo.height - 1)
        const srcAlpha = clamp((srcInfo.data[sy * srcInfo.width + sx] ?? 0) * opacity, 0, 1)
        const idx = py * width + px
        data[idx] = srcAlpha * sf + data[idx] * (1 - srcAlpha)
      }
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
  /** (#446) AREA_TRANSFORM_FRAG: _rasterTransform with the source's coverage
   *  multiplied by the selection mask, sampled at the *source* position (in
   *  world coordinates, hence u_srcOrigin) rather than the destination one.
   *  Getting that wrong is the difference between a shape that moves and a
   *  shape that deforms as it moves, so it is worth having observable here.
   *
   *  Nearest-texel mask sampling, unlike the real shader's LINEAR: the mock
   *  is single-scalar-per-texel throughout and this keeps the arithmetic
   *  exact, which matters more for an assertion than a soft edge does. */
  private _rasterAreaTransform(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const srcUnit = (uniforms.get('u_source') as number) ?? 0
    const maskUnit = (uniforms.get('u_mask') as number) ?? 1
    const [bw, bh] = (uniforms.get('u_srcSize') as number[]) ?? [width, height]
    const [srcOriginX, srcOriginY] = (uniforms.get('u_srcOrigin') as number[]) ?? [0, 0]
    const maskRect = (uniforms.get('u_maskRect') as number[]) ?? [0, 0, 1, 1]
    const m = (uniforms.get('u_matrixInv') as number[]) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
    const srcInfo = this._textureInfoAtUnit(srcUnit)
    const maskInfo = this._textureInfoAtUnit(maskUnit)
    const sf = this._blendSrcFactor()

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = py * width + px
        const dstX = px + 0.5, dstY = py + 0.5
        const srcX = dstX * m[0] + dstY * m[3] + m[6]
        const srcY = dstX * m[1] + dstY * m[4] + m[7]
        if (!srcInfo || srcX < 0 || srcX >= bw || srcY < 0 || srcY >= bh) continue
        const cov = this._sampleMask(maskInfo, maskRect, srcX + srcOriginX, srcY + srcOriginY)
        if (cov <= 0) continue
        const sx = Math.min(Math.floor(srcX), srcInfo.width - 1)
        const sy = Math.min(Math.floor(srcY), srcInfo.height - 1)
        const srcAlpha = (srcInfo.data[sy * srcInfo.width + sx] ?? 0) * cov
        data[idx] = srcAlpha * sf + data[idx] * this._blendDstWeight(srcAlpha)
      }
    }
  }

  /** (#446) AREA_MASK_FRAG: writes the mask's coverage as the source alpha
   *  over the whole target, leaving the blend function to decide what that
   *  means — erase inside (ZERO, ONE_MINUS_SRC_ALPHA) or keep only inside
   *  (ZERO, SRC_ALPHA). Outside the mask rect the coverage is zero, which
   *  under 'erase' leaves the target untouched and under 'keep' clears it,
   *  exactly as the real shader does. */
  private _rasterAreaMask(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const maskUnit = (uniforms.get('u_mask') as number) ?? 0
    const [dstOriginX, dstOriginY] = (uniforms.get('u_dstOrigin') as number[]) ?? [0, 0]
    const maskRect = (uniforms.get('u_maskRect') as number[]) ?? [0, 0, 1, 1]
    const maskInfo = this._textureInfoAtUnit(maskUnit)
    const sf = this._blendSrcFactor()

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = py * width + px
        const cov = this._sampleMask(maskInfo, maskRect, px + 0.5 + dstOriginX, py + 0.5 + dstOriginY)
        data[idx] = cov * sf + data[idx] * this._blendDstWeight(cov)
      }
    }
  }

  private _textureInfoAtUnit(unit: number): TextureInfo | undefined {
    const tex = this._textureUnits[unit] ?? null
    return tex ? this._textureData.get(tex) : undefined
  }

  /** Coverage at a world position, or 0 outside the mask's own rect. */
  private _sampleMask(
    maskInfo: TextureInfo | undefined, maskRect: number[], worldX: number, worldY: number,
  ): number {
    if (!maskInfo) return 0
    const [ox, oy, rw, rh] = maskRect
    if (rw <= 0 || rh <= 0) return 0
    const u = (worldX - ox) / rw
    const v = (worldY - oy) / rh
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0
    const mx = Math.min(maskInfo.width - 1, Math.floor(u * maskInfo.width))
    const my = Math.min(maskInfo.height - 1, Math.floor(v * maskInfo.height))
    return maskInfo.data[my * maskInfo.width + mx] ?? 0
  }

  private _rasterTransform(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const unit = (uniforms.get('u_source') as number) ?? 0
    // Destination size (u_dstSize) isn't needed here — the raster loop
    // already iterates the actual destination texture's own width/height.
    // Source size (u_srcSize, #134) is what bounds the in-range check below
    // (mirrors the shader's srcUV normalization/clamp against u_srcSize).
    const [bw, bh] = (uniforms.get('u_srcSize') as number[]) ?? [width, height]
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

  // Mirrors IMAGE_BLIT_FRAG (#88): every destination texel inside
  // u_imageRect takes the image's sample, everything outside stays
  // untouched. What this makes observable is *where* an imported image
  // landed relative to the operations replayed around it (#398) — the
  // uploaded source is uniformly opaque (see texImage2D's DOM-source
  // overload), so the rect is the whole of it.
  //
  // (#446) Both this mock's rows and the shader's own bufferPx are app-space
  // top-down now, so there is no flip left to do here. There used to be one,
  // faithfully mirroring a shader that read `v_uv` (bottom-up) as though it
  // were top-down — which is the bug paste surfaced. A mock that reproduces
  // the bug it exists to catch is worse than no mock, so the two moved
  // together.
  private _rasterImageBlit(info: TextureInfo, uniforms: Map<string, UniformValue>): void {
    const { width, height, data } = info
    const unit = (uniforms.get('u_image') as number) ?? 0
    const [bw, bh] = (uniforms.get('u_bufferSize') as number[]) ?? [width, height]
    const [rx, ry, rw, rh] = (uniforms.get('u_imageRect') as number[]) ?? [0, 0, 0, 0]
    const srcTex = this._textureUnits[unit] ?? null
    const srcInfo = srcTex ? this._textureData.get(srcTex) : undefined
    const sf = this._blendSrcFactor()
    if (!srcInfo || rw <= 0 || rh <= 0) return

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const bufX = ((px + 0.5) / width) * bw
        const bufY = ((py + 0.5) / height) * bh
        const u = (bufX - rx) / rw
        const v = (bufY - ry) / rh
        if (u < 0 || u > 1 || v < 0 || v > 1) continue
        const sx = Math.min(Math.floor(u * srcInfo.width), srcInfo.width - 1)
        // Sampled from the far end, as the real shader does (the texture went
        // up with UNPACK_FLIP_Y_WEBGL). Unobservable through this mock's
        // uniformly opaque DOM-image stand-in, and kept anyway so the next
        // person to give it real per-texel content does not rediscover it.
        const sy = Math.min(Math.floor((1 - v) * srcInfo.height), srcInfo.height - 1)
        const srcAlpha = clamp(srcInfo.data[sy * srcInfo.width + sx] ?? 0, 0, 1)
        const idx = py * width + px
        data[idx] = srcAlpha * sf + data[idx] * (1 - srcAlpha)
      }
    }
  }
}
