// (#494) The dab stamper, out of PencilEngine (seam С14 of the survey): every
// tool that lays independent round/elliptic dabs — pencil, eraser, liner,
// charcoal — goes through here. One instanced draw per tile per batch when
// ANGLE_instanced_arrays is there (#123), the original one-draw-per-dab
// uniform loop when it is not, with the same DAB_FRAG behind both.
//
// The engine's _paintDabs hands the batch over with paint() once smudge, the
// mixer and the ribbon tools have had their turn. What this needs from the
// outside is StampContext below: the GL context, whether the room is
// infinite, the page (for clamping a batch's rect), the dab quad and the
// paper the grain is read from.
//
// The plain dab program is not this class's alone: the ribbon passes
// (_drawRibbonNibPass, _drawRibbonCompositeDab) draw through it too, which
// is why its uniform list carries their uniforms and why it is exposed as
// program/uniforms/positionLoc. It lives here because the stamps are its
// first user and the list has to be built once.
//
// Both programs and the instance buffer die with the GL context and are
// rebuilt by initGL (the engine's _initGL runs it at construction and on a
// restore). The instance scratch array is plain memory and outlives a
// restore, so there is nothing to forget().

import type { Dab, ToolType } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import type { PaperRead } from '../paper/PaperState'
import { CHARCOAL_FEEL } from '../presets/charcoalFeel'
import { charcoalNibFromPreset, charcoalPresetFor, type CharcoalPreset } from '../presets/charcoalPresets'
import { LINER_WICK_PX, LINER_WICK_RADIUS_CAP, linerWickPx } from '../presets/linerPresets'
import type { PencilPreset } from '../presets/pencilPresets'
import { presetForTool } from '../presets/resolvePreset'
import { DAB_FRAG, DAB_VERT, DAB_VERT_INSTANCED } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'
import { createWatercolorNoiseTexture } from '../raster/watercolorNoise'

// Minimal surface of the ANGLE_instanced_arrays extension paintInstanced
// uses (#123) — not in lib.dom.d.ts's WebGLRenderingContext, so this is typed
// by hand instead of relying on an ambient DOM type.
interface InstancedArraysExt {
  vertexAttribDivisorANGLE(index: number, divisor: number): void
  drawArraysInstancedANGLE(mode: number, first: number, count: number, primcount: number): void
}

/** What StampPainter may ask of the engine. Functions, not values, for
 *  everything the engine replaces or changes: the quad buffer is rebuilt by
 *  its _initGL on a context restore, and the grain mode follows two dev
 *  overrides. The paper is the engine's one PaperState, held by reference:
 *  its texture and catch change inside it, read at draw time — this is the
 *  per-pointer-event path, and reading it allocates nothing new. */
export interface StampContext {
  readonly gl: WebGLRenderingContext
  readonly infinite: boolean
  /** DAB_VERT's -0.5..0.5 dab quad. */
  quadBuf(): WebGLBuffer
  /** The grain, and the sheet a bounded room's batch is clamped to. */
  readonly paper: PaperRead
  /** DAB_FRAG's u_grainMode for this draw — see resolveGrainMode. */
  grainMode(charcoal: CharcoalPreset | null): number
}

type Uniforms = Record<string, WebGLUniformLocation | null>

export class StampPainter {
  private readonly gl: WebGLRenderingContext
  private readonly ctx: StampContext

  // The plain per-dab program (DAB_VERT + DAB_FRAG) — shared with the ribbon
  // passes, see the file comment and program/uniforms/positionLoc below.
  private noiseTexture!: WebGLTexture

  private dabProg!: WebGLProgram
  private dabUni!: Uniforms
  private dabPosLoc!: number

  // Batched dab rendering (#123) — one instanced draw call per paint()
  // batch instead of one gl.drawArrays + ~9 gl.uniform* calls per dab.
  // `instanced` is null on the (today, vanishingly rare) WebGL1
  // context without ANGLE_instanced_arrays, in which case paint() falls
  // back to the original per-dab-uniform loop via dabProg/DAB_VERT
  // unchanged. See paintInstanced for the correctness reasoning re:
  // preserving sequential per-dab blend order.
  private instProg!: WebGLProgram
  private instUni!: Uniforms
  private instPosLoc!: number
  private instALoc!: number
  private instBLoc!: number
  private instOpacityLoc!: number
  private instBuf!: WebGLBuffer
  private instanced: InstancedArraysExt | null = null
  // Reused/grown scratch buffer for the per-dab instance data upload — no
  // per-stroke-segment allocation, same pattern as DabSystem's #125 fix.
  private instScratch: Float32Array = new Float32Array(0)

  constructor(ctx: StampContext) {
    this.gl = ctx.gl
    this.ctx = ctx
  }

  /** DAB_VERT + DAB_FRAG, for the ribbon passes that draw through it. */
  get program(): WebGLProgram { return this.dabProg }
  get uniforms(): Uniforms { return this.dabUni }
  get positionLoc(): number { return this.dabPosLoc }

  /** Builds both programs, the instance buffer and looks up the extension —
   *  from the engine's _initGL, at construction and on a context restore. */
  initGL(): void {
    const { gl } = this
    this.noiseTexture = createWatercolorNoiseTexture(gl)
    this.dabProg  = createProgram(gl, DAB_VERT, DAB_FRAG)
    this.instProg = createProgram(gl, DAB_VERT_INSTANCED, DAB_FRAG)

    this.dabUni = getUniforms(gl, this.dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_wcNoiseTex', 'u_resolution', 'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_eraseMode', 'u_color', 'u_grainMode', 'u_paperFillThreshold', 'u_paperFillCap', 'u_inkMode',
      'u_rectComposite',
      // Liner only (#452, ADR 003 §4) — how far past its own radius a dab's
      // quad is grown so the absorbed band has somewhere to land, and the cap
      // on that. Set to 0 by every other draw through this program (marker's
      // two passes included), not just left unset: a program's uniforms
      // persist across draws, so a liner stroke would otherwise leak its band
      // into whatever drew next.
      'u_wickPx', 'u_wickCap',
      // Charcoal only (#304, ADR 005) — per-preset, so needed by both this
      // program and the instanced one below (unlike marker's three samplers,
      // which never draw through the batched path).
      'u_charcoalTooth', 'u_charcoalCrumble', 'u_charcoalDust',
      'u_charcoalBroadAspect', 'u_charcoalBroadGrain',
      'u_charcoalPressFloor', 'u_charcoalPressGamma', 'u_charcoalSkipFloor', 'u_charcoalGateRelief', 'u_charcoalGrainDepth',
      // Ribbon tools only (#250, follow-up; #454 widened this from "marker" to
      // "marker and brush pen") — only ever set by their own draws, which
      // always use this non-instanced program; not added to instUni below
      // since nothing ever draws a ribbon stroke through it.
      'u_original', 'u_strokeCoverage', 'u_inkLoad',
      // #330 stage 2/3 — the ribbon nib's own geometry: edge ramp width in canvas
      // px, which outline the nib is, its corner radius, and how much the ink
      // eases off at the rim. #454: plus how strongly paper grain acts on a
      // ribbon tool's rim — outward for the brush pen, inward for watercolor,
      // see RibbonProfile.paperRim.
      'u_aaPx', 'u_nibShape', 'u_nibCorner', 'u_inkEdge', 'u_inkClip', 'u_paperRim', 'u_acrossLocal', 'u_paperWet', 'u_washWater', 'u_puddle', 'u_poolBlot', 'u_waterRetain', 'u_inkStrength', 'u_depthWrite', 'u_tau', 'u_inkColor', 'u_cloudDeposit', 'u_granDeposit', 'u_mottleSeed',
      // #468, ADR 011 §3 — watercolor's own four. Read by the u_inkMode=9
      // branch alone, and set to 0 by every other ribbon composite (see
      // _drawRibbonCompositeDab) rather than left unset, for the reason
      // u_wickPx above already documents: uniforms persist across draws on a
      // shared program.
      'u_wetEdge', 'u_wetEdgeRadiusPx', 'u_granulation', 'u_saturateInk', 'u_bristleCombs', 'u_bristleInk', 'u_wcDebugView',
      // #468 v2 — the wash's own geometry and coarse structure (ADR 011 §3.5-3.6).
      'u_spreadPx', 'u_cloud', 'u_fieldOffset',
      // #468 v4 — the brush model (ADR 011 §4). u_inkWater rides the ink pass;
      // the rest are read by the composite.
      'u_inkWater', 'u_water', 'u_dryContact', 'u_edgeSoft', 'u_edgeWander', 'u_strokeDir',
      'u_tideLo', 'u_tideHi',
      // #468 v5 — how covering the paint is (watercolorPigments.ts).
      'u_pigmentOpacity',
      // #468 v6 — the dab spacing, the period of the deposit's own ripple.
      'u_inkSmoothPx',
      // #468 v11 — pigment transport (ADR 011 §11).
      'u_migrate', 'u_migratePx', 'u_migrateLo', 'u_migrateHi',
    ])
    this.instUni = getUniforms(gl, this.instProg, [
      'u_wcNoiseTex', 'u_resolution', 'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_hardness', 'u_eraseMode', 'u_color', 'u_grainMode', 'u_paperFillThreshold', 'u_paperFillCap', 'u_inkMode',
      'u_wickPx', 'u_wickCap', // #452 — see dabUni's own comment
      'u_charcoalTooth', 'u_charcoalCrumble', 'u_charcoalDust',
      'u_charcoalBroadAspect', 'u_charcoalBroadGrain',
      'u_charcoalPressFloor', 'u_charcoalPressGamma', 'u_charcoalSkipFloor', 'u_charcoalGateRelief', 'u_charcoalGrainDepth',
    ])

    this.dabPosLoc      = gl.getAttribLocation(this.dabProg, 'a_position')
    this.instPosLoc     = gl.getAttribLocation(this.instProg, 'a_position')
    this.instALoc       = gl.getAttribLocation(this.instProg, 'a_instA')
    this.instBLoc       = gl.getAttribLocation(this.instProg, 'a_instB')
    this.instOpacityLoc = gl.getAttribLocation(this.instProg, 'a_opacity')

    this.instBuf = gl.createBuffer()!
    this.instanced = gl.getExtension('ANGLE_instanced_arrays') as InstancedArraysExt | null
  }

  /** Shared with the ribbon and water-front programs, like the dab program.
   * Unit seven is unused by their other inputs; WebGL1 guarantees eight. */
  bindNoise(location: WebGLUniformLocation | null): void {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE7)
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture)
    gl.uniform1i(location, 7)
    gl.activeTexture(gl.TEXTURE0)
  }

  destroy(): void {
    const { gl } = this
    gl.deleteTexture(this.noiseTexture)
    gl.deleteProgram(this.dabProg)
    gl.deleteProgram(this.instProg)
    gl.deleteBuffer(this.instBuf)
  }

  /** Paints one batch of stamp dabs into `target` — see the engine's
   *  _paintDabs for what `target` can be and why a plain AccumulationBuffer
   *  is painted at a fixed origin. */
  paint(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number],
  ): void {
    const erasing = tool === 'eraser'
    // DAB_FRAG's own u_inkMode (see its doc comment there for the full value
    // table). Resolved once here as a number rather than one boolean flag per
    // tool — #304 would otherwise have added a second `charcoalMode` boolean
    // alongside `linerMode` and threaded both through the two paint methods
    // below, which is exactly how two flags for one mutually-exclusive
    // switch drift out of sync.
    const inkMode = tool === 'liner' ? 1.0 : tool === 'charcoal' ? 5.0 : 0.0
    // Charcoal's own three extra preset fields (#304) — null for every other
    // tool, in which case the paint methods below leave their uniforms at 0
    // (never read outside DAB_FRAG's u_inkMode>4.5 branch).
    const charcoal: CharcoalPreset | null = tool === 'charcoal' ? charcoalPresetFor(presetName) : null
    // #501: the aspect DAB_FRAG reads as "fully on its broad side", and 0 for a
    // draw where elongation means nothing of the kind — every non-charcoal
    // tool, as before, and now also charcoal's own chisel, whose 4:1 is the cut
    // of the nib rather than a stick laid over. The shader already treats
    // anything <= 1 as broadness 0, which is the hook this rides; the CPU side
    // zeroes the same term in bakeDabOpacity, and the two must agree.
    const broadAspect = charcoal !== null && charcoalNibFromPreset(presetName) !== 'chisel'
      ? CHARCOAL_FEEL.aspectMax
      : 0
    const preset  = presetForTool(tool, presetName)
    // #452 (ADR 003 §4): only the liner's dabs are grown past their own radius
    // to hold the band of ink absorbed into the paper around the mark. Derived
    // from `tool` alone rather than passed in by the caller, deliberately —
    // see linerPresets.ts's note under linerWickPx on what happened to the
    // version of this that carried a live per-draw multiplier.
    const wicking = tool === 'liner'
    const worldBounds = this.worldBounds(dabs, erasing, preset, wicking)
    const targets: PaintTarget[] = target instanceof AccumulationBuffer
      ? [{ buffer: target, originX: 0, originY: 0, contentRect: null }]
      : target.resolveForPaint(worldBounds)

    for (const { buffer, originX, originY } of targets) {
      // A stroke's dab batch is resolved against every tile its *union*
      // bounding box overlaps (resolveForPaint), but an individual dab
      // rarely overlaps every one of those tiles itself — e.g. an infinite
      // room's tile grid is rooted at world (0,0), exactly where the
      // default camera centers the visible page, so ordinary drawing near
      // the middle routinely resolves 2-4 tiles at once even though any
      // given ~8px dab only ever lands in one of them. Before this filter,
      // every target got the *entire* batch re-uploaded and redrawn
      // (`paintInstanced`'s bufferData + drawArraysInstancedANGLE),
      // regardless of overlap — harmless for final pixels (dabs outside a
      // tile's viewport just get clipped by the rasterizer) but multiplied
      // real GPU submission cost by the tile count on every pointermove.
      // Skipped for the single-target case (the overwhelming common case:
      // every bounded room, and most infinite strokes) to avoid the filter
      // allocation on the hot path where it can only ever keep everything.
      const tileDabs = targets.length === 1 ? dabs : dabs.filter(d => {
        const { hx, hy } = dabWorldHalfExtents(d, erasing, preset, wicking)
        return d.x + hx > originX && d.x - hx < originX + buffer.width &&
               d.y + hy > originY && d.y - hy < originY + buffer.height
      })
      if (!tileDabs.length) continue

      if (erasing) buffer.beginErase()
      else buffer.beginDraw()

      // #123: batch every dab in this call into one instanced draw call when
      // the extension is available (effectively always, in practice) — see
      // paintInstanced's docstring for why this preserves the exact
      // sequential per-dab blend order the fallback loop below relies on.
      if (this.instanced) {
        this.paintInstanced(tileDabs, erasing, inkMode, charcoal, broadAspect, preset, color, buffer.width, buffer.height, originX, originY, wicking)
      } else {
        this.paintUniform(tileDabs, erasing, inkMode, charcoal, broadAspect, preset, color, buffer.width, buffer.height, originX, originY, wicking)
      }

      buffer.endDraw()
    }
    // (#155 Tier 2) A plain AccumulationBuffer (live-tip/prediction/peer
    // reveal) is transient/visual-only and never queried for content bounds
    // — nothing to track. A real ILayerBuffer target tracks it so
    // getContentBounds() never has to fall back to a readPixels scan.
    if (!(target instanceof AccumulationBuffer)) target.markContentPainted(worldBounds)
  }

  /** Conservative world-space AABB covering every dab's full painted extent
   *  (center +/- radius, padded for aspect ratio so an elongated/rotated
   *  dab is never under-covered) — the rect whose overlapping tile(s) this
   *  batch must be resolved against.
   *
   *  #142: clamped to the visible page for a bounded room (never for an
   *  infinite one). A bounded room's tile size is its own canvas size (see
   *  the engine's _makeLayerBuffer), so an *unclamped* rect here would resolve — and
   *  lazily create — a whole extra full-page-sized adjacent tile for every
   *  ordinary stroke whose brush radius merely overlaps the page edge by a
   *  few pixels (extremely common: any stroke drawn near the border), each
   *  one wasted memory that can never become visible again through normal
   *  use. Real, deliberate off-page content only ever gets there through a
   *  layer_transform (AreaOps.bakeLayerTransform/previewLayerTransform, both compute
   *  their own unclamped rect straight from the transformed content's
   *  actual bounds, independent of this method) — clamping here doesn't
   *  lose anything a user could otherwise reach: pointer input can't even
   *  put a dab's *center* past the visible canvas element's own edge,
   *  same as a real sheet of paper — ink can bleed to the very edge, not
   *  past it. */
  private worldBounds(dabs: Dab[], erasing: boolean, preset: PencilPreset, wicking = false): WorldRect {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of dabs) {
      const { hx, hy } = dabWorldHalfExtents(d, erasing, preset, wicking)
      minX = Math.min(minX, d.x - hx); maxX = Math.max(maxX, d.x + hx)
      minY = Math.min(minY, d.y - hy); maxY = Math.max(maxY, d.y + hy)
    }
    if (this.ctx.infinite) return { minX, minY, maxX, maxY }
    // (#470) The *sheet*, not the canvas. These were the same number while the
    // canvas was the sheet; once it became the viewport this clamped every
    // stroke to the window's own size, so on a 4096 page nothing below the
    // window's height painted at all — the dab's rect came back empty and no
    // tile was ever resolved.
    const { w: pageW, h: pageH } = this.ctx.paper.pageSize()
    return {
      minX: Math.max(minX, 0), minY: Math.max(minY, 0),
      maxX: Math.min(maxX, pageW), maxY: Math.min(maxY, pageH),
    }
  }

  /** Fallback path for a WebGL1 context without ANGLE_instanced_arrays: one
   *  gl.drawArrays + ~9 gl.uniform* calls per dab, kept exactly as it was
   *  before #123 (same shader math via DAB_VERT, same GL call count/order) —
   *  the safety net on the rare device that lacks the extension.
   *  `resW/resH` is the actual target buffer's size (bounded: canvas size,
   *  same as before; tiled: one tile's TILE_SIZE) and `originX/originY`
   *  translates each dab's world-space center into that buffer's local
   *  space (bounded: always (0,0), so this is a no-op there). */
  private paintUniform(
    dabs: Dab[], erasing: boolean, inkMode: number, charcoal: CharcoalPreset | null,
    broadAspect: number, preset: PencilPreset, color: [number, number, number],
    resW: number, resH: number, originX: number, originY: number, wicking: boolean,
  ): void {
    const { gl } = this
    gl.useProgram(this.dabProg)
    this.bindNoise(this.dabUni.u_wcNoiseTex)
    const u = this.dabUni

    gl.uniform2f(u.u_resolution, resW, resH)
    const paper = this.ctx.paper
    gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
    // #141: world-space paper sampling — see DAB_FRAG's own comment. Y is
    // negated (defensively normalized away from -0 with `|| 0`, since
    // JSON/toEqual-style equality checks — see this fix's own tests — can
    // otherwise trip on -0 !== 0): DAB_VERT's own clip.y flip means a
    // dab-buffer's local gl_FragCoord.y runs opposite to the tile origin's
    // top-down world-Y convention, so origin must be *subtracted* (not
    // added) there for the two to agree at every shared tile edge — see
    // this fix's own tests for the boundary derivation. originX/Y are
    // always (0,0) for a bounded room, so this is (0,0) there regardless.
    const { w: paperTexW, h: paperTexH } = paper.worldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperOrigin, originX, -originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, paper.texture)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)
    gl.uniform3fv(u.u_color, color)
    gl.uniform1i(u.u_grainMode, this.ctx.grainMode(charcoal))
    gl.uniform1f(u.u_paperFillThreshold, paper.fillThreshold)
    gl.uniform1f(u.u_paperFillCap, paper.fillCap)
    gl.uniform1f(u.u_inkMode, inkMode)
    // #452: the shader applies the cap itself, per dab, because only it knows
    // each dab's own radius on the batched path — these two carry the rule,
    // linerWickPx() states the same one CPU-side for the dirty rect, and they
    // must not drift. Both 0 for a non-liner draw, which makes the shader's
    // wickExpand() return exactly 1.0 and this whole path a no-op.
    gl.uniform1f(u.u_wickPx,  wicking ? LINER_WICK_PX : 0)
    gl.uniform1f(u.u_wickCap, wicking ? LINER_WICK_RADIUS_CAP : 0)
    gl.uniform1f(u.u_charcoalTooth,   charcoal?.tooth   ?? 0)
    gl.uniform1f(u.u_charcoalCrumble, charcoal?.crumble ?? 0)
    gl.uniform1f(u.u_charcoalDust,    charcoal?.dust    ?? 0)
    // #305: read live off CHARCOAL_FEEL (the debug overlay mutates it in
    // place), not captured once — same reason CHARCOAL_DAB_SHAPING's own
    // tiltSmoothing is a getter. Still true of broadAspect, which the caller
    // reads off the same live object one draw earlier (#501).
    gl.uniform1f(u.u_charcoalBroadAspect, broadAspect)
    gl.uniform1f(u.u_charcoalBroadGrain,  charcoal ? CHARCOAL_FEEL.broadGrainBoost : 0)
    gl.uniform1f(u.u_charcoalPressFloor,  charcoal ? CHARCOAL_FEEL.pressureFloor : 0)
    gl.uniform1f(u.u_charcoalPressGamma,  charcoal ? CHARCOAL_FEEL.pressureGamma : 1)
    gl.uniform1f(u.u_charcoalSkipFloor,   charcoal ? CHARCOAL_FEEL.skipFloor : 1)
    gl.uniform1f(u.u_charcoalGateRelief,  charcoal ? CHARCOAL_FEEL.gateRelief : 0)
    gl.uniform1f(u.u_charcoalGrainDepth,  charcoal ? CHARCOAL_FEEL.grainDepth : 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
    const posLoc = this.dabPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const dab of dabs) {
      gl.uniform2f(u.u_dabCenter, dab.x - originX, dab.y - originY)
      gl.uniform1f(u.u_dabRadius, dab.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier))
      gl.uniform1f(u.u_angle,      dab.angle)
      gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
      gl.uniform1f(u.u_pressure,   dab.pressure)
      gl.uniform1f(u.u_tiltX,      dab.tiltX)
      gl.uniform1f(u.u_tiltY,      dab.tiltY)
      gl.uniform1f(u.u_opacity,    dab.opacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
  }

  /** Batched hot path (#123): one interleaved instance-data upload + one
   *  drawArraysInstancedANGLE call per paint() batch, replacing what
   *  used to be one gl.drawArrays + ~9 gl.uniform* calls PER DAB (a fast/long
   *  stroke can produce dozens of dabs from a single move-event).
   *
   *  Correctness constraint this must preserve exactly: dabs are NOT
   *  independent/order-insensitive when they overlap — e.g. an eraser dab
   *  must still correctly interact with ink laid down by an earlier dab in
   *  the same batch. AccumulationBuffer.beginDraw()/beginErase() blend every
   *  dab draw call (ONE, ONE_MINUS_SRC_ALPHA or ZERO, ONE_MINUS_SRC_ALPHA)
   *  onto the accumulation of every previous one, so the per-dab paint order
   *  is directly observable in the resulting pixels. ANGLE_instanced_arrays
   *  processes instance 0, 1, 2, ... in strict submission order through the
   *  same fixed-function blend stage a sequence of separate draw calls
   *  would use — this is the same ordering guarantee every sorted-
   *  transparency instancing technique (particle systems, decal stacks)
   *  already depends on, so batching here doesn't change the accumulated
   *  result. The fragment shader itself is completely unchanged (DAB_FRAG is
   *  shared with the uniform path) — only how each dab's parameters reach
   *  the shader changed, from one gl.uniform* call per dab to one instanced
   *  vertex attribute read per dab out of a single buffer uploaded once. */
  private paintInstanced(
    dabs: Dab[], erasing: boolean, inkMode: number, charcoal: CharcoalPreset | null,
    broadAspect: number, preset: PencilPreset, color: [number, number, number],
    resW: number, resH: number, originX: number, originY: number, wicking: boolean,
  ): void {
    const { gl } = this
    const ext = this.instanced
    if (!ext) return // only called when present; guards the type narrowing below
    const u = this.instUni

    gl.useProgram(this.instProg)
    this.bindNoise(this.instUni.u_wcNoiseTex)
    gl.uniform2f(u.u_resolution, resW, resH)
    const paper = this.ctx.paper
    gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
    // #141: see paintUniform's own comment for the world-space-paper /
    // origin-sign reasoning — identical here, just for the batched path.
    const { w: paperTexW, h: paperTexH } = paper.worldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperOrigin, originX, -originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, paper.texture)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)
    gl.uniform3fv(u.u_color, color)
    gl.uniform1i(u.u_grainMode, this.ctx.grainMode(charcoal))
    gl.uniform1f(u.u_paperFillThreshold, paper.fillThreshold)
    gl.uniform1f(u.u_paperFillCap, paper.fillCap)
    gl.uniform1f(u.u_inkMode, inkMode)
    // #452: the shader applies the cap itself, per dab, because only it knows
    // each dab's own radius on the batched path — these two carry the rule,
    // linerWickPx() states the same one CPU-side for the dirty rect, and they
    // must not drift. Both 0 for a non-liner draw, which makes the shader's
    // wickExpand() return exactly 1.0 and this whole path a no-op.
    gl.uniform1f(u.u_wickPx,  wicking ? LINER_WICK_PX : 0)
    gl.uniform1f(u.u_wickCap, wicking ? LINER_WICK_RADIUS_CAP : 0)
    gl.uniform1f(u.u_charcoalTooth,   charcoal?.tooth   ?? 0)
    gl.uniform1f(u.u_charcoalCrumble, charcoal?.crumble ?? 0)
    gl.uniform1f(u.u_charcoalDust,    charcoal?.dust    ?? 0)
    // #305: read live off CHARCOAL_FEEL (the debug overlay mutates it in
    // place), not captured once — same reason CHARCOAL_DAB_SHAPING's own
    // tiltSmoothing is a getter. Still true of broadAspect, which the caller
    // reads off the same live object one draw earlier (#501).
    gl.uniform1f(u.u_charcoalBroadAspect, broadAspect)
    gl.uniform1f(u.u_charcoalBroadGrain,  charcoal ? CHARCOAL_FEEL.broadGrainBoost : 0)
    gl.uniform1f(u.u_charcoalPressFloor,  charcoal ? CHARCOAL_FEEL.pressureFloor : 0)
    gl.uniform1f(u.u_charcoalPressGamma,  charcoal ? CHARCOAL_FEEL.pressureGamma : 1)
    gl.uniform1f(u.u_charcoalSkipFloor,   charcoal ? CHARCOAL_FEEL.skipFloor : 1)
    gl.uniform1f(u.u_charcoalGateRelief,  charcoal ? CHARCOAL_FEEL.gateRelief : 0)
    gl.uniform1f(u.u_charcoalGrainDepth,  charcoal ? CHARCOAL_FEEL.grainDepth : 0)

    // Shared unit quad, divisor 0 — same 6 vertices/2 triangles per instance
    // as the uniform path's per-dab quad.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
    gl.enableVertexAttribArray(this.instPosLoc)
    gl.vertexAttribPointer(this.instPosLoc, 2, gl.FLOAT, false, 0, 0)
    ext.vertexAttribDivisorANGLE(this.instPosLoc, 0)

    // Interleaved per-dab instance data — stride 9 floats:
    // [cx, cy, radius, angle, aspectRatio, pressure, tiltX, tiltY, opacity].
    // Packed into 2 vec4 + 1 float attributes (see DAB_VERT_INSTANCED) to
    // stay well within WebGL1's guaranteed minimum of 8 vertex attributes.
    // Reused/grown scratch array — no per-stroke-segment allocation.
    const STRIDE = 9
    const need = dabs.length * STRIDE
    if (this.instScratch.length < need) {
      this.instScratch = new Float32Array(Math.max(need, this.instScratch.length * 2, 256))
    }
    const data = this.instScratch
    for (let i = 0; i < dabs.length; i++) {
      const d = dabs[i]
      const o = i * STRIDE
      data[o + 0] = d.x - originX
      data[o + 1] = d.y - originY
      data[o + 2] = d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)
      data[o + 3] = d.angle
      data[o + 4] = d.aspectRatio
      data[o + 5] = d.pressure
      data[o + 6] = d.tiltX
      data[o + 7] = d.tiltY
      data[o + 8] = d.opacity
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, need), gl.DYNAMIC_DRAW)

    const STRIDE_BYTES = STRIDE * 4
    gl.enableVertexAttribArray(this.instALoc)
    gl.vertexAttribPointer(this.instALoc, 4, gl.FLOAT, false, STRIDE_BYTES, 0)
    ext.vertexAttribDivisorANGLE(this.instALoc, 1)

    gl.enableVertexAttribArray(this.instBLoc)
    gl.vertexAttribPointer(this.instBLoc, 4, gl.FLOAT, false, STRIDE_BYTES, 16)
    ext.vertexAttribDivisorANGLE(this.instBLoc, 1)

    gl.enableVertexAttribArray(this.instOpacityLoc)
    gl.vertexAttribPointer(this.instOpacityLoc, 1, gl.FLOAT, false, STRIDE_BYTES, 32)
    ext.vertexAttribDivisorANGLE(this.instOpacityLoc, 1)

    ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, dabs.length)

    // Defensive: divisor state belongs to WebGL1's one implicit vertex array
    // (global, not per-program) — reset before any other program potentially
    // reuses these location indices, so a leftover divisor=1 can never
    // silently collapse an unrelated draw call onto a single instance.
    ext.vertexAttribDivisorANGLE(this.instALoc, 0)
    ext.vertexAttribDivisorANGLE(this.instBLoc, 0)
    ext.vertexAttribDivisorANGLE(this.instOpacityLoc, 0)
  }

}

/** One dab's exact world-space half-extents (an axis-aligned box around
 *  everything that dab can possibly rasterize) — the same per-dab quantity
 *  StampPainter's `worldBounds` unions across a whole batch, factored out so
 *  `paint`'s per-tile filter (see its own comment) and marker's own
 *  per-batch tile resolution (the engine's _ribbonStrokeWork) can apply it to one dab at
 *  a time without duplicating the math.
 *
 *  Derived straight from DAB_VERT/DAB_VERT_INSTANCED's own geometry, which
 *  is the true clipping envelope no matter what DAB_FRAG's `discard` does
 *  inside it: the unit quad spans ±0.5, gets stretched by `aspectRatio`
 *  along local X, rotated by `angle`, then scaled by `dabRadius * 2` — so
 *  the footprint is a rotated rectangle with half-extents
 *  (aspectRatio * baseR, baseR), whose AABB is what's computed below.
 *
 *  This used to pad by `max(1, 1/aspectRatio)` instead, i.e. it padded for
 *  the one direction aspect *doesn't* stretch in and ignored the one it
 *  does. Harmless while aspectRatio was pencil/liner-only (1..1.15, a few
 *  px of under-padding at most), but marker's chisel nib is a fixed 5:1
 *  (MARKER_CHISEL_ASPECT_RATIO) at up to 120px width: a dab whose center
 *  sat 60-300px from a tile boundary resolved only its own tile, so the
 *  rest of the nib mark was clipped away by that tile's viewport and the
 *  stroke visibly broke off along the tile edge (and, because the missing
 *  side never accumulated into `coverage`/`inkLoad` either, resumed at a
 *  different darkness on the far side once a later dab's center crossed
 *  over). */
export function dabWorldHalfExtents(
  d: Dab, erasing: boolean, preset: PencilPreset, wicking = false,
): { hx: number; hy: number } {
  const baseR = d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)
  // #452: the liner's absorbed band lives *outside* baseR, so it has to be
  // padded in here too — this box picks which tiles a batch resolves and
  // which rect gets marked dirty, and a band left out of it is a halo
  // sheared off at a tile boundary (exactly the failure #330 hit with the
  // chisel nib, described in this function's own doc comment above). Same
  // absolute-with-a-cap rule the vertex shader applies per dab
  // (WICK_EXPAND_GLSL); linerWickPx is the single statement of it, so the
  // two can't drift apart. 0 for every other tool.
  const r = baseR + (wicking ? linerWickPx(baseR) : 0)
  // Rotated-rect AABB, not a `baseR * aspectRatio` circle: a 5:1 chisel dab
  // is long *along the nib only*, and inflating the short axis to match
  // would resolve (and so lazily create — 4MB each) whole tiles the dab
  // never actually reaches.
  const halfLong = r * Math.max(1, d.aspectRatio)
  const c = Math.abs(Math.cos(d.angle)), s = Math.abs(Math.sin(d.angle))
  return { hx: halfLong * c + r * s, hy: halfLong * s + r * c }
}
