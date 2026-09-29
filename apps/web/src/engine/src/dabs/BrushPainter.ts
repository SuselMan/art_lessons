// (#494) The digital brush on its stamp model, out of PencilEngine (seam С18
// of the survey): #573's stamp + composite passes, #579/#581's digital
// watercolor (the wet edge, blooms, granulation — all inside the composite),
// and the bitmap tips and canvas-anchored textures they sample.
//
// The engine's _paintRibbonStroke hands a batch over with paint() once it
// has seen `profile.brushStamp`: the brush keeps that machinery's per-stroke
// scratch (the frozen layer, the stroke's coverage) and nothing else of it —
// no wash, no ink film, no settle. The scratch arrives as an argument and is
// seen through BrushScratch below; the ribbon owns it.
//
// What this needs from the outside is BrushContext: the GL context, the dab
// quad, the paper, and the segment length the marker also measures travel
// with.
//
// Both programs and every texture die with the GL context. initGL (the
// engine's _initGL runs it at construction and on a restore) rebuilds the
// programs and starts both texture caches empty — the old handles are dead
// and are dropped without touching the driver; each texture is uploaded again
// on its first use after that, exactly as it was the first time.

import type { Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import type { PaperSampling } from '../paper/PaperState'
import {
  brushStampsForDab, digitalBrushCeiling, type BrushDescriptor, type BrushPressureSettings,
} from '../presets/digitalBrushPresets'
import type { PencilPreset } from '../presets/pencilPresets'
import { brushTextureMips, tipMaskMips, type BrushTextureId, type TipMaskId } from '../presets/tipMasks'
import { BRUSH_COMPOSITE_FRAG, BRUSH_STAMP_FRAG, DAB_VERT } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'

/** #579 — the digital watercolor's wet rim, as a fraction of the brush's size,
 *  clamped so a thin line still has one and a huge wash does not read its rim
 *  from half a tile away (each ring sample is one texture read either way). */
const WET_EDGE_OF_SIZE = 0.06
const WET_EDGE_MIN_PX = 1.5
const WET_EDGE_MAX_PX = 14

/** #579 — world size of one tile of the bloom and granulation textures. Large
 *  for the blooms, which are meant to be bigger than the brush; small for the
 *  grain, which is meant to be finer than anything the brush draws. */
const WET_CLOUD_PERIOD_PX = 640
const WET_GRAIN_PERIOD_PX = 224

function clampNum(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** What BrushPainter may ask of the engine. A function for the quad buffer,
 *  which the engine's _initGL rebuilds on a context restore. The paper is the
 *  engine's one PaperState, held by reference: its texture changes inside it
 *  and is read at draw time. */
export interface BrushContext {
  readonly gl: WebGLRenderingContext
  /** DAB_VERT's -0.5..0.5 dab quad. */
  quadBuf(): WebGLBuffer
  readonly paper: PaperSampling
  /** How far the hand travelled from `prev` to `dab` — the engine's
   *  _markerSegmentLength, shared with the marker. */
  segmentLength(dab: Dab, prev: Dab | undefined, radius: number): number
}

/** The part of the ribbon's per-stroke scratch (RibbonStrokeScratch) a brush
 *  stroke uses: per tile, the frozen layer and the stroke's own coverage; and
 *  the wet edge's reach, fixed by the gesture's first dab. */
export interface BrushScratch {
  getOrCreate(tile: AccumulationBuffer): { original: AccumulationBuffer; coverage: AccumulationBuffer }
  noteBrushEdgePx(px: number): number
}

type Uniforms = Record<string, WebGLUniformLocation | null>

export class BrushPainter {
  private readonly gl: WebGLRenderingContext
  private readonly ctx: BrushContext

  // #573 — the digital brush's stamp model (BRUSH_STAMP_FRAG / BRUSH_COMPOSITE_FRAG).
  private stampProg!: WebGLProgram
  private stampUni!: Uniforms
  private stampPosLoc!: number
  private compositeProg!: WebGLProgram
  private compositeUni!: Uniforms
  private compositePosLoc!: number
  /** #573 — the opacity ceiling lives in the coverage buffer's alpha under a
   *  MAX blend. Universally supported in practice; without it the ceiling
   *  degrades to "off" (flow alone), never to a wrong picture. */
  private blendMinMax: { MAX_EXT: number } | null = null
  /** #573 — the bitmap tips, uploaded on first use (tipMasks.ts generates them
   *  on the CPU, deterministically, with their full mip chain). */
  private tipTextures = new Map<TipMaskId, WebGLTexture>()
  /** #573 — the brushes' canvas-anchored textures, tiled with REPEAT. */
  private brushTextures = new Map<BrushTextureId, WebGLTexture>()

  constructor(ctx: BrushContext) {
    this.gl = ctx.gl
    this.ctx = ctx
  }

  /** Builds both programs and looks up the extension — from the engine's
   *  _initGL, at construction and on a context restore. */
  initGL(): void {
    const { gl } = this
    this.stampProg     = createProgram(gl, DAB_VERT, BRUSH_STAMP_FRAG)
    this.compositeProg = createProgram(gl, DAB_VERT, BRUSH_COMPOSITE_FRAG)
    this.stampUni = getUniforms(gl, this.stampProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution', 'u_opacity',
      'u_paperHeightMap', 'u_tip', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_tipKind', 'u_hardness', 'u_aaPx', 'u_ceiling', 'u_paper', 'u_paperPressure',
      'u_texture', 'u_texStrength', 'u_texPeriod', 'u_texOrigin',
    ])
    this.compositeUni = getUniforms(gl, this.compositeProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution',
      'u_original', 'u_strokeCoverage', 'u_color', 'u_opacity', 'u_useCeiling',
      'u_screentone', 'u_screenOrigin',
      'u_wetEdge', 'u_wetEdgePx', 'u_mottle', 'u_granulation', 'u_glaze',
      'u_cloudTex', 'u_grainTex', 'u_cloudPeriod', 'u_cloudOrigin', 'u_grainPeriod', 'u_grainOrigin',
      'u_wetModel', 'u_bloom', 'u_feather',
      'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
    ])
    this.stampPosLoc     = gl.getAttribLocation(this.stampProg, 'a_position')
    this.compositePosLoc = gl.getAttribLocation(this.compositeProg, 'a_position')
    this.blendMinMax = gl.getExtension('EXT_blend_minmax') as { MAX_EXT: number } | null
    // Built fresh on context restore like every other GL object here: the
    // previous handles died with the old context.
    this.tipTextures = new Map()
    this.brushTextures = new Map()
  }

  destroy(): void {
    const { gl } = this
    gl.deleteProgram(this.stampProg)
    gl.deleteProgram(this.compositeProg)
    for (const tex of this.tipTextures.values()) gl.deleteTexture(tex)
    for (const tex of this.brushTextures.values()) gl.deleteTexture(tex)
    this.tipTextures.clear()
    this.brushTextures.clear()
  }

  /** #573, ADR 013 §11 — a digital brush stroke on the `stamp` model.
   *
   *  Same three-step shape as every stroke-scoped tool in the engine — freeze
   *  the layer, accumulate the stroke's own coverage, recompute the finished
   *  pixel — with the brush's own programs in both halves:
   *
   *  1. every dab expands into its stamps (brushStampsForDab: scatter, size,
   *     angle and flow jitter, all seeded by the dab itself);
   *  2. BRUSH_STAMP_FRAG draws them into the coverage buffer — flow into rgb
   *     as "over", the pressure ceiling into alpha as MAX;
   *  3. BRUSH_COMPOSITE_FRAG recomputes every pixel this batch could have
   *     changed from the frozen original and the coverage.
   *
   *  Pure in the dabs, the descriptor and the recorded switches — nothing is
   *  carried between batches but the buffers — so a live stroke, a one-shot
   *  replay and a chunked one come out the same. */
  paint(
    target: ILayerBuffer, dabs: Dab[], preset: PencilPreset,
    stamp: { brush: BrushDescriptor; pressure: BrushPressureSettings },
    color: [number, number, number], scratch: BrushScratch, prevDab: Dab | undefined,
  ): void {
    const { gl, ctx } = this
    const { paper } = ctx
    const { brush, pressure } = stamp
    interface Placed { x: number; y: number; radius: number; angle: number; aspect: number; flow: number; ceiling: number; pressure: number }
    const placed: Placed[] = []
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let prev = prevDab
    for (const dab of dabs) {
      const diameter = Math.max(dab.size * preset.sizeMultiplier, 0.5)
      // Per-pass flow → per-stamp flow against the distance actually travelled
      // (see BrushDescriptor.flow): after crossing one span, a pixel has been
      // under enough stamps to hold exactly `flow`, whatever the spacing and
      // however fast the hand moved.
      let flow = brush.flow
      if (brush.flowPer === 'pass' && flow < 1) {
        const span = diameter * (brush.flowSpan ?? 1)
        // (#581) Wet model 2 gives the stroke's first dab one ordinary step of
        // travel, not the half radius every other tool's first dab gets: that
        // extra flow made a dense disc at the start, and the wet edge drew its
        // outline as a ring inside the stroke. Model 2 only — every brush
        // already shipped keeps drawing its first dab as it always has.
        const travel = !prev && brush.wet?.model === 2
          ? diameter * brush.spacing
          : ctx.segmentLength(dab, prev, diameter * 0.5)
        flow = 1 - Math.pow(1 - flow, Math.min(travel / span, 1))
      }
      const ceiling = digitalBrushCeiling(brush, dab.pressure, pressure.opacity)
      for (const st of brushStampsForDab(brush, dab)) {
        const radius = st.size * 0.5 * preset.sizeMultiplier
        if (radius < 0.25) continue
        const reach = radius * Math.max(st.aspect, 1) + 1
        minX = Math.min(minX, st.x - reach); maxX = Math.max(maxX, st.x + reach)
        minY = Math.min(minY, st.y - reach); maxY = Math.max(maxY, st.y + reach)
        placed.push({
          x: st.x, y: st.y, radius, angle: st.angle, aspect: st.aspect,
          flow: flow * st.flowScale, ceiling, pressure: dab.pressure,
        })
      }
      prev = dab
    }
    if (!placed.length) return
    const bounds = { minX: Math.floor(minX), minY: Math.floor(minY), maxX: Math.ceil(maxX), maxY: Math.ceil(maxY) }
    const targets = target.resolveForPaint(bounds)
    if (!targets.length) return
    // (#579) The wet edge reads coverage up to edgePx away, so a pixel's
    // finished value depends on stamps that far off: the composite has to
    // reach that much further than the stamps, or a later batch changes a
    // pixel no composite ever revisits, and the stroke comes out different
    // live and on replay.
    const edgePx = brush.wet && brush.wet.edge > 0
      ? scratch.noteBrushEdgePx(clampNum(dabs[0].size * preset.sizeMultiplier * WET_EDGE_OF_SIZE, WET_EDGE_MIN_PX, WET_EDGE_MAX_PX))
      : 0
    const pad = edgePx > 0 ? Math.ceil(edgePx) + 1 : 0
    const compositeBounds = pad > 0
      ? { minX: bounds.minX - pad, minY: bounds.minY - pad, maxX: bounds.maxX + pad, maxY: bounds.maxY + pad }
      : bounds

    const tipTex = brush.tip.kind === 'bitmap' && brush.tip.mask ? this.tipTexture(brush.tip.mask) : null
    const grain = brush.texture ? { ...brush.texture, tex: this.brushTexture(brush.texture.id) } : null
    const minmax = this.blendMinMax
    const useCeiling = pressure.opacity && !!minmax

    for (const tile of targets) {
      const { original, coverage } = scratch.getOrCreate(tile.buffer)

      coverage.beginDraw()
      if (minmax) {
        gl.blendEquationSeparate(gl.FUNC_ADD, minmax.MAX_EXT)
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE)
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR)
      }
      gl.useProgram(this.stampProg)
      const u = this.stampUni
      gl.uniform2f(u.u_resolution, coverage.width, coverage.height)
      const { w: paperTexW, h: paperTexH } = paper.worldSize()
      gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
      gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
      gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, paper.texture)
      gl.uniform1i(u.u_paperHeightMap, 0)
      // Bound even for a round tip: WebGL validates every sampler a linked
      // program declares, and the paper is guaranteed not to be the target.
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, tipTex ?? paper.texture)
      gl.uniform1i(u.u_tip, 1)
      gl.uniform1f(u.u_tipKind, tipTex ? 1 : 0)
      gl.uniform1f(u.u_hardness, brush.tip.hardness)
      gl.uniform1f(u.u_aaPx, 1)
      gl.uniform1f(u.u_paper, brush.paperInteraction)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, grain?.tex ?? paper.texture)
      gl.uniform1i(u.u_texture, 2)
      gl.uniform1f(u.u_texStrength, grain?.strength ?? 0)
      const period = grain?.periodPx ?? 1
      gl.uniform1f(u.u_texPeriod, period)
      // Reduced here, exactly, so the shader only ever adds small numbers.
      const wrap = (v: number): number => ((v % period) + period) % period
      gl.uniform2f(u.u_texOrigin, wrap(tile.originX), wrap(tile.originY))

      gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quadBuf())
      gl.enableVertexAttribArray(this.stampPosLoc)
      gl.vertexAttribPointer(this.stampPosLoc, 2, gl.FLOAT, false, 0, 0)

      const tx0 = tile.originX, ty0 = tile.originY
      const tx1 = tx0 + tile.buffer.width, ty1 = ty0 + tile.buffer.height
      for (const p of placed) {
        const reach = p.radius * Math.max(p.aspect, 1) + 1
        if (p.x + reach <= tx0 || p.x - reach >= tx1 || p.y + reach <= ty0 || p.y - reach >= ty1) continue
        gl.uniform2f(u.u_dabCenter, p.x - tx0, p.y - ty0)
        gl.uniform1f(u.u_dabRadius, p.radius)
        gl.uniform1f(u.u_angle, p.angle)
        gl.uniform1f(u.u_aspectRatio, p.aspect)
        gl.uniform1f(u.u_opacity, p.flow)
        gl.uniform1f(u.u_ceiling, p.ceiling)
        gl.uniform1f(u.u_paperPressure, p.pressure)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      // Every other blend in the engine assumes FUNC_ADD and sets only the
      // factors — leave the equation as it found it.
      if (minmax) gl.blendEquation(gl.FUNC_ADD)
      coverage.endDraw()

      this.drawComposite(tile, compositeBounds, brush, original, coverage, color, dabs[0].opacity, useCeiling, edgePx)
    }
    target.markContentPainted(compositeBounds)
  }

  /** #573 — BRUSH_COMPOSITE_FRAG over `bounds` in one tile: the finished pixel
   *  from the frozen original and the stroke's coverage. A replace draw, since
   *  the result is the answer rather than a contribution to it (see
   *  AccumulationBuffer.beginReplaceDraw). */
  private drawComposite(
    tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number },
    brush: BrushDescriptor, original: AccumulationBuffer, coverage: AccumulationBuffer,
    color: [number, number, number], opacity: number, useCeiling: boolean, edgePx: number,
  ): void {
    const { gl, ctx } = this
    const { paper } = ctx
    const { buffer } = tile
    buffer.beginReplaceDraw()
    gl.useProgram(this.compositeProg)
    const u = this.compositeUni
    // (#579) Digital watercolor. Zeros for every other brush — uniforms outlive
    // the draw that set them, and this program is shared by the whole set.
    const wet = brush.wet
    gl.uniform1f(u.u_wetEdge, wet && edgePx > 0 ? wet.edge : 0)
    gl.uniform1f(u.u_wetEdgePx, edgePx)
    gl.uniform1f(u.u_mottle, wet?.mottle ?? 0)
    gl.uniform1f(u.u_granulation, wet?.granulation ?? 0)
    gl.uniform1f(u.u_glaze, wet?.glaze ? 1 : 0)
    // (#581) Model 2 and its two extra terms; a wet brush without a model is
    // #579's, which is what every stroke recorded with those brushes says.
    gl.uniform1f(u.u_wetModel, wet ? (wet.model ?? 1) : 0)
    gl.uniform1f(u.u_bloom, wet?.bloom ?? 0)
    gl.uniform1f(u.u_feather, wet?.feather ?? 0)
    // The paper, for granulation — the same world-space sampling every dab
    // shader in the engine uses (#141).
    const { w: paperTexW, h: paperTexH } = paper.worldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, paper.texture)
    gl.uniform1i(u.u_paperHeightMap, 4)
    // Bound whether read or not: WebGL validates every declared sampler.
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.brushTexture('cloud'))
    gl.uniform1i(u.u_cloudTex, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.brushTexture('grit'))
    gl.uniform1i(u.u_grainTex, 3)
    const wrapBy = (period: number) => (v: number): number => ((v % period) + period) % period
    const cloudWrap = wrapBy(WET_CLOUD_PERIOD_PX)
    const grainWrap = wrapBy(WET_GRAIN_PERIOD_PX)
    gl.uniform1f(u.u_cloudPeriod, WET_CLOUD_PERIOD_PX)
    gl.uniform2f(u.u_cloudOrigin, cloudWrap(tile.originX), cloudWrap(tile.originY))
    gl.uniform1f(u.u_grainPeriod, WET_GRAIN_PERIOD_PX)
    gl.uniform2f(u.u_grainOrigin, grainWrap(tile.originX), grainWrap(tile.originY))
    gl.uniform2f(u.u_resolution, buffer.width, buffer.height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, original.texture)
    gl.uniform1i(u.u_original, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, coverage.texture)
    gl.uniform1i(u.u_strokeCoverage, 1)
    gl.uniform3fv(u.u_color, color)
    gl.uniform1f(u.u_opacity, opacity)
    gl.uniform1f(u.u_useCeiling, useCeiling ? 1 : 0)
    const pitch = brush.screentonePx ?? 0
    gl.uniform1f(u.u_screentone, pitch)
    // The screen repeats every 2 * pitch along both world axes (see the
    // shader), so the tile's origin is reduced by exactly that here, in
    // integers, and the GPU only ever sees numbers smaller than the period.
    const period = pitch * 2
    const wrap = (v: number): number => period > 0 ? ((v % period) + period) % period : 0
    gl.uniform2f(u.u_screenOrigin, wrap(tile.originX), wrap(tile.originY))

    // The rect is covered by a circumscribing dab quad, the same trick the
    // ribbon composite uses (the engine's _drawRibbonCompositeRect).
    const cx = (bounds.minX + bounds.maxX) * 0.5
    const cy = (bounds.minY + bounds.maxY) * 0.5
    const radius = 0.5 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 1
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quadBuf())
    gl.enableVertexAttribArray(this.compositePosLoc)
    gl.vertexAttribPointer(this.compositePosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.uniform2f(u.u_dabCenter, cx - tile.originX, cy - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, 0)
    gl.uniform1f(u.u_aspectRatio, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    buffer.endDraw()
  }

  /** A brush texture (#573), tiled across the canvas — REPEAT rather than
   *  CLAMP, and mipmapped from the CPU chain for the same reason the tips are. */
  private brushTexture(id: BrushTextureId): WebGLTexture {
    const cached = this.brushTextures.get(id)
    if (cached) return cached
    const tex = this.uploadMips(brushTextureMips(id), this.gl.REPEAT)
    this.brushTextures.set(id, tex)
    return tex
  }

  /** One bitmap tip as a mipmapped LUMINANCE texture, uploaded on first use.
   *
   *  Every mip level comes from tipMaskMips on the CPU rather than from
   *  gl.generateMipmap — see that function on why the driver's filter is not
   *  trusted with a value every participant has to agree on. */
  private tipTexture(id: TipMaskId): WebGLTexture {
    const cached = this.tipTextures.get(id)
    if (cached) return cached
    const tex = this.uploadMips(tipMaskMips(id), this.gl.CLAMP_TO_EDGE)
    this.tipTextures.set(id, tex)
    return tex
  }

  private uploadMips(levels: Uint8Array[], wrapMode: number): WebGLTexture {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    let size = Math.round(Math.sqrt(levels[0].length))
    for (let level = 0; level < levels.length; level++) {
      gl.texImage2D(gl.TEXTURE_2D, level, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, levels[level])
      size = Math.max(1, size >> 1)
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode)
    return tex
  }
}
