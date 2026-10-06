import { ribbonBristleCombs, ribbonWaterDelivery } from '../dabs/ribbonStrokeMath'
import type { Dab } from '@grafetto/shared'
import { RIBBON_VERT, RIBBON_FRAG } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { StampPainter } from '../dabs/StampPainter'
import { type PencilPreset } from '../presets/pencilPresets'
import { RIBBON_FLOATS_PER_VERTEX } from '../dabs/markerRibbon'
import { type RibbonProfile } from '../dabs/ribbonProfile'
import type { PaintTarget } from '../buffers/ILayerBuffer'

export interface RibbonPassesContext {
  gl(): WebGLRenderingContext
  stamps(): StampPainter
  paperTex(): WebGLTexture
  quadBuf(): WebGLBuffer
  minmaxExt(): { MAX_EXT: number } | null
  paperScale(): number
  paperWorldSize(): { w: number; h: number }
  paperFillThreshold(): number
  paperFillCap(): number
  wcDebugView(): number
  wcAb(): { noSpread: boolean; noMigrate: boolean }
}

/** Ribbon GPU draw primitives and their band program/vertex buffer.
 * The four init stages preserve the engine's existing GL allocation order. */
export class RibbonPasses {
  private readonly ctx: RibbonPassesContext
  constructor(ctx: RibbonPassesContext) { this.ctx = ctx }
  private get gl(): WebGLRenderingContext { return this.ctx.gl() }

  // Marker ribbon (#330 stage 2) — the bands between consecutive nib stamps
  // (markerRibbon.ts). Its own tiny program: unlike every other dab draw, the
  // vertices arrive already positioned by the CPU and carry a per-vertex
  // distance-to-edge, so neither DAB_VERT's uniforms nor DAB_FRAG's branches
  // apply.
  private _ribbonProg!: WebGLProgram

  private _ribbonUni!: Record<string, WebGLUniformLocation | null>

  private _ribbonPosLoc!: number

  private _ribbonEdgeLoc!: number

  private _ribbonInkLoc!: number

  private _ribbonInkWaterLoc!: number

  private _ribbonAcrossLoc!: number

  private _ribbonInkWetLoc!: number

  private _ribbonInkStrengthLoc!: number

  private _ribbonPuddleLoc!: number

  private _ribbonBuf!: WebGLBuffer


  /** #330 stage 2/3: one nib stamp drawn from its own analytic in-pixel outline
   *  — the coverage pass (`inkMode` 6, the ribbon's caps) and the ink pass
   *  (`inkMode` 7) are the same geometry and differ only in what they write, so
   *  they share one method. That sharing is the point: silhouette and pigment
   *  cannot disagree about where the nib ended.
   *
   *  Sets none of the paper/hardness/grain uniforms a soft dab profile needs —
   *  neither branch reads them. The three samplers still need *something* bound
   *  (WebGL validates every active sampler in a linked program, not just the
   *  branch that runs) and must not be the render target itself, which would be
   *  a feedback loop, and that fails the draw call outright with
   *  GL_INVALID_OPERATION whether or not the live branch ever samples it.
   *  Found the hard way: every marker dab silently no-opped with error 1282
   *  until it was caught.
   *
   *  `ownTarget` false leaves framebuffer/blend setup to the caller, which the
   *  ink pass needs (it accumulates additively, not "over"). */
  drawRibbonNibPass(
    dest: AccumulationBuffer, tile: PaintTarget, dab: Dab, preset: PencilPreset,
    profile: RibbonProfile, inkMode: 6 | 7 | 10, opacity: number, ownTarget = true,
    /** (#468 v4) How wet the brush was for *this* dab, written into the deposit
     *  texture's colour channels so the composite can recover a per-pixel water
     *  level (ADR 011 §4.1). 0 for every tool with no water model, which leaves
     *  those channels at zero and the ratio unread. */
    inkWater = 0,
    /** (#536) Which way "across the brush" points for this dab, as a unit
     *  vector in the nib's own local axes. The stamps must agree with the bands
     *  about this or the hair comb would soften at every stamp, i.e. ripple at
     *  the dab pitch. Defaults to the nib's minor axis, which for a round nib
     *  whose angle follows the path is already the perpendicular of travel. */
    acrossLocal: [number, number] = [0, 1],
    /** (#536) How wet the paper under this dab already was, from the stroke's
     *  own recorded profile. Written into the deposit texture's green channel
     *  so the composite can tell it apart from the brush's own water. */
    paperWet = 0,
    /** (#536) How strong the paint in the brush is for this stroke. */
    inkStrength = 1,
    /** (#536) This stroke's own offset into the mottling field — see wcCloud. */
    mottleSeed: [number, number] = [0, 0],
    /** (#536) Land this ink only where `clipTo` already has coverage, scaled
     *  by it — the halo's way of never leaving the puddle. See u_inkClip. */
    clipTo: AccumulationBuffer | null = null,
    /** (#536, s17.13) Ink mode only: the hairs, laid into the deposit. */
    bristleCombs = 0, bristleInk = 0,
    /** (#536, s17.19) Ink mode into the colour record: the paint's absorption
     *  per channel; null writes the deposit as always. */
    depthTau: readonly [number, number, number] | null = null,
    /** (s17.27) How deep the water stands under this dab — see
     *  watercolorPuddleDepth. The coverage stamp reads it, and (s17.79) the
     *  watercolor's ink stamp where poolBlot is on. */
    puddle = 1,
    /** (#680, s17.79) Break the brush's surplus into blots (wcPoolBlot):
     *  the watercolor's own ink stamps only. */
    poolBlot = 0,
  ): void {
    const { gl } = this
    if (ownTarget) dest.beginDraw()

    gl.useProgram(this.ctx.stamps().program)
    this.ctx.stamps().bindNoise(this.ctx.stamps().uniforms.u_wcNoiseTex)
    const u = this.ctx.stamps().uniforms
    gl.uniform2f(u.u_resolution, dest.width, dest.height)
    for (const [unit, loc] of [[0, u.u_paperHeightMap], [1, u.u_original], [2, u.u_strokeCoverage], [3, u.u_inkLoad]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, this.ctx.paperTex())
      gl.uniform1i(loc, unit)
    }
    const radius = dab.size * 0.5 * preset.sizeMultiplier
    gl.uniform1f(u.u_eraseMode, 0.0)
    gl.uniform1i(u.u_grainMode, 0)
    gl.uniform1f(u.u_inkMode, inkMode)
    // #452: cleared, not merely unset — a liner stroke drawn a moment ago left
    // its own band on this same program (_dabProg is shared), and the marker's
    // nib geometry is sized off the quad it gets handed.
    gl.uniform1f(u.u_wickPx, 0)
    gl.uniform1f(u.u_wickCap, 0)
    gl.uniform1f(u.u_aaPx, profile.aaPx)
    // #547: set explicitly rather than left wherever the last draw put it —
    // _dabProg is shared with the graphite path, which writes this uniform on
    // every dab, so the digital brush's stamp (u_inkMode=10) would otherwise
    // take its edge softness from whatever pencil grade was last drawn. Modes 6
    // and 7 never read it, so this is inert for the three older ribbon tools.
    gl.uniform1f(u.u_hardness, preset.hardness)
    gl.uniform1f(u.u_nibShape, profile.nibShape === 'roundedBox' ? 1 : 0)
    gl.uniform1f(u.u_nibCorner, radius * profile.cornerFraction)
    gl.uniform1f(u.u_inkEdge, profile.inkEdgeFalloff)
    if (clipTo) {
      // Unit 2 is u_strokeCoverage — bound to the paper placeholder above, as
      // for every stamp, and replaced here with the wash's real coverage.
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, clipTo.texture)
      gl.activeTexture(gl.TEXTURE0)
    }
    gl.uniform1f(u.u_inkClip, clipTo ? profile.diagnosticReadFluid ? 2 : 1 : 0)
    // (#536) Where on the sheet this tile is — the deposit's own mottling is a
    // world-space field and must land in the same place for a stamp as it does
    // for a band. Set here rather than inherited: this pass did not set it at
    // all before, so it was reading whatever the previous draw happened to
    // leave, which is fine for a value nothing used and a silent seam once
    // something did.
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.uniform1f(u.u_cloudDeposit, profile.cloud)
    gl.uniform1f(u.u_granDeposit, profile.granulation)
    gl.uniform2f(u.u_mottleSeed, mottleSeed[0], mottleSeed[1])

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
    gl.enableVertexAttribArray(this.ctx.stamps().positionLoc)
    gl.vertexAttribPointer(this.ctx.stamps().positionLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, dab.angle)
    gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_opacity, opacity)
    // #468 v4 — weights the deposit written into the texture's colour channels.
    gl.uniform1f(u.u_inkWater, inkWater)
    gl.uniform2f(u.u_acrossLocal, acrossLocal[0], acrossLocal[1])
    gl.uniform1f(u.u_paperWet, paperWet)
    gl.uniform1f(u.u_puddle, puddle)
    gl.uniform1f(u.u_poolBlot, poolBlot)
    // (#536, s17.11/13) What this stroke delivers and what dry paper keeps of
    // it — the mix's water, not this dab's depleted load — into the record of
    // standing water the diffusion pass gates on. See u_washWater.
    const delivery = ribbonWaterDelivery(profile)
    gl.uniform1f(u.u_washWater, delivery.water)
    gl.uniform1f(u.u_waterRetain, delivery.retain)
    gl.uniform1f(u.u_inkStrength, inkStrength)
    gl.uniform1f(u.u_bristleCombs, bristleCombs)
    gl.uniform1f(u.u_bristleInk, bristleInk)
    gl.uniform1f(u.u_depthWrite, depthTau ? 1 : 0)
    gl.uniform3fv(u.u_tau, depthTau ? [depthTau[0], depthTau[1], depthTau[2]] : [0, 0, 0])
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    if (ownTarget) dest.endDraw()
  }


  /** #330 stage 2, coverage pass part 2: every band of this batch in one draw
   *  (markerRibbon.ts built them; RIBBON_FRAG turns each vertex's carried
   *  distance-to-edge into coverage). Positions are world-space, shifted into
   *  this tile's own pixel space here — the only per-tile work, which is why
   *  the geometry itself is built once for the whole batch rather than per
   *  tile. */
  drawRibbonBands(
    dest: AccumulationBuffer, tile: PaintTarget, bands: Float32Array, mode: 'coverage' | 'ink' | 'ink-max', aaPx: number,
    cloud = 0, gran = 0, mottleSeed: [number, number] = [0, 0],
    /** (#536, s17.11/13) Coverage mode only: the water the stroke delivers
     *  and what dry paper keeps of it, into .b together with each band's
     *  recorded paper wetness. See u_washWater. */
    washWater = 0, waterRetain = 0,
    /** (#536, s17.13) Ink mode only: the hairs, laid into the deposit. */
    bristleCombs = 0, bristleInk = 0,
    /** (#536, s17.19) Ink mode into the colour record — see _drawRibbonNibPass. */
    depthTau: readonly [number, number, number] | null = null,
    /** (#680, s17.79) See _drawRibbonNibPass's poolBlot. */
    poolBlot = 0, availableWater: AccumulationBuffer | null = null,
  ): void {
    const { gl } = this
    const local = bands.slice()
    for (let i = 0; i < bands.length; i += RIBBON_FLOATS_PER_VERTEX) {
      local[i]     = bands[i]     - tile.originX
      local[i + 1] = bands[i + 1] - tile.originY

    }

    if (mode === 'ink-max') dest.beginMaxDraw(this.ctx.minmaxExt()!); else if (mode === 'ink') dest.beginAdditiveDraw(); else dest.beginDraw()
    gl.useProgram(this._ribbonProg)
    this.ctx.stamps().bindNoise(this._ribbonUni.u_wcNoiseTex)
    gl.uniform2f(this._ribbonUni.u_resolution, dest.width, dest.height)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, availableWater?.texture ?? this.ctx.paperTex())
    gl.uniform1i(this._ribbonUni.u_availableWater, 1)
    gl.uniform1f(this._ribbonUni.u_useAvailableWater, availableWater ? 1 : 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(this._ribbonUni.u_aaPx, aaPx)
    gl.uniform1f(this._ribbonUni.u_mode, mode === 'coverage' ? 0 : 1)
    gl.uniform2f(this._ribbonUni.u_worldOrigin, tile.originX, -tile.originY || 0)
    gl.uniform1f(this._ribbonUni.u_cloudDeposit, cloud)
    gl.uniform1f(this._ribbonUni.u_granDeposit, gran)
    gl.uniform1f(this._ribbonUni.u_poolBlot, poolBlot)
    gl.uniform2f(this._ribbonUni.u_mottleSeed, mottleSeed[0], mottleSeed[1])
    gl.uniform1f(this._ribbonUni.u_washWater, washWater)
    gl.uniform1f(this._ribbonUni.u_waterRetain, waterRetain)
    gl.uniform1f(this._ribbonUni.u_bristleCombs, bristleCombs)
    gl.uniform1f(this._ribbonUni.u_bristleInk, bristleInk)
    gl.uniform1f(this._ribbonUni.u_depthWrite, depthTau ? 1 : 0)
    gl.uniform3fv(this._ribbonUni.u_tau, depthTau ? [depthTau[0], depthTau[1], depthTau[2]] : [0, 0, 0])

    gl.bindBuffer(gl.ARRAY_BUFFER, this._ribbonBuf)
    gl.bufferData(gl.ARRAY_BUFFER, local, gl.STREAM_DRAW)
    const stride = RIBBON_FLOATS_PER_VERTEX * 4
    gl.enableVertexAttribArray(this._ribbonPosLoc)
    gl.vertexAttribPointer(this._ribbonPosLoc, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this._ribbonEdgeLoc)
    gl.vertexAttribPointer(this._ribbonEdgeLoc, 1, gl.FLOAT, false, stride, 8)
    gl.enableVertexAttribArray(this._ribbonInkWaterLoc)
    gl.vertexAttribPointer(this._ribbonInkWaterLoc, 1, gl.FLOAT, false, stride, 16)
    gl.enableVertexAttribArray(this._ribbonInkLoc)
    gl.vertexAttribPointer(this._ribbonInkLoc, 1, gl.FLOAT, false, stride, 12)
    gl.enableVertexAttribArray(this._ribbonAcrossLoc)
    gl.vertexAttribPointer(this._ribbonAcrossLoc, 1, gl.FLOAT, false, stride, 20)
    gl.enableVertexAttribArray(this._ribbonInkWetLoc)
    gl.vertexAttribPointer(this._ribbonInkWetLoc, 1, gl.FLOAT, false, stride, 24)
    gl.enableVertexAttribArray(this._ribbonInkStrengthLoc)
    gl.vertexAttribPointer(this._ribbonInkStrengthLoc, 1, gl.FLOAT, false, stride, 28)
    gl.enableVertexAttribArray(this._ribbonPuddleLoc)
    gl.vertexAttribPointer(this._ribbonPuddleLoc, 3, gl.FLOAT, false, stride, 32)

    gl.drawArrays(gl.TRIANGLES, 0, local.length / RIBBON_FLOATS_PER_VERTEX)

    // Leaving these enabled would make the *next* program's draw read a stale
    // per-vertex stream for whatever attribute index happens to collide with
    // them (these slots are not reserved across programs).
    gl.disableVertexAttribArray(this._ribbonEdgeLoc)
    gl.disableVertexAttribArray(this._ribbonInkWaterLoc)
    gl.disableVertexAttribArray(this._ribbonInkLoc)
    gl.disableVertexAttribArray(this._ribbonAcrossLoc)
    gl.disableVertexAttribArray(this._ribbonInkWetLoc)
    gl.disableVertexAttribArray(this._ribbonInkStrengthLoc)
    dest.endDraw()
  }


  /** #330 stage 2, composite pass: the same DAB_FRAG u_inkMode=2 branch the
   *  every other tool's dabs feed, but drawn once over the whole batch's dirty
   *  rect instead of once per dab — see _ribbonStrokeWork's own doc comment for why a
   *  per-dab quad no longer covers what the coverage pass wrote.
   *
   *  The rect is covered by a circumscribing dab quad (aspect 1, angle 0,
   *  radius = half the diagonal) rather than a new full-rect program: DAB_FRAG
   *  discards outside `dist > 1`, and a circle through the rect's corners
   *  contains every pixel of it. The extra fragments cost nothing — the branch
   *  discards any pixel this stroke hasn't covered anyway. */
  drawRibbonCompositeRect(
    tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number },
    preset: PencilPreset, profile: RibbonProfile,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer | null,
    inkColor: AccumulationBuffer | null,
    color: [number, number, number], opacity: number,
    fieldSeed: [number, number], spreadPx: number, water: number, migratePx: number,
    inkSmoothPx: number, strokeDir: [number, number],
    /** (#536) Half-width of this gesture's mark, px — what the hair count is
     *  derived from. */
    bristleRadiusPx = 0,
  ): void {
    // (#536, §17.22) The rect itself, as a dab whose aspect is the rect's:
    // DAB_VERT scales the unit quad by (aspect, 1) * radius * 2, so a "dab"
    // of size H and aspect W/H covers exactly W x H. It used to be a round
    // dab of the rect's half-DIAGONAL, which the composite branch (pure
    // gl_FragCoord, no dab geometry) filled corner to corner — twice the
    // rect's area of the most expensive shader in the tool, for nothing.
    // One pixel of margin so a fractional edge cannot leave a column out.
    const minX = Math.floor(bounds.minX) - 1, minY = Math.floor(bounds.minY) - 1
    const maxX = Math.ceil(bounds.maxX) + 1, maxY = Math.ceil(bounds.maxY) + 1
    const w = maxX - minX, h = maxY - minY
    if (w <= 0 || h <= 0) return
    const rectDab: Dab = {
      x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5, pressure: 1, tiltX: 0, tiltY: 0,
      size: h, aspectRatio: w / h, angle: 0, opacity, t: 0,
    }
    this.drawRibbonCompositeDab(tile, rectDab, h * 0.5, preset, profile, original, coverage, inkLoad, inkColor, color, fieldSeed, spreadPx, water, migratePx, inkSmoothPx, strokeDir, bristleRadiusPx)
  }


  /** The marker's multiply-with-darkness composite (DAB_FRAG's u_inkMode>1.5
   *  branch), reading `original`/`coverage`/`inkLoad` as plain full-tile
   *  textures (sampled via gl_FragCoord/u_resolution — no patch-relative
   *  origin/size uniforms needed, since all three are already 1:1-aligned
   *  with the tile this draws into) instead of a small per-dab copied
   *  patch. */
  drawRibbonCompositeDab(
    tile: PaintTarget, dab: Dab, radius: number, preset: PencilPreset, profile: RibbonProfile,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer | null,
    inkColor: AccumulationBuffer | null,
    color: [number, number, number], fieldSeed: [number, number], spreadPx: number, water: number,
    migratePx: number, inkSmoothPx: number, strokeDir: [number, number],
    /** (#536) Half-width of this gesture's mark, px — what the hair count is
     *  derived from. */
    bristleRadiusPx = 0,
  ): void {
    const { gl } = this
    const { buffer } = tile
    if (this.ctx.wcAb().noSpread) spreadPx = 0
    if (this.ctx.wcAb().noMigrate) migratePx = 0
    // Overwrite, not "over" (#330) — this branch recomputes the finished pixel
    // from scratch every time, so blending it into its own previous output
    // compounded alpha once per dab. See beginReplaceDraw's own comment.
    buffer.beginReplaceDraw()

    gl.useProgram(this.ctx.stamps().program)
    this.ctx.stamps().bindNoise(this.ctx.stamps().uniforms.u_wcNoiseTex)
    const u = this.ctx.stamps().uniforms
    gl.uniform2f(u.u_resolution, buffer.width, buffer.height)
    gl.uniform2f(u.u_paperScale, this.ctx.paperScale(), this.ctx.paperScale())
    // #141: world-space paper sampling — see DAB_FRAG's own comment. Marker
    // never actually reads u_paperHeightMap in *this* branch (ADR 004 §8 —
    // the composite itself has no paper interaction, only the coverage
    // splat's edge bleed does), but every uniform this shared program
    // declares still needs a value bound each draw the way every other
    // caller of _dabProg already does, so this mirrors _paintDabsUniform's
    // own setup exactly rather than skipping it.
    const { w: paperTexW, h: paperTexH } = this.ctx.paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.ctx.paperTex())
    gl.uniform1i(u.u_paperHeightMap, 0)
    // The actual multiply-compositing inputs (ADR 004 §3, redesigned in
    // "Ревизия v1.5" — see RibbonStrokeScratch's own doc comment): this
    // tile's frozen pre-stroke content, this stroke's own running coverage
    // (silhouette/alpha) and running inkLoad (darkness) — both just updated
    // by the two splat passes above, same quad, moments ago. No paper-color
    // uniform any more: DAB_FRAG's own effectiveBase now falls back to a
    // flat vec3(1.0) for an untouched spot, not this room's actual paper
    // tone — a fully built-up marker mark on blank layer content multiplies
    // out to exactly the picked swatch color that way (1.0 * color =
    // color), while still correctly darkening toward whatever's *really*
    // underneath (a pencil line, say) wherever this layer isn't blank.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, original.texture)
    gl.uniform1i(u.u_original, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, coverage.texture)
    gl.uniform1i(u.u_strokeCoverage, 2)
    // Bound even when this tool has no ink load: WebGL validates every active
    // sampler in a linked program, not only the branch that runs, and an
    // unbound one fails the draw outright (see _drawRibbonNibPass's own note
    // on the 1282 that cost an afternoon). The paper texture stands in — the
    // source-over branch never samples it, and it is guaranteed not to be the
    // render target, which would be a feedback loop.
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, inkLoad ? inkLoad.texture : this.ctx.paperTex())
    gl.uniform1i(u.u_inkLoad, 3)
    // (#536, §17.19) The colour record on its own unit for this draw. Every
    // other user of the program leaves the sampler at unit 0 (the paper,
    // always bound), and it is put back there below, so no draw ever finds
    // it pointing at a unit nothing is bound to.
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, inkColor ? inkColor.texture : this.ctx.paperTex())
    gl.uniform1i(u.u_inkColor, 4)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(u.u_hardness, preset.hardness)
    gl.uniform1f(u.u_eraseMode, 0.0)
    gl.uniform3fv(u.u_color, color)
    // No graphite grain dither for marker — same reasoning liner's own
    // branch gives (a completely different deposit formula, not a
    // "graphite variant"); DAB_FRAG's marker branch never calls
    // computeGrain at all, so this value is inert, but every _dabProg
    // caller sets it (see _paintDabsUniform) so this stays consistent.
    gl.uniform1i(u.u_grainMode, 0)
    gl.uniform1f(u.u_paperFillThreshold, this.ctx.paperFillThreshold())
    gl.uniform1f(u.u_paperFillCap, this.ctx.paperFillCap())
    gl.uniform1f(u.u_inkMode, profile.compositeInkMode)
    // #454: how strongly paper grain acts on a ribbon tool's rim — read by the
    // u_inkMode=8 and =9 branches, in opposite directions (RibbonProfile
    // .paperRim) — and set on every composite draw, not just those tools', for
    // the same reason u_wickPx is cleared below: uniforms persist across draws
    // on a shared program.
    gl.uniform1f(u.u_paperRim, profile.paperRim)
    // #468, ADR 011 §3 — watercolor's four, set on every ribbon composite (not
    // just watercolor's) for the same uniforms-persist reason u_wickPx is
    // cleared below. Every other profile carries zeros, which makes each term
    // in the u_inkMode=9 branch vanish identically.
    //
    // (#468 v4) No live/settle split any more — every term runs on every
    // composite, and the settle pass differs only in the rect it covers. See
    // _ribbonStrokeWork's compositeBounds for why that became possible, and
    // what the split cost perceptually while it lasted.
    gl.uniform1f(u.u_wetEdge, profile.wetEdge)
    gl.uniform1f(u.u_wetEdgeRadiusPx, profile.wetEdgeRadiusPx)
    // (#536) Bundles from the mark's own half-width, so a hair stays a fixed
    // few pixels wide whatever brush is held — see
    // WATERCOLOR_BRISTLE_BUNDLE_PX. The coordinate this scales runs -1..+1
    // across the whole width, so the count of bundles laid across the mark is
    // twice this.
    const combs = ribbonBristleCombs(profile, bristleRadiusPx)
    gl.uniform1f(u.u_granulation, profile.granulation)
    gl.uniform1f(u.u_bristleCombs, combs)
    gl.uniform1f(u.u_bristleInk, profile.bristleInk)
    gl.uniform1f(u.u_wcDebugView, this.ctx.wcDebugView())
    // (#536) The fallback where there is no deposit to read a per-pixel value
    // from — the spread fringe, which is about to be decided by it.
    gl.uniform1f(u.u_inkStrength, profile.pigmentStrength)
    gl.uniform1f(u.u_saturateInk, profile.saturateInk)
    // #468 v2 — split by *what the term depends on*, not by taste. The spread
    // rewrites the mark's silhouette and so cannot be evaluated before the
    // stroke is finished, exactly like the wet edge above it. The cloud field
    // is a per-place value owing nothing to the silhouette, so it runs on every
    // batch — deferring it would only make a wash visibly change tone at
    // pen-up, buying nothing.
    gl.uniform1f(u.u_spreadPx, spreadPx)
    gl.uniform1f(u.u_cloud, profile.cloud)
    gl.uniform2f(u.u_fieldOffset, fieldSeed[0], fieldSeed[1])
    // #468 v4 — the brush model (ADR 011 §4). u_water is the fallback the
    // composite uses outside the mark, where there is no deposit to read a
    // per-pixel level from.
    gl.uniform1f(u.u_water, water)
    gl.uniform1f(u.u_dryContact, profile.dryContact)
    gl.uniform1f(u.u_edgeSoft, profile.edgeSoft)
    gl.uniform1f(u.u_edgeWander, profile.edgeWander)
    gl.uniform2f(u.u_strokeDir, strokeDir[0], strokeDir[1])
    gl.uniform1f(u.u_tideLo, profile.tideLo)
    gl.uniform1f(u.u_tideHi, profile.tideHi)
    gl.uniform1f(u.u_pigmentOpacity, profile.pigmentOpacity)
    gl.uniform1f(u.u_inkSmoothPx, profile.normalizeDeposit ? inkSmoothPx : 0)
    // #468 v11 — pigment transport (ADR 011 §11). A zero gain switches the
    // block off outright rather than scaling its result to nothing, which
    // matters here in a way it does not for the terms above: this one costs 52
    // texture reads per fragment, and every marker and brush-pen composite goes
    // through the same program.
    gl.uniform1f(u.u_migrate, migratePx > 0 ? profile.migrate : 0)
    gl.uniform1f(u.u_migratePx, migratePx)
    gl.uniform1f(u.u_migrateLo, profile.migrateLo)
    gl.uniform1f(u.u_migrateHi, profile.migrateHi)
    gl.uniform1f(u.u_inkWater, 0)
    // #452 — see _drawRibbonNibPass's own comment on why this is cleared here.
    gl.uniform1f(u.u_wickPx, 0)
    gl.uniform1f(u.u_wickCap, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
    gl.enableVertexAttribArray(this.ctx.stamps().positionLoc)
    gl.vertexAttribPointer(this.ctx.stamps().positionLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, dab.angle)
    gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_tiltX, dab.tiltX)
    gl.uniform1f(u.u_tiltY, dab.tiltY)
    gl.uniform1f(u.u_opacity, dab.opacity)
    // (§17.62) The whole quad, corners included - see u_rectComposite.
    gl.uniform1f(u.u_rectComposite, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.uniform1f(u.u_rectComposite, 0)
    gl.uniform1i(u.u_inkColor, 0)

    buffer.endDraw()
  }

  initProgram(): void {
    const { gl } = this
    this._ribbonProg          = createProgram(gl, RIBBON_VERT, RIBBON_FRAG)
  }

  initUniforms(): void {
    const { gl } = this
    this._ribbonUni = getUniforms(gl, this._ribbonProg, [
      'u_wcNoiseTex', 'u_resolution', 'u_aaPx', 'u_mode', 'u_worldOrigin', 'u_mottleSeed', 'u_cloudDeposit', 'u_granDeposit', 'u_poolBlot',
      'u_washWater', 'u_waterRetain', 'u_bristleCombs', 'u_bristleInk', 'u_depthWrite', 'u_tau', 'u_availableWater', 'u_useAvailableWater',
    ])
  }

  initAttributes(): void {
    const { gl } = this
    this._ribbonPosLoc  = gl.getAttribLocation(this._ribbonProg, 'a_position')
    this._ribbonEdgeLoc = gl.getAttribLocation(this._ribbonProg, 'a_edge')
    this._ribbonInkLoc  = gl.getAttribLocation(this._ribbonProg, 'a_ink')
    this._ribbonInkWaterLoc = gl.getAttribLocation(this._ribbonProg, 'a_inkWater')
    this._ribbonAcrossLoc = gl.getAttribLocation(this._ribbonProg, 'a_across')
    this._ribbonInkWetLoc = gl.getAttribLocation(this._ribbonProg, 'a_inkWet')
    this._ribbonInkStrengthLoc = gl.getAttribLocation(this._ribbonProg, 'a_inkStrength')
    this._ribbonPuddleLoc = gl.getAttribLocation(this._ribbonProg, 'a_contact')
  }

  initBuffer(): void {
    const { gl } = this
    this._ribbonBuf  = gl.createBuffer()!
  }

  destroy(): void {
    this.gl.deleteProgram(this._ribbonProg)
    this.gl.deleteBuffer(this._ribbonBuf)
  }
}
