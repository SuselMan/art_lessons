import { withDiscreteGrid } from './discreteGridSampling'
import { WatercolorMaterialReconstruction } from './WatercolorMaterialReconstruction'
import { DISPLAY_VERT, WC_COST_DOMAIN_FRAG, WC_DIFFUSE_FRAG, WC_FIELD_ADD_FRAG, WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG, WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG, WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG, WC_WATER_FRONT_FRAG, WC_BRUSH_DRAG_FRAG, WC_BRUSH_JUMP_FRAG, WC_RESAMPLE_FRAG } from './shaders'
import { createProgram, getUniforms } from './utils'
import { createWatercolorFrontPaths } from './WatercolorFrontPaths'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { withGradientFibres } from '../watercolor/gradientFibres'
import { WET_DIFFUSE_D, WET_DIFFUSE_B } from '../watercolor/wetDiffusion'

import type { WatercolorPassField, WatercolorPassesContext } from './WatercolorPassTypes'
export type { WatercolorPassField, WatercolorPassesContext } from './WatercolorPassTypes'

/** Watercolor field GPU primitives. Scheduling and working textures stay with
 * the engine. Separate init stages preserve the existing GL call order. */
export class WatercolorPasses {
  invalidateFrontPaths(): void { this._frontPaths?.invalidate() }
  private _frontPaths: ReturnType<typeof createWatercolorFrontPaths> | null = null
  private readonly ctx: WatercolorPassesContext
  private _materialReconstruction: WatercolorMaterialReconstruction | null = null
  materialReconstruction(): WatercolorMaterialReconstruction {
    return this._materialReconstruction ??= new WatercolorMaterialReconstruction(this.ctx)
  }
  constructor(ctx: WatercolorPassesContext) { this.ctx = ctx }
  private get gl(): WebGLRenderingContext { return this.ctx.gl() }

  /** (#536, §17.17) WC_FIELD_OP_FRAG — the diffusion's fixed/mobile split. */
  private _costDomain: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number } | null = null

  private _fieldOpProg!: WebGLProgram

  private readonly _additiveZeroFaceCarry = new Map<15 | 16, { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number }>()

  private _plainAdd: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number } | null = null

  private _gradientField: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number } | null = null

  private _fieldOpUni!: Record<string, WebGLUniformLocation | null>

  /** (#685) Modes 10-20 except the carry (15/16), linked separately. */
  private _fieldOpHighProg!: WebGLProgram

  private _fieldOpHighUni!: Record<string, WebGLUniformLocation | null>

  private _fieldOpHighPosLoc!: number

  private _fieldOpCarryProg!: WebGLProgram

  private _fieldOpCarryUni!: Record<string, WebGLUniformLocation | null>

  private _fieldOpCarryPosLoc!: number

  private _fieldOpCarryColourProg!: WebGLProgram

  private _fieldOpCarryColourUni!: Record<string, WebGLUniformLocation | null>

  private _fieldOpCarryColourPosLoc!: number

  private _fieldOpPosLoc = -1

  /** (#536, §17.44) WC_RESAMPLE_FRAG - tile <-> half-resolution settle field. */
  private _resampleProg!: WebGLProgram

  private _resampleUni!: Record<string, WebGLUniformLocation | null>

  private _resamplePosLoc = -1

  /** (#536) One step of pigment diffusion in standing water — see
   *  WC_DIFFUSE_FRAG and wetDiffusion.ts. */
  private _diffuseProg!: WebGLProgram

  private _brushDragProg!: WebGLProgram

  private _brushDragUni!: Record<string, WebGLUniformLocation | null>

  private _brushDragPosLoc = -1
  private _brushJump: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number } | null = null

  private _waterFrontProg!: WebGLProgram

  private _waterFrontUni!: Record<string, WebGLUniformLocation | null>

  private _waterFrontPosLoc = -1

  private _diffuseUni!: Record<string, WebGLUniformLocation | null>

  private _diffusePosLoc = -1

  /** One WC_FIELD_OP_FRAG step between same-sized buffers — see the shader
   *  for the modes. `c` is mode 3's third input; `scissor` (bottom-up GL
   *  pixels) limits the write to a rect, everything outside it untouched. */
  fieldOp(
    out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20, k: number,
    opts: { c?: AccumulationBuffer; scissor?: [number, number, number, number]; dir?: [number, number]; d?: AccumulationBuffer; e?: AccumulationBuffer; origin?: [number, number]; band?: [number, number]; size?: [number, number]; tau?: [number, number, number]; world?: [number, number, number]; gradientFibres?: boolean; path?: AccumulationBuffer; pathPacked?: boolean; additiveZeroFaces?: boolean; discreteGrid?: boolean } = {},
  ): void {
    if (!opts.discreteGrid) return this.fieldOpDraw(out, a, b, mode, k, opts)
    return withDiscreteGrid(out, [a, b, ...(opts.c ? [opts.c] : []), ...(opts.d ? [opts.d] : []), ...(opts.e ? [opts.e] : []), ...(opts.path ? [opts.path] : [])],
      () => this.fieldOpDraw(out, a, b, mode, k, opts), opts.world?.[2] ?? 1, opts.dir)
  }

  private fieldOpDraw(
    out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20, k: number,
    opts: { c?: AccumulationBuffer; scissor?: [number, number, number, number]; dir?: [number, number]; d?: AccumulationBuffer; e?: AccumulationBuffer; origin?: [number, number]; band?: [number, number]; size?: [number, number]; tau?: [number, number, number]; world?: [number, number, number]; gradientFibres?: boolean; path?: AccumulationBuffer; pathPacked?: boolean; additiveZeroFaces?: boolean; discreteGrid?: boolean } = {},
  ): void {
    if (mode === 1 && !((opts.world?.[2] ?? 0) > 0)) {
      this.plainAdd(out, a, b, k, opts.scissor)
      return
    }
    const { gl } = this
    out.beginReplaceDraw()
    try {
    if (opts.scissor) {
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(opts.scissor[0], opts.scissor[1], opts.scissor[2], opts.scissor[3])
    }
    // (#685) Carry modes must never enter the bookkeeping program: its
    // combined control flow crashes the Galaxy Tab's Adreno linker.
    const gradient = mode === 1 && opts.gradientFibres && !!opts.world?.[2] ? this.gradientField() : null
    const additive = opts.additiveZeroFaces && (mode === 15 || mode === 16) ? this.additiveZeroFaceCarry(mode) : null
    const high = mode >= 10
    const prog = gradient ? gradient.program : additive ? additive.program : mode === 15 ? this._fieldOpCarryProg : mode === 16 ? this._fieldOpCarryColourProg : high ? this._fieldOpHighProg : this._fieldOpProg
    const u = gradient ? gradient.uniforms : additive ? additive.uniforms : mode === 15 ? this._fieldOpCarryUni : mode === 16 ? this._fieldOpCarryColourUni : high ? this._fieldOpHighUni : this._fieldOpUni
    const pos = gradient ? gradient.position : additive ? additive.position : mode === 15 ? this._fieldOpCarryPosLoc : mode === 16 ? this._fieldOpCarryColourPosLoc : high ? this._fieldOpHighPosLoc : this._fieldOpPosLoc
    gl.useProgram(prog)
    if (gradient) this.ctx.stamps().bindNoise(u.u_wcFibreNoiseTex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a.texture)
    gl.uniform1i(u.u_a, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b.texture)
    gl.uniform1i(u.u_b, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, (opts.c ?? b).texture)
    gl.uniform1i(u.u_c, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, (opts.d ?? b).texture)
    gl.uniform1i(u.u_d, 3)
    if ((mode === 18 && opts.e) || mode === 15 || mode === 16) {
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, (opts.e ?? b).texture)
      gl.uniform1i(u.u_e, 4)
    }
    if (mode === 15 || mode === 16) {
      gl.activeTexture(gl.TEXTURE0 + 5)
      gl.bindTexture(gl.TEXTURE_2D, (opts.path ?? b).texture)
      gl.uniform1i(u.u_path, 5)
      gl.uniform1f(u.u_pathEnabled, opts.path ? (opts.pathPacked ? 2 : 1) : 0)
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(u.u_k, k)
    gl.uniform1f(u.u_mode, mode)
    gl.uniform2f(u.u_dir, opts.dir ? opts.dir[0] / out.width : 0, opts.dir ? opts.dir[1] / out.height : 0)
    if (mode === 6) {
      gl.uniform1f(u.u_mode6DiscreteGrid, opts.discreteGrid ? 1 : 0)
      gl.uniform2f(u.u_mode6Resolution, out.width, out.height)
      gl.uniform2f(u.u_mode6DirPx, opts.dir ? opts.dir[0] : 0, opts.dir ? opts.dir[1] : 0)
    }
    gl.uniform2f(u.u_origin, opts.origin ? opts.origin[0] : 0, opts.origin ? opts.origin[1] : 0)
    gl.uniform2f(u.u_size, opts.size ? opts.size[0] : out.width, opts.size ? opts.size[1] : out.height)
    gl.uniform2f(u.u_band, opts.band ? opts.band[0] : 0, opts.band ? opts.band[1] : 0)
    gl.uniform3fv(u.u_tau, opts.tau ?? [0, 0, 0])
    gl.uniform3fv(u.u_world, opts.world ?? [0, 0, 0])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    } finally {
      try { if (opts.scissor) gl.disable(gl.SCISSOR_TEST) } finally { out.endDraw() }
    }
  }

  /** No new textures: the owner supplies two otherwise unused single-paint C fields. */
  costDomainStep(out: AccumulationBuffer, source: AccumulationBuffer, rect: [number, number, number, number], band: number, stride: number, packed = false): void {
    const { gl } = this
    if (!this._costDomain) {
      const program = createProgram(gl, DISPLAY_VERT, WC_COST_DOMAIN_FRAG)
      this._costDomain = { program, uniforms: getUniforms(gl, program, ['u_source', 'u_resolution', 'u_rect', 'u_band', 'u_stride', 'u_packed']), position: gl.getAttribLocation(program, 'a_position') }
    }
    const { program, uniforms: u, position } = this._costDomain
    const dithered = packed && gl.isEnabled(gl.DITHER)
    if (packed) gl.disable(gl.DITHER)
    out.beginReplaceDraw()
    try {
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.texture)
      gl.uniform1i(u.u_source, 0); gl.uniform2f(u.u_resolution, out.width, out.height)
      gl.uniform4fv(u.u_rect, rect); gl.uniform1f(u.u_band, band); gl.uniform1f(u.u_stride, stride)
      gl.uniform1f(u.u_packed, packed ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    } finally { out.endDraw(); if (dithered) gl.enable(gl.DITHER) }
  }

  /** (#536, §17.24) One relaxation step of the water front's cost (WC_WATER_FRONT_FRAG)
   *  over a settle field whose top-left is at world (x0, y0): src → dst. Shared by
   *  the settle's outward and inward passes and the group tide's inward one. */
  waterFrontStep(
    field: WatercolorPassField, x0: number, y0: number, dryCost: number,
    src: AccumulationBuffer, dst: AccumulationBuffer, max: number, climb: number, floor: number, stride = 1,
    /** (§17.44) World px per field cell. */
    scale = 1, foreignWater: WebGLTexture | null = null, discreteGrid = false,
  ): void {
    const draw = () => this.waterFrontStepDraw(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, scale, foreignWater)
    if (!discreteGrid) return draw()
    if (field.w !== dst.width || field.h !== dst.height) throw new Error('M70 front field grid mismatch')
    return withDiscreteGrid(dst, [src, field.coverage], draw, scale, [stride])
  }

  private waterFrontStepDraw(
    field: WatercolorPassField, x0: number, y0: number, dryCost: number,
    src: AccumulationBuffer, dst: AccumulationBuffer, max: number, climb: number, floor: number, stride = 1,
    /** (§17.44) World px per field cell. */
    scale = 1, foreignWater: WebGLTexture | null = null,
  ): void {
    if (stride === 4 || stride === 8) {
      this._frontPaths ??= createWatercolorFrontPaths(this.ctx, (...args) => this.nativeWaterFrontStep(...args))
      this._frontPaths.step(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, scale, foreignWater)
      return
    }
    this._frontPaths?.invalidate()
    this.nativeWaterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, scale, foreignWater)
  }

  private nativeWaterFrontStep(
    field: WatercolorPassField, x0: number, y0: number, dryCost: number,
    src: AccumulationBuffer, dst: AccumulationBuffer, max: number, climb: number, floor: number,
    stride = 1, scale = 1, foreignWater: WebGLTexture | null = null,
  ): void {
    const { gl } = this
    const { w: paperTexW, h: paperTexH } = this.ctx.paperWorldSize()
    dst.beginReplaceDraw()
    try {
    gl.useProgram(this._waterFrontProg)
    this.ctx.stamps().bindNoise(this._waterFrontUni.u_wcNoiseTex)
    const u = this._waterFrontUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(this._waterFrontPosLoc)
    gl.vertexAttribPointer(this._waterFrontPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src.texture)
    gl.uniform1i(u.u_cost, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.ctx.paperTex())
    gl.uniform1i(u.u_paperHeightMap, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, field.coverage.texture)
    gl.uniform1i(u.u_film, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, foreignWater ?? this.ctx.paperTex())
    gl.uniform1i(u.u_foreignFilm, 3)
    gl.uniform1f(u.u_foreignWet, foreignWater ? 1 : 0)
    gl.uniform1f(u.u_dryCost, dryCost)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(u.u_resolution, field.w, field.h)
    gl.uniform2f(u.u_paperOrigin, x0 / scale, -(y0 / scale + field.h))
    gl.uniform2f(u.u_paperTexSize, paperTexW / scale, paperTexH / scale)
    gl.uniform2f(u.u_paperScale, this.ctx.paperScale(), this.ctx.paperScale())
    gl.uniform1f(u.u_climb, climb)
    gl.uniform1f(u.u_floor, floor)
    gl.uniform1f(u.u_costMax, max)
    gl.uniform1f(u.u_stride, stride)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    } finally { dst.endDraw() }
  }

  /** (#536, §17.44) One WC_RESAMPLE_FRAG draw into `dst` over the GL rect
   *  (dx, dy, dw, dh). Mode 0 averages `src` down (ratio 2), mode 1 writes
   *  base + up(src) - up(old), mode 2 max(base, up(src)) (ratio 1/2). `dst`
   *  must not be `base`: modes 1 and 2 go through a temporary. */
  wcResample(
    dst: AccumulationBuffer, dx: number, dy: number, dw: number, dh: number,
    src: AccumulationBuffer, sx: number, sy: number, ratio: number, mode: 0 | 1 | 2,
    old: AccumulationBuffer | null = null, base: AccumulationBuffer | null = null,
    /** The source texels the draw may read: [x0, y0, x1, y1). The whole source by default. */
    clampRect: [number, number, number, number] | null = null,
  ): void {
    if (dw <= 0 || dh <= 0) return
    const { gl } = this
    dst.beginReplaceDraw()
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(dx, dy, dw, dh)
    gl.useProgram(this._resampleProg)
    const u = this._resampleUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(this._resamplePosLoc)
    gl.vertexAttribPointer(this._resamplePosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.texture); gl.uniform1i(u.u_src, 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (old ?? src).texture); gl.uniform1i(u.u_old, 1)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, (base ?? src).texture); gl.uniform1i(u.u_base, 2)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(u.u_srcSize, src.width, src.height)
    gl.uniform2f(u.u_baseSize, (base ?? dst).width, (base ?? dst).height)
    gl.uniform2f(u.u_dstOrigin, dx, dy)
    gl.uniform2f(u.u_srcOrigin, sx, sy)
    gl.uniform1f(u.u_ratio, ratio)
    gl.uniform1f(u.u_mode, mode)
    const cr = clampRect ?? [0, 0, src.width, src.height]
    gl.uniform4f(u.u_clamp, cr[0], cr[1], cr[2], cr[3])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.SCISSOR_TEST)
    dst.endDraw()
  }

  /** One diffusion draw; field origin and scale are fixed by the settle plan. */
  diffuseStep(
    field: WatercolorPassField, x0: number, y0: number, S: number, paperTexW: number, paperTexH: number,
    src: AccumulationBuffer, dst: AccumulationBuffer, radius: number, knight: boolean, gate: AccumulationBuffer,
    // Preserve the settle caller signature; these records no longer gate diffusion.
    _density: AccumulationBuffer = src,
    _solvent: AccumulationBuffer | null = null,
    discreteGrid = false,
  ): void {
    const draw = () => this.diffuseStepDraw(field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate, _density, _solvent)
    if (!discreteGrid) return draw()
    if (field.w !== dst.width || field.h !== dst.height) throw new Error('M70 diffuse field grid mismatch')
    return withDiscreteGrid(dst, [src, gate], draw, S)
  }

  private diffuseStepDraw(
    field: WatercolorPassField, x0: number, y0: number, S: number, paperTexW: number, paperTexH: number,
    src: AccumulationBuffer, dst: AccumulationBuffer, radius: number, knight: boolean, gate: AccumulationBuffer,
    // Preserve the settle caller signature; these records no longer gate diffusion.
    _density: AccumulationBuffer = src,
    _solvent: AccumulationBuffer | null = null,
  ): void {
    const { gl } = this
    dst.beginReplaceDraw()
    try {
    gl.useProgram(this._diffuseProg)
    const u = this._diffuseUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(this._diffusePosLoc)
    gl.vertexAttribPointer(this._diffusePosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src.texture)
    gl.uniform1i(u.u_ink, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, gate.texture)
    gl.uniform1i(u.u_coverage, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.ctx.paperTex())
    gl.uniform1i(u.u_paperHeightMap, 2)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(u.u_resolution, field.w, field.h)
    // The paper at the world position of a texel. A tile passes
    // (originX, -originY) and lets its height of 1024 fold into the paper's
    // period; a rect of any height has to say where its bottom row is.
    gl.uniform2f(u.u_paperOrigin, x0 / S, -(y0 / S + field.h))
    gl.uniform2f(u.u_paperTexSize, paperTexW / S, paperTexH / S)
    gl.uniform2f(u.u_paperScale, this.ctx.paperScale(), this.ctx.paperScale())
    gl.uniform1f(u.u_d, WET_DIFFUSE_D)
    gl.uniform1f(u.u_b, WET_DIFFUSE_B)
    gl.uniform1f(u.u_radius, Math.max(1, Math.round(radius / S)))
    gl.uniform1f(u.u_stencil, knight ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    } finally { dst.endDraw() }
  }

  /** One chronological wet brush contact. Both records read the unchanged
   * pre-contact pigment record; the caller copies results back afterwards. */
  brushPass(
    field: WatercolorPassField, flowTexture: WebGLTexture, radiusPx: number, S: number,
    source: AccumulationBuffer, out: AccumulationBuffer, pigment: AccumulationBuffer,
    flowRect: [number, number, number, number], scissor: [number, number, number, number],
    colorReference: AccumulationBuffer, pulseGain: number, jump = 1, mixScale = 1,
  ): void {
    const { gl } = this
    out.beginReplaceDraw()
    if ((jump > 1 || mixScale !== 1) && !this._brushJump) {
      const program = createProgram(gl, DISPLAY_VERT, WC_BRUSH_JUMP_FRAG)
      this._brushJump = { program, uniforms: getUniforms(gl, program, ['u_paint', 'u_flow', 'u_water', 'u_pigment', 'u_step', 'u_flowRect', 'u_color', 'u_contactGain', 'u_texel', 'u_jump', 'u_mixScale']), position: gl.getAttribLocation(program, 'a_position') }
    }
    const variant = jump > 1 || mixScale !== 1 ? this._brushJump : null
    gl.useProgram(variant?.program ?? this._brushDragProg)
    const u = variant?.uniforms ?? this._brushDragUni
    const position = variant?.position ?? this._brushDragPosLoc
    if (variant) { gl.uniform1f(u.u_jump, jump); gl.uniform1f(u.u_mixScale, mixScale) }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const textures = [source.texture, flowTexture, field.coverage.texture, pigment.texture]
    const names = ['u_paint', 'u_flow', 'u_water', 'u_pigment']
    for (let j = 0; j < textures.length; j++) {
      gl.activeTexture(gl.TEXTURE0 + j); gl.bindTexture(gl.TEXTURE_2D, textures[j]); gl.uniform1i(u[names[j]], j)
    }
    const step = Math.max(1, Math.round(radiusPx * 0.25 / S)) * jump
    gl.uniform2f(u.u_step, step / field.w, step / field.h)
    gl.uniform1f(u.u_contactGain, pulseGain)
    gl.uniform2f(u.u_texel, 1 / pigment.width, 1 / pigment.height)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, colorReference.texture)
    gl.uniform1i(u.u_color, 4)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform4fv(u.u_flowRect, flowRect)
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(...scissor)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.SCISSOR_TEST)
    out.endDraw(); gl.activeTexture(gl.TEXTURE0)
  }

  /** Single-paint shortcut: absorption times the settled pigment deposit. */
  pigmentColor(outColor: AccumulationBuffer, deposit: AccumulationBuffer, tau: readonly number[]): void {
    const { gl } = this
    outColor.beginReplaceDraw()
    gl.useProgram(this._fieldOpProg)
    const fu = this._fieldOpUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(this._fieldOpPosLoc)
    gl.vertexAttribPointer(this._fieldOpPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, deposit.texture)
    gl.uniform1i(fu.u_a, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, deposit.texture)
    gl.uniform1i(fu.u_b, 1)
    // Units 2 and 3 too: the program samples u_c and u_d, and whatever
    // the last field op left on those units — the rim's spare buffer,
    // which is this very output — would be a feedback loop.
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, deposit.texture)
    gl.uniform1i(fu.u_c, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, deposit.texture)
    gl.uniform1i(fu.u_d, 3)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(fu.u_k, 1)
    gl.uniform1f(fu.u_mode, 2)
    gl.uniform3fv(fu.u_tau, [tau[0], tau[1], tau[2]])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    outColor.endDraw()
  }

  /** Called by engine GL initialization after uniforms and attributes exist,
   * so the first watercolor mark does not compile the optional program. */
  warmGradientFibres(): void { this.gradientField() }

  private plainAdd(out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, k: number, scissor?: [number, number, number, number]): void {
    const { gl } = this
    if (!this._plainAdd) {
      const program = createProgram(gl, DISPLAY_VERT, WC_FIELD_ADD_FRAG)
      this._plainAdd = { program, uniforms: getUniforms(gl, program, ['u_a', 'u_b', 'u_k']), position: gl.getAttribLocation(program, 'a_position') }
    }
    const { program, uniforms: u, position } = this._plainAdd
    out.beginReplaceDraw()
    try {
    if (scissor) { gl.enable(gl.SCISSOR_TEST); gl.scissor(...scissor) }
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a.texture)
    gl.uniform1i(u.u_a, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b.texture)
    gl.uniform1i(u.u_b, 1)
    gl.uniform1f(u.u_k, k)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    } finally {
      try { if (scissor) gl.disable(gl.SCISSOR_TEST) } finally { out.endDraw(); gl.activeTexture(gl.TEXTURE0) }
    }
  }

  private releasePlainAdd(): void {
    const cached = this._plainAdd
    if (!cached) return
    const { gl } = this
    if (gl.getParameter(gl.CURRENT_PROGRAM) === cached.program) gl.useProgram(null)
    if (gl.isProgram?.(cached.program) !== false) gl.deleteProgram(cached.program)
    this._plainAdd = null
  }

  private gradientField(): NonNullable<WatercolorPasses['_gradientField']> {
    if (!this._gradientField) {
      const { gl } = this
      const program = createProgram(gl, DISPLAY_VERT, withGradientFibres(WC_FIELD_OP_FRAG))
      this._gradientField = {
        program,
        uniforms: getUniforms(gl, program, [...Object.keys(this._fieldOpUni), 'u_wcFibreNoiseTex']),
        position: gl.getAttribLocation(program, 'a_position'),
      }
    }
    return this._gradientField
  }

  private releaseGradientField(): void {
    const cached = this._gradientField
    if (!cached) return
    const { gl } = this
    if (gl.getParameter(gl.CURRENT_PROGRAM) === cached.program) gl.useProgram(null)
    // Restored contexts reject old handles; MockGL may omit isProgram.
    if (gl.isProgram?.(cached.program) !== false) gl.deleteProgram(cached.program)
    this._gradientField = null
  }

  private releaseCostDomain(): void {
    const cached = this._costDomain
    if (!cached) return
    const { gl } = this
    if (gl.getParameter(gl.CURRENT_PROGRAM) === cached.program) gl.useProgram(null)
    if (gl.isProgram?.(cached.program) !== false) gl.deleteProgram(cached.program)
    this._costDomain = null
  }

  private additiveZeroFaceCarry(mode: 15 | 16): { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; position: number } {
    const cached = this._additiveZeroFaceCarry.get(mode)
    if (cached) return cached
    const gl = this.gl
    const program = createProgram(gl, DISPLAY_VERT, mode === 15 ? WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG : WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG)
    const entry = { program, uniforms: getUniforms(gl, program, Object.keys(mode === 15 ? this._fieldOpCarryUni : this._fieldOpCarryColourUni)), position: gl.getAttribLocation(program, 'a_position') }
    this._additiveZeroFaceCarry.set(mode, entry)
    return entry
  }

  private releaseAdditiveZeroFaceCarry(): void {
    const gl = this.gl
    for (const { program } of this._additiveZeroFaceCarry.values()) {
      if (gl.getParameter(gl.CURRENT_PROGRAM) === program) gl.useProgram(null)
      if (gl.isProgram?.(program) !== false) gl.deleteProgram(program)
    }
    this._additiveZeroFaceCarry.clear()
  }

  initFieldPrograms(): void {
    this._materialReconstruction?.dispose()
    this._materialReconstruction = null
    const { gl } = this
    // Context restoration invalidates the optional cached program too.
    this.releasePlainAdd()
    this.releaseGradientField()
    this.releaseCostDomain()
    this.releaseAdditiveZeroFaceCarry()
    this._fieldOpProg         = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_FRAG)
    this._fieldOpHighProg     = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_HIGH_FRAG)
    this._fieldOpCarryProg    = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_CARRY_FRAG)
    this._fieldOpCarryColourProg = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_CARRY_COLOUR_FRAG)
    this._resampleProg        = createProgram(gl, DISPLAY_VERT, WC_RESAMPLE_FRAG)
  }

  initSettlePrograms(): void {
    this._frontPaths?.forget()
    this._frontPaths = null
    const { gl } = this
    this._diffuseProg         = createProgram(gl, DISPLAY_VERT, WC_DIFFUSE_FRAG)
    this._brushDragProg = createProgram(gl, DISPLAY_VERT, WC_BRUSH_DRAG_FRAG)
    this._brushDragUni = getUniforms(gl, this._brushDragProg, ['u_paint', 'u_flow', 'u_water', 'u_pigment', 'u_step', 'u_flowRect', 'u_color', 'u_contactGain', 'u_texel'])
    this._brushDragPosLoc = gl.getAttribLocation(this._brushDragProg, 'a_position')
    this._waterFrontProg      = createProgram(gl, DISPLAY_VERT, WC_WATER_FRONT_FRAG)
  }

  initFieldUniforms(): void {
    const { gl } = this
    this._fieldOpUni = getUniforms(gl, this._fieldOpProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_origin', 'u_size', 'u_band', 'u_world', 'u_mode6Resolution', 'u_mode6DirPx', 'u_mode6DiscreteGrid'])
    this._fieldOpHighUni = getUniforms(gl, this._fieldOpHighProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_e', 'u_origin', 'u_size', 'u_band', 'u_world'])
    this._fieldOpCarryUni = getUniforms(gl, this._fieldOpCarryProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_e', 'u_origin', 'u_size', 'u_band', 'u_world', 'u_path', 'u_pathEnabled'])
    this._fieldOpCarryColourUni = getUniforms(gl, this._fieldOpCarryColourProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_e', 'u_origin', 'u_size', 'u_band', 'u_world', 'u_path', 'u_pathEnabled'])
    this._resampleUni = getUniforms(gl, this._resampleProg, ['u_src', 'u_old', 'u_base', 'u_srcSize', 'u_baseSize', 'u_dstOrigin', 'u_srcOrigin', 'u_ratio', 'u_mode', 'u_clamp'])
    this._waterFrontUni = getUniforms(gl, this._waterFrontProg, [
      'u_wcNoiseTex', 'u_cost', 'u_paperHeightMap', 'u_resolution', 'u_paperOrigin', 'u_paperTexSize', 'u_paperScale',
      'u_climb', 'u_floor', 'u_costMax', 'u_film', 'u_dryCost', 'u_stride', 'u_foreignFilm', 'u_foreignWet',
    ])
    this._diffuseUni = getUniforms(gl, this._diffuseProg, [
      'u_ink', 'u_coverage', 'u_paperHeightMap', 'u_resolution',
      'u_paperOrigin', 'u_paperTexSize', 'u_paperScale', 'u_d', 'u_b', 'u_radius', 'u_stencil',
    ])
  }

  initFieldAttributes(): void {
    const { gl } = this
    this._fieldOpPosLoc        = gl.getAttribLocation(this._fieldOpProg, 'a_position')
    this._fieldOpHighPosLoc    = gl.getAttribLocation(this._fieldOpHighProg, 'a_position')
    this._fieldOpCarryPosLoc   = gl.getAttribLocation(this._fieldOpCarryProg, 'a_position')
    this._fieldOpCarryColourPosLoc = gl.getAttribLocation(this._fieldOpCarryColourProg, 'a_position')
    this._resamplePosLoc       = gl.getAttribLocation(this._resampleProg, 'a_position')
  }

  initDiffusionAttributes(): void {
    const { gl } = this
    this._diffusePosLoc        = gl.getAttribLocation(this._diffuseProg, 'a_position')
    this._waterFrontPosLoc     = gl.getAttribLocation(this._waterFrontProg, 'a_position')
  }

  destroy(): void {
    this._materialReconstruction?.dispose()
    this._materialReconstruction = null
    this._frontPaths?.dispose()
    this._frontPaths = null
    // Deleting the currently bound program is deferred until it is unbound.
    // A final field pass may still be active when a connected canvas is retired.
    const current = this.gl.getParameter(this.gl.CURRENT_PROGRAM)
    if ([this._fieldOpProg, this._fieldOpHighProg, this._fieldOpCarryProg, this._fieldOpCarryColourProg,
      this._resampleProg, this._diffuseProg, this._brushDragProg, this._waterFrontProg, this._gradientField?.program, this._costDomain?.program, this._brushJump?.program].includes(current)) {
      this.gl.useProgram(null)
    }
    this.releasePlainAdd()
    this.releaseGradientField()
    this.releaseCostDomain()
    this.releaseAdditiveZeroFaceCarry()
    this.gl.deleteProgram(this._fieldOpProg)
    this.gl.deleteProgram(this._fieldOpHighProg)
    this.gl.deleteProgram(this._fieldOpCarryProg)
    this.gl.deleteProgram(this._fieldOpCarryColourProg)
    this.gl.deleteProgram(this._resampleProg)
    this.gl.deleteProgram(this._diffuseProg)
    if (this._brushJump) this.gl.deleteProgram(this._brushJump.program)
    this._brushJump = null
    this.gl.deleteProgram(this._brushDragProg)
    this.gl.deleteProgram(this._waterFrontProg)
  }
}
