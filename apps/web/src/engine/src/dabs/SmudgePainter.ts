import{GridCellBatch}from'./GridCellBatch'
import{gridCells}from'../presets/brushGrid'
import {CanvasProjectionSampler,type ProjectionReadSession,type ProjectionSampleLayer} from '../raster/CanvasProjectionSampler'
import {COLOR_SMUDGE_MATERIAL_FRAG} from '../raster/colorSmudgeMaterialShader'
import { COLOR_SMUDGE_MEAN_FRAG } from '../raster/colorSmudgeMeanShader'
import { assertBrushSourceInputs, assertBrushExecutionContext, assertSameBrushExecutionContext, type BrushExecutionContext } from '../presets/brushExecutionContext'
import { brushTipSamplerId, brushTipProfileUniforms } from './BrushPreparation'
import { brushAlphaThresholdValue } from '../presets/brushAlphaThreshold'
import { smearPlacement, smearSourceShift, type SmearPlacement } from './SmearPlacement'
import { nativeImageResource, nativeImagePixels, nativeImageDomain, nativeImageDomainUniform, nativeImageUVShift, type NativeImageResource } from './NativeImageBank'
import { BrushMipCache } from './BrushMipCache'
import { importedAssetPixels } from '../presets/importedBrushes'
import { proceduralSampleCount } from '../raster/brushProcedural'
import { canvasMeanDabRect, canvasMeanPlacedCenter, canvasMeanSourceRect } from '../raster/canvasMeanGeometry'
import { brushTextureApplication } from './brushTextureApplication'
import { bindBrushGradient,assertNativeImageAdmission, brushPreparationResources, brushTextureLeasePlan, brushTextureResourceKey, type BrushPreparationResource } from './BrushPreparation'
// (#494) Smudge and the digital brush's mixer, out of PencilEngine (seam С15
// of the survey). Both paint through one carried imprint per user: every dab
// copies the canvas patch under it, refreshes the imprint from that patch
// (SMUDGE_PICKUP_FRAG) and lays the imprint back down as a per-pixel lerp
// (SMUDGE_TRANSFER_FRAG). The mixer is the same machine with a colour loaded
// into the imprint — see MixerPaint.
//
// The engine's _paintDabs hands dabs over with paint(); nothing else comes
// in. What it has to know from the outside is only SmudgeContext below: the
// GL context, the two quad buffers and the paper the deposit catches on.
// Going out, the engine calls dropReplayChunks when a layer is rebuilt,
// initGL from its own _initGL, forget on a context loss and destroy.
//
// Two lifetimes live here. The programs die with the GL context and are
// rebuilt by initGL (the engine's _initGL runs it at construction and again
// on a restore). The pool, the imprints and the replay chunks outlive a
// restore as objects; forget() drops what they hold, because every GL name
// in them is dead.

import { BrushTextureCache, uploadBrushTexture } from './BrushTextureCache'
import { brushFootprintBounds } from './brushFootprint'
import { brushForegroundRate,sampleBrushGradient,brushSamplesCanvas, BRUSH_BLEND_MODES, type Dab } from '@grafetto/shared'
import type { BrushDescriptor } from '@grafetto/shared'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import { ScratchFreeList } from '../buffers/scratchPools'
import type { WorldRect } from '../buffers/tileMath'
import type { PaperSampling } from '../paper/PaperState'
import { brushDabRandom, brushDabSeed, curveAt, type MixerPaint } from '../presets/digitalBrushPresets'
import { smudgeGrainRelief } from '../presets/smudgeGrain'
import { DAB_VERT, DISPLAY_VERT } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'

import { WET_PICKUP_FRAG, WET_TRANSFER_FRAG, wetTransferFragment, CANVAS_MEAN_FRAG } from '../raster/wetMixShaders'
import { advanceBrushAnimation, beginBrushBehavior, brushDynamicValue, behaviorStampsForDab, secondaryBrushDabs, type BrushBehaviorState, type BehaviorStamp } from '../presets/brushBehavior'
import { colorSmudgeGradientTipPixels,colorSmudgeTipPixels } from '../presets/colorSmudgeTip'
import { colorSmudgeRates } from '../presets/colorSmudge'
import { wetMixStep, type WetMixStep, type WetMixState } from '../presets/wetMix'
import { tipMaskMips, brushTextureMips, type TipMaskId, type BrushTextureId } from '../presets/tipMasks'

interface WetGesture extends WetMixState { behavior: BrushBehaviorState; secondary?: RibbonStrokeScratch; previousPlaced?: { x: number; y: number }; previousMeanPlaced?: {x:number;y:number} }
type SmudgeLayer=Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'> & {resolveForRead?(rect:WorldRect):PaintTarget[];materialOwner?(color:AccumulationBuffer):PaintTarget|undefined}
interface WetStamp { gradientLut?:string;foregroundAlpha?:number; projection?:readonly ProjectionSampleLayer[]; coverageBuffer?:AccumulationBuffer; thickness?:number; maskScale?: number; maskSourceDab?: Dab; smearPlacement?: SmearPlacement; samplingRadius?: number; foregroundRate?: number; secondary?: ReturnType<RibbonStrokeScratch['brushSecondary']>; seed: number; stamp: BehaviorStamp; step: WetMixStep; paint: MixerPaint }

// Smudge (#14) tuning constants — picked by eye, not exposed as settings
// (the tool's user-facing knobs are just size/pressure/strength, reusing the
// existing dab fields — see toolSchemas.ts's smudge entry and
// bakeDabOpacity's own smudge branch). See paintOneDab for how each
// is used, and SMUDGE_TRANSFER_FRAG's own file comment in shaders.ts for the
// algorithm they tune: as of #416 the stump carries a raster imprint of what
// it picked up, and every dab is a per-pixel lerp of the canvas toward that
// imprint.
//
// Dab radius relative to Dab.size — matches pencil's own sizeMultiplier
// scale (see PENCIL_PRESETS) rather than a from-scratch tuning.
const SMUDGE_SIZE_MULTIPLIER = 1.0
// Fixed edge softness (DAB_FRAG/SMUDGE_TRANSFER_FRAG's u_hardness) — smudge
// has no per-grade preset the way pencil does to pull this from.
const SMUDGE_HARDNESS = 0.5
// Scratch-patch size rounding, in px — a smudge stroke normally keeps a
// constant brush size, so rounding to a coarse grid here means every dab
// after the first reuses the same pooled buffers (the copied patch and,
// since #416, the carried imprint, which is sized to match it) instead of
// reallocating.
const SMUDGE_PATCH_GRANULARITY = 8
// Hard ceiling on the scratch patch's own side length, regardless of how
// large a brush size requests — bounds a single dab's worst-case GPU
// texture allocation.
const SMUDGE_MAX_PATCH_SIZE = 512
// 64 exact patch sizes otherwise retain about 65 MiB after pressure sweeps.
// Limit idle storage only; the active pickup/patch/imprint are never evicted.
const SMUDGE_IDLE_SCRATCH_BYTES = 16 * 1024 * 1024
// How much of the carried imprint one dab refreshes from the canvas under
// it, per brush radius travelled (see `travel` in paintOneDab — both
// rates are scaled that way so what a stroke leaves behind depends on how
// far it went, not on how many samples the tablet happened to report along
// the way, the same report-rate independence #303 established for graphite
// deposition). This is also what bounds how far graphite is dragged: the
// imprint's own content decays by (1 - rate) per dab, so a lower value
// smears further and a higher one keeps the blend local.
const SMUDGE_PICKUP_RATE = 0.5
// The lerp weight one dab applies at its own center, per brush radius
// travelled, before the pressure / Strength-slider / shape / paper-catch
// weighting SMUDGE_TRANSFER_FRAG applies per fragment. Above 1 because
// every one of those terms is a fraction in practice (default Strength is
// 0.6, pen pressure rarely sits at full) — at the shipped defaults this
// lands near 0.35 at a dab's own center.
const SMUDGE_DEPOSIT_RATE = 2.0

/** #573 — how much of the mixer brush's own colour its imprint holds on the
 *  gesture's first dab. Not 1: a brush touching down on wet paint picks a
 *  little of it up at once, which is what makes a stroke that starts inside
 *  another colour start *mixed* rather than as a clean patch of its own. */
const MIXER_PRIME_LOAD = 0.85

/** What SmudgePainter may ask of the engine. Functions, not values, for
 *  everything the engine replaces: both quad buffers are rebuilt by its
 *  _initGL on a context restore. The paper is the engine's one PaperState,
 *  held by reference — its texture and catch change inside it. */
export interface SmudgeContext {
  openProjection?(source:NonNullable<BrushExecutionContext['brushSource']>,target:ILayerBuffer):ProjectionReadSession

  readonly brushMipCache?: BrushMipCache
  createBrushScratch(): RibbonStrokeScratch
  paintBrushMask(target:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>,dabs:Dab[],brush:BrushDescriptor,pressure:boolean,scratch:RibbonStrokeScratch,sizeMultiplier:number,execution?:BrushExecutionContext):void
  readonly gl: WebGLRenderingContext
  /** DAB_VERT's -0.5..0.5 dab quad. */
  quadBuf(): WebGLBuffer
  /** DISPLAY_VERT's -1..1 full-screen quad. */
  screenBuf(): WebGLBuffer
  /** The paper a smudge deposit catches on — the same world-space sampling
   *  every other dab shader uses. */
  readonly paper: PaperSampling
}

/** The one gesture that must keep its carried state through a rebuild —
 *  see dropReplayChunks. */
export interface LiveGesture {
  userId: string
  strokeId: string | null
}

function clampNum(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

type Uniforms = Record<string, WebGLUniformLocation | null>

const TRANSFER_UNIFORMS = [
  'u_textureApplication', 'u_textureMapping', 'u_dualTextureApplication', 'u_dualTextureMapping', 'u_dualGrain',
  'u_dualGrainStrength', 'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
  'u_resolution', 'u_alphaThreshold', 'u_dualAlphaThreshold', 'u_tipBounds', 'u_dualBounds',
  'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize', 'u_hardness',
  'u_carried', 'u_patchOrigin', 'u_patchSize', 'u_mode', 'u_grainRelief',
  'u_strength', 'u_pressure', 'u_paperFillThreshold', 'u_paperFillCap', 'u_previousCanvasForeground',
  'u_previousCanvas', 'u_colorSmudge', 'u_colorSmudgeTip', 'u_edgeBleed', 'u_wetEnabled', 'u_tipKind', 'u_tip',
  'u_wetGrain', 'u_grainStrength', 'u_grainPeriod', 'u_grainTransform', 'u_grainTone',
  'u_wetRoundPhase', 'u_wetWorldOrigin', 'u_flip', 'u_grainBlend', 'u_dual',
  'u_dualKind', 'u_dualBlend', 'u_dualTransform', 'u_wetOriginal', 'u_wetRender',
  'u_wetBlend', 'u_burntBlend', 'u_wetGamma', 'u_secondaryCoverage', 'u_secondaryEnabled',
]

export class SmudgePainter {
  private gridBatch?:GridCellBatch
  prepareGrid():void{(this.gridBatch??=new GridCellBatch(this.gl)).prepare()}
  private readonly gl: WebGLRenderingContext
  private readonly ctx: SmudgeContext

  // Smudge scratch patches (#14) — a small size-keyed free list, same
  // pooling shape as AreaOps' scratchPool (see
  // acquireScratch/releaseScratch), kept deliberately
  // separate from it rather than sharing it. Until #416 the reason was
  // filtering: transform's scratch buffers are LINEAR (its resample relies
  // on that) and smudge's patches were NEAREST (see AccumulationBuffer's own
  // 'nearest' filter comment). Since #416 smudge's are LINEAR too — the
  // imprint is resampled through SMUDGE_PICKUP_FRAG's normalized uv when the
  // brush size changes — so the two pools now differ only in who owns them;
  // merging them is a separate change, not part of moving this code.
  private readonly scratchPool: ScratchFreeList<AccumulationBuffer>

  // Smudge's own carried imprint (#14; a raster texture per user since
  // #416 — see SMUDGE_TRANSFER_FRAG's own file comment for what replaced the
  // single carried scalar and why), keyed by userId — "the tool belongs to
  // whoever's holding it": two users smudging at the same time in the same
  // room must never share one imprint (an earlier, single-scalar version of
  // this field could get clobbered mid-stroke by a remote peer's own smudge
  // operation arriving through the same paint path).
  //
  // `buf` is the imprint itself: premultiplied RGBA covering the dab's own
  // patch square, always the same side length as the patch this stroke
  // copies (so it is pooled through acquireScratch alongside the
  // patches themselves, and a stroke that changes brush size resamples it
  // through SMUDGE_PICKUP_FRAG's own normalized uv rather than needing a
  // separate resize path). Null means "not primed yet" — the next dab
  // copies the canvas under it wholesale instead of blending toward it, so
  // a stroke never starts by laying a faded ghost of nothing over the
  // canvas.
  //
  // `strokeId` is which gesture that imprint belongs to. A stump does not
  // carry an imprint between gestures the way the old scalar carried a
  // level: an imprint is *positional*, so re-using one across a pen-up
  // would stamp a ghost of the previous stroke's content wherever the next
  // one happens to start. Resetting at every gesture is also what makes a
  // recorded operation self-sufficient again — replay reproduces a smudge
  // stroke from its own dabs alone, with no cross-operation state to carry,
  // which is why StrokeOperation.smudgeLoadAtStart/End stopped being
  // written (see that field's own comment in packages/shared).
  private readonly imprints = new Map<string, { buf: AccumulationBuffer | null; strokeId: string | null }>()
  // The dab a replayed chunk should treat as its predecessor, per user: a
  // gesture long enough to be split across several operations (see
  // the engine's _flushStrokeChunk) must not restart its imprint at every chunk
  // boundary, and the later chunks arrive with no prevDab of their own.
  // Keyed by user (unlike marker's single _replayRibbonChunk slot) because
  // smudge state is per-user by construction — two peers' chunked strokes
  // interleaving in the log would otherwise each reset the other.
  private readonly wetGestures = new Map<string, WetGesture>()
  private readonly projectionSampler:CanvasProjectionSampler
  private readonly wetTextures: BrushTextureCache
  private readonly imageMips: BrushMipCache
  private readonly ownsMipCache: boolean
  private maximumImageSide?: number
  private materialProjection?: {program:WebGLProgram;uniforms:Uniforms;position:number}
  private colorSmudgeTransfer?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private curveTransfer?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private imageTransfer?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private readonly replayChunks = new Map<string, { strokeId: string; lastDab: Dab;target?:ILayerBuffer }>()

  // Smudge (#14) — paired with the existing DAB_VERT (see SMUDGE_TRANSFER_
  // FRAG's own doc comment for why it never uses DAB_VERT_INSTANCED).
  private proceduralTransfer?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private transferProg!: WebGLProgram
  // The imprint-refresh pass (#416) — paired with DISPLAY_VERT (a plain
  // full-screen quad over the imprint texture; it needs no dab-quad
  // geometry, only the patch's own normalized square) rather than DAB_VERT.
  private pickupProg!: WebGLProgram
  private colorMean?: {program:WebGLProgram;uniforms:Uniforms;position:number}
  private meanProg!: WebGLProgram
  private meanUni: Uniforms = {}
  private meanPosLoc = -1
  private transferUni: Uniforms = {}
  private pickupUni: Uniforms = {}
  // Attribute locations are per-*program*, not per-shader-source — even
  // though transferProg shares DAB_VERT's exact source with the engine's _dabProg, it's a
  // separately linked program, so 'a_position' can land at a different
  // location number in it and _dabPosLoc must not be reused here.
  private transferPosLoc = -1
  private pickupPosLoc = -1

  constructor(ctx: SmudgeContext) {
    this.ctx = ctx
    this.gl = ctx.gl
    this.projectionSampler=new CanvasProjectionSampler(ctx.gl,()=>ctx.screenBuf())
    this.wetTextures = new BrushTextureCache(ctx.gl)
    this.imageMips = ctx.brushMipCache ?? new BrushMipCache()
    this.ownsMipCache = !ctx.brushMipCache
    const { gl } = ctx
    this.scratchPool = new ScratchFreeList((w, h) => new AccumulationBuffer(gl, w, h, 'linear'), SMUDGE_IDLE_SCRATCH_BYTES)
  }

  /** Builds both programs — from the engine's _initGL, at construction and
   *  again on every context restore (the old names died with the context). */
  initGL(): void {
    this.gridBatch?.reset()
    this.projectionSampler.forget()
    this.maximumImageSide = undefined
    this.wetTextures.clear(true)
    this.proceduralTransfer = undefined
    this.colorMean = undefined
    this.colorSmudgeTransfer = undefined
    this.materialProjection = undefined
    this.curveTransfer = undefined
    this.imageTransfer = undefined
    const { gl } = this
    this.transferProg = createProgram(gl, DAB_VERT, WET_TRANSFER_FRAG)
    this.pickupProg   = createProgram(gl, DISPLAY_VERT, WET_PICKUP_FRAG)
    this.meanProg = createProgram(gl, DISPLAY_VERT, CANVAS_MEAN_FRAG)
    this.meanUni = getUniforms(gl,this.meanProg,['u_source','u_geometry','u_mask','u_maskMapping'])
    this.meanPosLoc = gl.getAttribLocation(this.meanProg,'a_position')
    this.transferUni = getUniforms(gl, this.transferProg, TRANSFER_UNIFORMS)
    this.pickupUni = getUniforms(gl, this.pickupProg, [
      'u_gatherEnabled','u_gatherRect','u_gatherTile','u_gatherScale','u_patch', 'u_carried', 'u_rate', 'u_paint', 'u_paintLoad', 'u_alphaPickup', 'u_wetBlur','u_wetTexel','u_wetRetention',
    ])
    this.transferPosLoc = gl.getAttribLocation(this.transferProg, 'a_position')
    this.pickupPosLoc   = gl.getAttribLocation(this.pickupProg, 'a_position')
  }

  /** Context loss: every GL object held here is already dead. */
  forget(): void {
    this.gridBatch?.reset()
    this.projectionSampler.forget()
    this.proceduralTransfer = undefined
    this.colorMean = undefined
    this.colorSmudgeTransfer = undefined
    this.materialProjection = undefined
    this.curveTransfer = undefined
    this.imageTransfer = undefined
    this.scratchPool.forget() // same reasoning as AreaOps' pool, see #14
    this.wetTextures.clear(true)
    for(const state of this.wetGestures.values()) state.secondary?.forget()
    this.wetGestures.clear()
    this.imprints.clear() // same reasoning — pooled GL objects are dead too
    this.replayChunks.clear()
  }

  destroy(): void {
    this.gridBatch?.destroy()
    this.projectionSampler.destroy()
    const { gl } = this
    this.scratchPool.destroy()
    // A live imprint's buffer was spliced *out* of the scratch pool drained
    // above and is held only here, so it needs destroying on its own.
    for (const imprint of this.imprints.values()) imprint.buf?.destroy()
    this.imprints.clear()
    this.replayChunks.clear()
    this.wetTextures.clear()
    if (this.ownsMipCache) this.imageMips.clear()
    for(const state of this.wetGestures.values())state.secondary?.destroy()
    this.wetGestures.clear()
    if(this.colorMean)gl.deleteProgram(this.colorMean.program)
    if (this.colorSmudgeTransfer) gl.deleteProgram(this.colorSmudgeTransfer.program)
    if(this.materialProjection)gl.deleteProgram(this.materialProjection.program)
    if (this.curveTransfer) gl.deleteProgram(this.curveTransfer.program)
    if (this.imageTransfer) gl.deleteProgram(this.imageTransfer.program)
    this.colorMean = undefined
    this.colorSmudgeTransfer = undefined
    this.materialProjection = undefined
    this.curveTransfer = undefined
    this.imageTransfer = undefined
    if (this.proceduralTransfer) gl.deleteProgram(this.proceduralTransfer.program)
    this.proceduralTransfer = undefined
    gl.deleteProgram(this.transferProg)
    gl.deleteProgram(this.pickupProg)
    gl.deleteProgram(this.meanProg)
  }

  /** Release a presentation-only owner without touching a newer gesture. */
  releaseGesture(userId: string, strokeId: string, lost: boolean): void {
    const imprint = this.imprints.get(userId)
    if (imprint?.strokeId === strokeId) {
      if (!lost) imprint.buf?.destroy()
      this.imprints.delete(userId)
      this.finishSecondary(userId,lost)
      this.wetGestures.delete(userId)
    }
    if (this.replayChunks.get(userId)?.strokeId === strokeId) this.replayChunks.delete(userId)
  }

  /** Only an explicit final operation or synchronous local pen-up closes a
   * reservoir. Never called for peer_left, chunk flush or an idle timeout.
   * null identifies the synchronous local path, which paints with prevDab
   * rather than a canonical strokeId. A stale end cannot free a newer owner.
   */
  finishGesture(userId: string, strokeId: string | null): void {
    const imprint = this.imprints.get(userId)
    if (!imprint || imprint.strokeId !== strokeId) return
    this.finishSecondary(userId)
    if (imprint.buf) this.releaseScratch(imprint.buf)
    this.imprints.delete(userId)
    this.wetGestures.delete(userId)
    if (this.replayChunks.get(userId)?.strokeId === strokeId) this.replayChunks.delete(userId)
  }

  /** (#554) The smudge half of the engine's _dropCarriedGestureState: every
   *  user's replay chunk goes except `live`'s — the local gesture actually
   *  in progress, still being painted by paint() and not to be reset under
   *  it by, say, a peer's undo arriving mid-stroke. A target-scoped replay
   *  leaves continuing peer gestures on other layers intact. */
  dropReplayChunks(live: LiveGesture,target?:ILayerBuffer): void {
    for (const [userId, chunk] of this.replayChunks) {
      if(target && chunk.target && chunk.target!==target)continue
      const isLive = userId === live.userId && !!live.strokeId && chunk.strokeId === live.strokeId
      if (!isLive) this.replayChunks.delete(userId)
    }
  }

  /** See paintOneDab's own doc comment for the algorithm and
   *  the engine's _paintDabs doc comment for `prevDab`/`strokeId`. Never batched (unlike
   *  pencil/eraser's StampPainter.paintInstanced): every dab both reads the canvas
   *  under it and writes to it, through an imprint threaded dab-to-dab, so
   *  dab N+1's own passes can't be submitted until dab N's have actually
   *  been issued in order. A real cost pencil/eraser don't pay (their dabs
   *  are independent, safely batched), but smudge strokes are a deliberate,
   *  comparatively low-frequency gesture (blending a shaded area), not fast
   *  scribbling — not the same hot path #123 batched. */
  paint(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], userId: string, prevDab: Dab | undefined,
    strokeId: string | undefined,
    /** (#573) Set for the digital brush's mixer: the colour the brush is
     *  loaded with and how it lays it down. Absent for the smudge tool. */
    paint?: MixerPaint,
    execution?: BrushExecutionContext,
  ): void {
    // Transient scratch targets (live-tip/prediction preview, a peer's
    // reveal buffer) are a single un-tiled buffer, freshly cleared before
    // every refresh — nothing meaningful to pick up, and reading it back
    // while it's also the render target would need the same same-texture
    // read+write WebGL1 forbids. A harmless no-op: the real dabs below
    // always paint straight into the real layer regardless (see
    // the engine's _paintDabs doc comment on this parameter).
    if (paint?.brush) { assertBrushExecutionContext(paint.brush,execution); assertBrushSourceInputs(paint.brush,dabs) }
    if (target instanceof AccumulationBuffer) return
    const projectionRead=paint?.brush?.mixer?.source==='projectionCanvas' ? this.ctx.openProjection?.(execution!.brushSource!,target) : undefined
    const projection=projectionRead?.layers
    if(paint?.brush?.mixer?.source==='projectionCanvas' && !projection)throw Error('Projection source reader unavailable')
    const materialOwners=new WeakMap<AccumulationBuffer,PaintTarget>()
    const material=!!paint?.brush?.mixer?.paintThickness
    const layer:SmudgeLayer=material ? {
      resolveForPaint:rect=>target.resolveForPaint(rect).map(tile=>{
        const color=tile.buffer.ensureColorSmudge().color;materialOwners.set(color,tile)
        return {...tile,buffer:color}
      }),
      resolveForRead:rect=>target.resolveVisible(rect).map(tile=>({...tile,buffer:tile.buffer.colorSmudge?.color ?? tile.buffer})),
      materialOwner:color=>materialOwners.get(color),
      markContentPainted:rect=>target.markContentPainted(rect),
    } : target
    // An explicit prevDab means the caller *is* the continuation (the live
    // stroke's own next incremental batch), and nothing needs resolving.
    const resources = paint?.brush ? bindBrushGradient(brushPreparationResources(paint.brush),execution?.brushSource?.gradient) : undefined
    if (resources?.some(resource => resource.nativeImage || resource.lookup32)) assertNativeImageAdmission(resources, this.imageDimensionLimit())
    const releaseTextures = resources ? this.wetTextures.lease(brushTextureLeasePlan(resources, 'wet')) : () => {}
    try {
    let prev = prevDab ?? this.resumeGesture(userId, strokeId, dabs,target)
    for (const dab of dabs) {
      if (paint?.brush) {
        this.paintBehaviorDab(layer, dab, prev, userId, paint,execution,projection)
        prev = dab
        continue
      }
      // No predecessor: this is the gesture's first dab, so there is no
      // travel to smear along yet — it only primes the imprint with what
      // sits under it (see applyDab's `priming` branch), which is
      // also why a one-dab smudge stroke leaves the canvas untouched.
      if (prev) this.paintOneDab(layer, prev, dab, userId, paint)
      else this.applyDab(layer, dab, 0, userId, paint)
      prev = dab
    }
    } finally { releaseTextures();projectionRead?.release() }
  }

  /** A historical read must not consume another participant's live gesture.
   * Only transient solver maps are isolated; programs, textures and bounded
   * scratch pools remain shared. The callback is synchronous. */
  withIsolatedGestures<T>(work:()=>T):T {
    const imprints=[...this.imprints],gestures=[...this.wetGestures],chunks=[...this.replayChunks]
    this.imprints.clear();this.wetGestures.clear();this.replayChunks.clear()
    try{return work()}finally{
      for(const value of this.imprints.values())if(value.buf)this.releaseScratch(value.buf)
      for(const value of this.wetGestures.values())value.secondary?.destroy()
      this.imprints.clear();this.wetGestures.clear();this.replayChunks.clear()
      for(const [key,value]of imprints)this.imprints.set(key,value)
      for(const [key,value]of gestures)this.wetGestures.set(key,value)
      for(const [key,value]of chunks)this.replayChunks.set(key,value)
    }
  }

  prepareProjectionSource():void {this.projectionSampler.prepare()}

  /** Each logical dab advances dynamics exactly once, independent of live batches.
   * The imprint survives only the same user's same gesture/chunks. */
  private paintBehaviorDab(target: SmudgeLayer, dab: Dab, prev: Dab | undefined, userId: string, paint: MixerPaint,execution?:BrushExecutionContext,projection?:readonly ProjectionSampleLayer[]): void {
    const brush = paint.brush!
    let state = this.wetGestures.get(userId)
    if (!state || !prev) {
      state?.secondary?.destroy()
      state = { charge: 1, behavior: beginBrushBehavior(dab,execution) }
      this.wetGestures.set(userId,state)
    }
    assertSameBrushExecutionContext(state.behavior.execution,execution)
    if(brush.grid){
      this.paintGridDab(target,dab,paint,state.behavior)
      state.behavior.previous={...dab};state.behavior.dabSequence=(state.behavior.dabSequence??0)+1
      return
    }
    const travel = prev ? Math.hypot(dab.x-prev.x,dab.y-prev.y)/Math.max(0.5,this.radiusOf(dab,paint)) : 0
    if (!brush.behavior?.strokeInput && prev && travel < 1e-6 && !brushSamplesCanvas(brush)) { advanceBrushAnimation(brush,state.behavior); state.behavior.dabSequence=(state.behavior.dabSequence??0)+1; return }
    const dual=brush.behavior?.dual
    let secondary: ReturnType<RibbonStrokeScratch['brushSecondary']> | undefined
    if(dual?.sampling==='independent') {
      state.secondary ??= this.ctx.createBrushScratch()
      secondary=state.secondary.brushSecondary()
      const owned=secondary
      const maskTarget:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>={resolveForPaint:bounds=>target.resolveForPaint(bounds).map(tile=>({...tile,buffer:owned.tile(tile.buffer)})),markContentPainted:()=>{}}
      this.ctx.paintBrushMask(maskTarget,secondaryBrushDabs(brush,dual.brush,[dab],secondary.sampling,true,undefined,execution),dual.brush,paint.pressure,secondary.scratch,paint.sizeMultiplier,execution)
    }
    const wet = brush.behavior?.wetMix
    if(brush.behavior?.strokeInput && !prev)state.behavior.firstAngle=dab.sourceAngle!
    const directionalDab = {...dab,angle:brush.behavior?.strokeInput ? dab.sourceAngle! : prev && (prev.x!==dab.x || prev.y!==dab.y) ? Math.atan2(dab.y-prev.y,dab.x-prev.x) : dab.angle}
    const pickupFactor = (brush.mixer?.pickupDynamics ?? []).reduce((value,control,index)=>value*brushDynamicValue(control,directionalDab,state.behavior,brushDabRandom(brushDabSeed(dab.x,dab.y,dab.pressure),0x60000+index)),1)
    // Evaluate source controls before behaviorStampsForDab advances distance,
    // direction and animation. Hash namespaces do not perturb old jitter streams.
    const sourceSeed=brushDabSeed(dab.x,dab.y,dab.pressure)
    const samplingRadius=brush.mixer?.sampling ? clampNum(brush.mixer.sampling.radius*(brush.mixer.sampling.radiusDynamics ?? []).reduce((value,control,index)=>value*brushDynamicValue(control,directionalDab,state.behavior,brushDabRandom(sourceSeed,0x70000+index)),1),0,3) : undefined
    const foreground=brushForegroundRate(brush.mixer?.foreground)
    const foregroundRate=foreground ? foreground.rate*(foreground.dynamics ?? []).reduce((value,control,index)=>value*brushDynamicValue(control,directionalDab,state.behavior,brushDabRandom(sourceSeed,0x80000+index)),1) : undefined
    const gradient=brush.mixer?.foreground && 'gradient' in brush.mixer.foreground ? brush.mixer.foreground.gradient : undefined
    const gradientColor=gradient ? sampleBrushGradient(state.behavior.execution!.brushSource!,gradient.value*(gradient.positionDynamics ?? []).reduce((value,control,index)=>value*brushDynamicValue(control,directionalDab,state.behavior,brushDabRandom(sourceSeed,0xa0000+index)),1)) : undefined
    const thicknessOption=brush.mixer?.paintThickness
    const thickness=thicknessOption ? clampNum(thicknessOption.value*(thicknessOption.dynamics ?? []).reduce((value,control,index)=>value*brushDynamicValue(control,directionalDab,state.behavior,brushDabRandom(sourceSeed,0x90000+index)),1),0,1) : undefined
    const step = wet ? wetMixStep(wet,state,dab,travel,!prev) : {
      // The descriptor's zero load means a pure blender. The legacy mixer's
      // fixed .85 prime would inject foreground paint even with load=0.
      load: !prev ? brush.mixer?.initialLoad ?? MIXER_PRIME_LOAD : clampNum(paint.load * travel,0,1),
      pickup: brushSamplesCanvas(brush) ? paint.pickup : !prev ? 1 : clampNum(paint.pickup*travel,0,1),strength:1,retention:1,blur:0,
    }
    step.pickup = clampNum(step.pickup*pickupFactor,0,1)
    for (const stamp of behaviorStampsForDab(brush,dab,state.behavior,gradientColor?.color ?? paint.color)) {
      let shaped = {...dab,x:stamp.x,y:stamp.y,size:stamp.size,angle:stamp.angle}
      const wetStamp: WetStamp = {gradientLut:brush.tip.color&&'gradient' in brush.tip.color ? state.behavior.execution!.brushSource!.gradient : undefined,foregroundAlpha:gradientColor?.alpha,projection,thickness,samplingRadius,foregroundRate,secondary,seed:state.behavior.seed,stamp,step,paint}
      if (brushSamplesCanvas(brush)) {
        if (this.radiusOf(shaped,paint) < 0.5) continue
        const mean=brush.mixer.sampling
        const previousPlaced = mean ? state.previousMeanPlaced : state.previousPlaced
        // Own gesture state, independent of frame selection/RNG. The first
        // placed contact establishes the source centre without painting.
        if(mean){
          const bounds=brushFootprintBounds(shaped.x,shaped.y,this.radiusOf(shaped,paint),stamp.aspect,stamp.angle)!
          state.previousMeanPlaced=canvasMeanPlacedCenter(canvasMeanDabRect(shaped.x,shaped.y,bounds.maxX-bounds.minX,bounds.maxY-bounds.minY))
        }else {
          const radius=this.radiusOf(shaped,paint)
          const placement=smearPlacement(brush.tip,shaped.x,shaped.y,radius*stamp.aspect,radius,stamp.angle)
          wetStamp.smearPlacement=placement
          state.previousPlaced=placement.placedCenter
          shaped={...shaped,...placement.maskCenter}
          wetStamp.stamp={...stamp,...placement.maskCenter}
        }
        if (previousPlaced) this.applyDab(target,shaped,0,userId,paint,wetStamp,previousPlaced)
      } else this.applyDab(target,shaped,Math.max(travel,0.1),userId,paint,wetStamp)
    }
  }

  /** One bounded source image before the first cell write; never GPU readback.
   * Source dependencies/replay ordering are the common canvas mixer contract. */
  private paintGridDab(target:SmudgeLayer,dab:Dab,paint:MixerPaint,state:BrushBehaviorState):void{
    const g=paint.brush!.grid!,cells=gridCells(g,dab,state.seed^Math.imul((state.dabSequence??0)+1,0x9e3779b9))
    if(!cells.length)return
    const pad=g.shape===4?6:1,bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
    for(const c of cells){bounds.minX=Math.min(bounds.minX,c.x-c.width/2-pad);bounds.maxX=Math.max(bounds.maxX,c.x+c.width/2+pad);bounds.minY=Math.min(bounds.minY,c.y-c.height/2-pad);bounds.maxY=Math.max(bounds.maxY,c.y+c.height/2+pad)}
    const span=Math.max(8,Math.ceil(Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY))+2),rect={minX:Math.floor(bounds.minX)-1,minY:Math.floor(bounds.minY)-1,maxX:0,maxY:0};rect.maxX=rect.minX+span;rect.maxY=rect.minY+span
    const size=g.sampleInput?Math.min(512,span):8,source=this.acquireScratch(size)
    try{
      if(g.sampleInput)this.gatherPatch(source,target.resolveForRead?.(rect)??target.resolveForPaint(rect),rect,size,span)
      const opacity=clampNum(paint.strength*(paint.pressure?curveAt(paint.curve,dab.pressure):1)*dab.opacity,0,1)
      const batch=this.gridBatch??=new GridCellBatch(this.gl)
      for(const tile of target.resolveForPaint(bounds))batch.paint(cells,tile.buffer,tile.originX,tile.originY,source,rect,span,paint.color,g.shape,g.sampleInput,g.randomOpacity,opacity)
      target.markContentPainted(bounds)
    }finally{this.releaseScratch(source)}
  }

  /** Optical mask belongs to one gesture, not the user's carried reservoir. */
  finishSecondary(userId:string,lost=false,strokeId?:string):void {
    if(strokeId && this.imprints.get(userId)?.strokeId!==strokeId)return
    const state=this.wetGestures.get(userId)
    if(state?.secondary){if(lost)state.secondary.forget();else state.secondary.destroy();state.secondary=undefined}
  }

  /** Resolves what the first dab of this call should treat as its
   *  predecessor, and resets the imprint when this call starts a *new*
   *  gesture (see imprints' own field comment for why an imprint
   *  never crosses a pen-up).
   *
   *  The continuation case is a gesture long enough to have been recorded
   *  as several operations (_flushStrokeChunk): live, they were one
   *  unbroken run of dabs through one imprint, and replay has to rejoin
   *  them or every chunk boundary would restart the smear from scratch —
   *  visible as a seam. Both halves of the check matter: the imprint must
   *  still belong to this gesture *and* a previous chunk of it must have
   *  gone through here, so an operation arriving on its own (a peer's
   *  stroke, a replay that begins mid-gesture because the earlier chunk is
   *  already inside a restored snapshot) correctly starts clean instead of
   *  smearing from wherever this user's tool last happened to be. */
  private resumeGesture(userId: string, strokeId: string | undefined, dabs: Dab[],target?:ILayerBuffer): Dab | undefined {
    const imprint = this.imprintFor(userId)
    const chunk = strokeId ? this.replayChunks.get(userId) : undefined
    const continuing = !!strokeId && chunk?.strokeId === strokeId && imprint.strokeId === strokeId && (!target || !chunk.target || chunk.target===target)
    if (!continuing) {
      if (imprint.buf) this.releaseScratch(imprint.buf)
      imprint.buf = null
      this.finishSecondary(userId)
      this.wetGestures.delete(userId)
    }
    imprint.strokeId = strokeId ?? null
    if (strokeId) this.replayChunks.set(userId, { strokeId, lastDab: dabs[dabs.length - 1],...(target ? {target} : {}) })
    else this.replayChunks.delete(userId)
    return continuing ? chunk?.lastDab : undefined
  }

  /** One smudge dab (#416): the canvas under it is blended toward the
   *  imprint the stump carries, and the imprint is blended toward the
   *  canvas — both per pixel, both in the same dab. See
   *  SMUDGE_TRANSFER_FRAG's own file comment in shaders.ts for the full
   *  algorithm and for what this replaced (a single carried scalar, which
   *  forced every dab to be *either* a pickup or a deposit across its whole
   *  footprint and left a scrubbed-clean halo around every line it worked).
   *
   *  There are no separate rear/center/front contacts anymore. The imprint
   *  is anchored to the dab's own position in normalized patch space, so it
   *  travels with the brush by construction and the offset between
   *  consecutive dabs is itself the smear — the thing three hand-offset
   *  contacts were approximating.
   *
   *  `travel` (distance since the previous dab, in brush radii) scales both
   *  rates so a stroke's result follows how far it went rather than how
   *  many samples arrived along the way — see SMUDGE_PICKUP_RATE. It also
   *  makes standing still a true no-op rather than something that slowly
   *  eats the drawing. */
  private paintOneDab(target: SmudgeLayer, prev: Dab, dab: Dab, userId: string, paint?: MixerPaint): void {
    const radius = this.radiusOf(dab, paint)
    if (radius < 0.5) return

    const len = Math.hypot(dab.x - prev.x, dab.y - prev.y)
    if (len < 1e-3) return // stationary/duplicate sample — nothing moved, so nothing smears
    this.applyDab(target, dab, clampNum(len / radius, 0, 1), userId, paint)
  }

  /** The stump's radius — or, for the mixer brush (#573), the brush's, which
   *  follows the digital brush's own size normalization rather than smudge's. */
  private radiusOf(dab: Dab, paint?: MixerPaint): number {
    return dab.size * 0.5 * (paint ? paint.sizeMultiplier : SMUDGE_SIZE_MULTIPLIER)
  }

  /** The two GPU phases of one smudge dab, against `userId`'s own imprint:
   *  copy the canvas patch under the dab, refresh the imprint from it
   *  (SMUDGE_PICKUP_FRAG), then lay the imprint back down as a per-pixel
   *  lerp (two SMUDGE_TRANSFER_FRAG draws — see that shader's own comment
   *  for why the pair is exactly `dst*(1-a) + carried*a` and why both must
   *  keep computing `a` identically).
   *
   *  `travel` of 0 means there is no imprint to lay down yet: the dab only
   *  primes it (rate 1 — take the canvas wholesale rather than blending
   *  toward it from nothing, which would otherwise lay a faded ghost of the
   *  canvas over itself on the gesture's first dab) and paints nothing.
   *  Same branch covers an imprint that never got primed because an earlier
   *  dab bailed out below.
   *
   *  (#514) Both phases span as many tiles as the dab actually overlaps —
   *  up to four. Until then a dab whose patch didn't fit inside a single
   *  tile was dropped whole, which was written off as "only bites right at
   *  a boundary": true of nothing. Tiles are TILE_SIZE in a bounded room
   *  too (_tileSize), so an A4 sheet has a seam cross straight through it at
   *  x=1024/y=1024, and the dead band around each seam is as wide as the
   *  brush is — a 100px stump had a 100px stripe where the tool did
   *  literally nothing, measured, with the imprint going stale across it and
   *  then dumping pre-seam content on the far side. The dab is the same dab
   *  either way; only which tile's pixel space each piece of it is expressed
   *  in changes, which is exactly how pencil and eraser have always crossed
   *  a seam. */
  private applyDab(target: SmudgeLayer, dab: Dab, travel: number, userId: string, paint?: MixerPaint, wet?: WetStamp, previousCanvas?: { x: number; y: number }): void {
    const radius = this.radiusOf(dab, paint)
    if (radius < 0.5) return
    const footprint=brushFootprintBounds(dab.x,dab.y,radius,wet?.stamp.aspect ?? 1,wet?.stamp.angle ?? 0,1)
    if(!footprint)return
    const reach = Math.max(footprint.maxX-dab.x,footprint.maxY-dab.y)
    const patchWorld = Math.ceil(reach * 2)
    const patchSpan = Math.ceil(patchWorld / SMUDGE_PATCH_GRANULARITY) * SMUDGE_PATCH_GRANULARITY
    const patchSize = Math.min(SMUDGE_MAX_PATCH_SIZE,patchSpan)
    if (patchSize < 1) return
    const half = patchSpan / 2

    // Whole world texels, not the dab's own fractional center: the imprint
    // and the canvas have to agree to the texel, or the lerp mixes a shifted
    // copy of the same content into itself and blurs the canvas on every
    // dab, including a standing-still one. Rounded in *world* space (it used
    // to be rounded in the one tile's local space) because every tile below
    // maps this same world rect into its own pixels — which is what makes
    // the two halves of a seam-straddling patch line up with each other.
    const patchX = Math.round(dab.x - half)
    const patchY = Math.round(dab.y - half)
    const patchRect = { minX: patchX, minY: patchY, maxX: patchX + patchSpan, maxY: patchY + patchSpan }

    if (previousCanvas && wet && paint) {
      this.paintPreviousCanvas(target,dab,radius,footprint,patchRect,patchSize,patchSpan,previousCanvas,paint,wet)
      return
    }
    const targets = target.resolveForPaint(patchRect)
    if (!targets.length) return // degenerate rect only — tilesOverlappingRect never returns empty otherwise

    const patch = this.acquireScratch(patchSize)
    this.gatherPatch(patch, targets, patchRect, patchSize,patchSpan)

    const imprint = this.imprintFor(userId)
    const priming = imprint.buf === null
    const rate = priming ? 1 : clampNum(SMUDGE_PICKUP_RATE * travel, 0, 1)
    // Ping-pong rather than in-place: WebGL1 forbids reading and writing the
    // same texture in one draw, the same two-phase commit every other
    // scratch-then-copy in this file already follows. Priming has no
    // previous imprint to read, so it reads the patch on both inputs —
    // mix(patch, patch, 1) is the patch either way.
    const next = this.acquireScratch(patchSize)
    // (#573) The mixer folds its own colour back into what it carries, per
    // radius travelled — and nearly in full on the first dab, because a brush
    // arrives on the canvas loaded with paint, not with whatever is under it.
    const paintLoad = wet ? wet.step.load : !paint ? 0 : priming ? MIXER_PRIME_LOAD : clampNum(paint.load * travel, 0, 1)
    // The mixer picks up at its own rate — slower than the stump's, which is
    // what lets it drag a colour a couple of brush widths rather than one.
    const pickRate = wet ? wet.step.pickup : paint && !priming ? clampNum(paint.pickup * travel, 0, 1) : rate
    this.runPickup(patch, imprint.buf ?? patch, next, pickRate, wet?.stamp.color ?? paint?.color ?? null, paintLoad, wet?.step.blur ?? 0, wet?.step.retention ?? 1, paint?.brush?.mixer?.smearAlpha ?? false)
    if (imprint.buf) this.releaseScratch(imprint.buf)
    imprint.buf = next
    if (priming && !wet) { this.releaseScratch(patch); return }

    // dab.opacity is the UI's "Strength" slider for this tool (see
    // bakeDabOpacity's own smudge branch); pressure and travel are the two
    // physical terms on top of it.
    // The mixer lays paint down at its own rate, and pressure acts through the
    // brush's opacity curve when that switch is on — the same meaning pressure
    // has for every other digital brush.
    let strength = paint
      ? paint.strength * travel * (paint.pressure ? curveAt(paint.curve, dab.pressure) : 1) * dab.opacity
      : SMUDGE_DEPOSIT_RATE * travel * dab.pressure * dab.opacity
    if (wet) strength *= wet.step.strength * wet.stamp.flowScale * wet.stamp.opacityScale * (paint?.brush?.flow ?? 1)
    if (strength <= 0) { this.releaseScratch(patch); return }
    for (const tile of targets) {
      // The brush's own circle, not the patch square: patchSize is rounded up
      // to SMUDGE_PATCH_GRANULARITY, so a patch can reach into a tile the
      // stump itself never touches, where both draws below would discard
      // every fragment for nothing.
      if (footprint.maxX <= tile.originX || footprint.minX >= tile.originX + tile.buffer.width
        || footprint.maxY <= tile.originY || footprint.minY >= tile.originY + tile.buffer.height) continue
      // App-space (top-down, like every Dab.x/y) -> GL framebuffer space
      // (bottom-up) — the same flip every other app-space/GL boundary in this
      // file applies (DAB_VERT's clip.y flip, pickColor). The patch's own
      // lower-left corner *in this tile's* pixel space, which is how
      // SMUDGE_TRANSFER_FRAG maps a fragment back into the imprint
      // (u_patchOrigin); negative for the tile on the far side of a seam,
      // which the shader's plain `(gl_FragCoord.xy - u_patchOrigin)` handles
      // as-is — every fragment it actually shades still lands inside the
      // patch, since the dab quad is contained in it by construction.
      const originX = patchX - tile.originX
      const originGlY = tile.buffer.height - (patchY - tile.originY) - patchSpan
      if (!wet) this.drawTransferDab(tile, dab, radius, next, originX, originGlY, patchSpan, 'clear', strength)
      this.drawTransferDab(tile, dab, radius, next, originX, originGlY, patchSpan, 'lay', strength, wet, patch)
    }

    this.releaseScratch(patch)
    target.markContentPainted(footprint)
  }

  /** Spatial canvas feedback, not a carried reservoir. Both snapshots are
   * complete before any destination write; changing size uses current bounds
   * at the previous placed centre, never rescales an old imprint. */
  private paintPreviousCanvas(target: SmudgeLayer, dab: Dab, radius: number, footprint: WorldRect, rect: WorldRect, patchSize: number, span: number, previous: {x:number;y:number}, paint: MixerPaint, wet: WetStamp): void {
    let source:AccumulationBuffer|undefined
    let original: AccumulationBuffer | undefined
    let actual:AccumulationBuffer|undefined
    try {
      original = this.acquireScratch(patchSize)
      const shift=wet.smearPlacement ? smearSourceShift(previous,wet.smearPlacement) : undefined
      const x = shift ? rect.minX+shift.x : Math.round(previous.x-span/2)
      const y = shift ? rect.minY+shift.y : Math.round(previous.y-span/2)
      const sourceRect = {minX:x,minY:y,maxX:x+span,maxY:y+span}
      // Resolve/gather source first: allocating distant destination tiles can
      // evict source tiles, whereas the already gathered snapshot is stable.
      if(paint.brush?.mixer?.sampling){
        // Sampling geometry excludes transfer padding/granularity. Its own
        // square gather retains original texel centres up to512 world pixels.
        const native=brushFootprintBounds(dab.x,dab.y,radius,wet.stamp.aspect,wet.stamp.angle)!
        const current=canvasMeanDabRect(dab.x,dab.y,native.maxX-native.minX,native.maxY-native.minY)
        const sampleRect=canvasMeanSourceRect(previous,current,Math.min(paint.brush.mixer.sampling.mode==='maskMean' ? 1 : 3,wet.samplingRadius ?? paint.brush.mixer.sampling.radius))
        let mask: AccumulationBuffer | undefined
        try {
          if(paint.brush.mixer.sampling.mode==='maskMean') {
            mask=this.acquireScratch(patchSize)
            mask.clear()
            // The mask shares the same bounded world square as transfer.
            // Scale geometry only for the existing >512px gather budget.
            const scale=patchSize/span
            const maskDab={...dab,x:rect.minX+(dab.x-rect.minX)*scale,y:rect.minY+(dab.y-rect.minY)*scale}
            const maskWet={...wet,maskScale:scale,maskSourceDab:dab,secondary:undefined,smearPlacement:undefined,stamp:{...wet.stamp,x:maskDab.x,y:maskDab.y,size:wet.stamp.size*scale}}
            this.drawTransferDab({buffer:mask,originX:rect.minX,originY:rect.minY,contentRect:null},maskDab,radius*scale,original,0,0,patchSize,'mask',1,maskWet)
          }
          const sourceBase=canvasMeanSourceRect(previous,current,1)
          source=this.meanPreviousCanvas(target,mask?sourceBase:sampleRect,mask ? {buffer:mask,x:(current.minX-rect.minX)/span,y:(current.minY-rect.minY)/span,inverseSpan:1/span,radius:Math.min(1,wet.samplingRadius ?? paint.brush.mixer.sampling.radius)} : paint.brush.mixer.sampling.mode==='adaptiveMean' ? {x:0,y:0,inverseSpan:0,radius:1} : undefined,wet.projection)
        } finally { if(mask)this.releaseScratch(mask) }
      }else {source=this.acquireScratch(patchSize);if(wet.projection)this.projectionSampler.gather(source,sourceRect,wet.projection);else this.gatherPatch(source,(target.resolveForRead?.(sourceRect) ?? target.resolveForPaint(sourceRect)),sourceRect,patchSize,span)}
      const projectedBlend=wet.projection && !!paint.brush?.mixer?.algorithm
      if(projectedBlend)this.projectionSampler.gather(original,rect,wet.projection!)
      const targets = target.resolveForPaint(rect)
      if (!targets.length) return
      if(projectedBlend){
        actual=this.acquireScratch(patchSize);this.gatherPatch(actual,targets,rect,patchSize,span)
      }else this.gatherPatch(original,targets,rect,patchSize,span)
      const strength = (paint.brush?.mixer?.algorithm ? 1 : wet.step.pickup) * paint.strength * (paint.pressure ? curveAt(paint.curve,dab.pressure) : 1) * dab.opacity * wet.stamp.opacityScale
      if (strength <= 0) return
      for (const tile of targets) {
        if (footprint.maxX <= tile.originX || footprint.minX >= tile.originX+tile.buffer.width || footprint.maxY <= tile.originY || footprint.minY >= tile.originY+tile.buffer.height) continue
        this.drawTransferDab(tile,dab,radius,source,rect.minX-tile.originX,tile.buffer.height-(rect.minY-tile.originY)-span,span,'lay',strength,wet,original,actual)
        const owner=target.materialOwner?.(tile.buffer)
        if(owner) {
          const height=owner.buffer.colorSmudge!.height
          this.drawTransferDab({...owner,buffer:height},dab,radius,source,0,0,span,'height',1,{...wet,coverageBuffer:tile.buffer})
          this.projectMaterial(owner,footprint)
        }
      }
      target.markContentPainted(footprint)
    } finally { if(source)this.releaseScratch(source); if (original) this.releaseScratch(original);if(actual)this.releaseScratch(actual) }
  }

  /** Fixed64 nearest-centre samples, no CPU readback or persistent reservoir.
   * Samples larger than512px use the bounded gather's existing downsampling;
   * importer reports both this and native adaptive-count approximation. */
  private meanPreviousCanvas(target:SmudgeLayer,rect:WorldRect,mask?:{buffer?:AccumulationBuffer;x:number;y:number;inverseSpan:number;radius:number},projection?:readonly ProjectionSampleLayer[]):AccumulationBuffer {
    if(mask)this.prepareColorSmudgeMean()
    const width=rect.maxX-rect.minX,height=rect.maxY-rect.minY,span=Math.max(width,height)
    const size=Math.min(SMUDGE_MAX_PATCH_SIZE,span),sample=this.acquireScratch(size)
    let mean:AccumulationBuffer|undefined
    try {
      const square={...rect,maxX:rect.minX+span,maxY:rect.minY+span}
      if(projection)this.projectionSampler.gather(sample,square,projection)
      else this.gatherPatch(sample,(target.resolveForRead?.(square) ?? target.resolveForPaint(square)),square,size,span)
      mean=this.acquireScratch(1)
      const {gl}=this,binding=mask?this.colorMean:undefined,u=binding?.uniforms ?? this.meanUni
      mean.beginReplaceDraw()
      try {
      gl.useProgram(binding?.program ?? this.meanProg)
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sample.texture)
      gl.uniform1i(u.u_source,0)
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask?.buffer?.texture ?? sample.texture);gl.uniform1i(u.u_mask,1)
      if(mask)gl.uniform3f(u.u_radius,mask.radius,Math.trunc((rect.minX+rect.maxX-1)/2)-rect.minX,Math.trunc((rect.minY+rect.maxY-1)/2)-rect.minY)
      gl.uniform4f(u.u_maskMapping,mask?.x ?? 0,mask?.y ?? 0,mask?.inverseSpan ?? 0,mask?.buffer?1:0)
      gl.uniform4f(u.u_geometry,width,height,span,Math.min(64,width*height))
      gl.bindBuffer(gl.ARRAY_BUFFER,this.ctx.screenBuf());gl.enableVertexAttribArray(binding?.position ?? this.meanPosLoc)
      gl.vertexAttribPointer(binding?.position ?? this.meanPosLoc,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6)
      }finally{mean.endDraw()}
      return mean
    }catch(error){if(mean)this.releaseScratch(mean);throw error}
    finally{this.releaseScratch(sample)}
  }

  /** Assembles the canvas patch under one dab out of every tile it overlaps
   *  (#514) — one `copyTexSubImage2D` per tile, each writing only the part of
   *  the patch that tile actually covers, so a patch straddling a seam comes
   *  out as one continuous image of the canvas rather than being abandoned.
   *
   *  Cleared first because the buffers are pooled: a tile covering only part
   *  of this patch leaves the remainder holding whatever the previous dab put
   *  there, and the imprint would pick that stale square up and lay it
   *  straight back onto the canvas — the same class of bug as the
   *  wrong-vertex-buffer one runPickup's own comment describes. In an
   *  infinite room resolveForPaint has already created every tile the rect
   *  touches, so the clear is belt-and-braces there; it is load-bearing for
   *  a bounded room, whose grid stops at the sheet's own last tile, and cheap
   *  next to the two full-quad passes each dab already runs. */
  private gatherPatch(
    patch: AccumulationBuffer, targets: PaintTarget[], patchRect: WorldRect, patchSize: number, patchSpan=patchSize,
  ): void {
    patch.clear()
    if(patchSpan>patchSize){this.gatherScaledPatch(patch,targets,patchRect,patchSpan);return}
    for (const { buffer, originX, originY } of targets) {
      // The overlap between this tile and the patch, in world space.
      const x0 = Math.max(patchRect.minX, originX)
      const y0 = Math.max(patchRect.minY, originY)
      const x1 = Math.min(patchRect.maxX, originX + buffer.width)
      const y1 = Math.min(patchRect.maxY, originY + buffer.height)
      if (x1 <= x0 || y1 <= y0) continue
      // Top-down world -> bottom-up GL on both sides of the copy, so `y1` (the
      // overlap's world *bottom*) is what each origin is measured back from.
      // Columns need no such care: x runs the same way in both conventions.
      buffer.copyRegionInto(
        patch,
        x0 - originX, buffer.height - (y1 - originY),
        x0 - patchRect.minX, patchSize - (y1 - patchRect.minY),
        x1 - x0, y1 - y0,
      )
    }
  }

  /** Keep the whole world footprint while bounding the carried texture to
   * 512². Large tips trade imprint resolution, never clamp canvas edge colours. */
  private gatherScaledPatch(patch:AccumulationBuffer,targets:PaintTarget[],rect:WorldRect,span:number):void {
    const {gl}=this,u=this.pickupUni
    patch.beginReplaceDraw();gl.useProgram(this.pickupProg)
    gl.uniform1f(u.u_gatherEnabled,1)
    gl.uniform2f(u.u_gatherRect,rect.minX,rect.maxY)
    gl.uniform1f(u.u_gatherScale,span/patch.width)
    // Both active samplers must reference input, even in the gather branch.
    gl.uniform1i(u.u_carried,0)
    gl.uniform1i(u.u_patch,0);gl.activeTexture(gl.TEXTURE0)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ctx.screenBuf())
    gl.enableVertexAttribArray(this.pickupPosLoc);gl.vertexAttribPointer(this.pickupPosLoc,2,gl.FLOAT,false,0,0)
    for(const {buffer,originX,originY} of targets){
      gl.bindTexture(gl.TEXTURE_2D,buffer.texture)
      gl.uniform4f(u.u_gatherTile,originX,originY,buffer.width,buffer.height)
      gl.drawArrays(gl.TRIANGLES,0,6)
    }
    patch.endDraw()
  }

  /** `userId`'s own imprint slot, created empty (never primed) on first use.
   *  Never removed once created — the entry itself is two fields and a
   *  possibly-null buffer handle, and the buffer goes back to the shared
   *  pool at every gesture boundary (see resumeGesture), so a room
   *  full of people who each smudged once holds nothing but map entries. */
  private imprintFor(userId: string): { buf: AccumulationBuffer | null; strokeId: string | null } {
    let entry = this.imprints.get(userId)
    if (!entry) {
      entry = { buf: null, strokeId: null }
      this.imprints.set(userId, entry)
    }
    return entry
  }

  /** One SMUDGE_PICKUP_FRAG draw: writes `mix(carried, patch, rate)` into
   *  `target`, per texel. GL blending must stay disabled — this replaces
   *  the imprint outright rather than accumulating onto whatever the pooled
   *  buffer happened to hold before. */
  private runPickup(
    patch: AccumulationBuffer, carried: AccumulationBuffer, target: AccumulationBuffer, rate: number,
    paintColor: [number, number, number] | null = null, paintLoad = 0, blur = 0, retention = 1, smearAlpha = false,
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.disable(gl.BLEND)
    gl.useProgram(this.pickupProg)
    const u = this.pickupUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, patch.texture)
    gl.uniform1i(u.u_patch, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, carried.texture)
    gl.uniform1i(u.u_carried, 1)
    gl.uniform1f(u.u_gatherEnabled,0)
    gl.uniform1f(u.u_rate, rate)
    gl.uniform1f(u.u_wetBlur, blur)
    gl.uniform1f(u.u_wetRetention,retention)
    gl.uniform2f(u.u_wetTexel,1/target.width,1/target.height)
    // Opaque and premultiplied: the colour is its own premultiplied value at
    // alpha 1. Set on every pickup, smudge's included (load 0), because a
    // program's uniforms outlive the draw that set them.
    const [pr, pg, pb] = paintColor ?? [0, 0, 0]
    gl.uniform4f(u.u_paint, pr, pg, pb, 1)
    gl.uniform1f(u.u_paintLoad, paintLoad)
    gl.uniform1f(u.u_alphaPickup, paintColor && !smearAlpha ? 1 : 0)

    // screenBuf, not quadBuf: this pass runs DISPLAY_VERT, whose "quad"
    // convention is the -1..1 fullscreen one, while quadBuf is DAB_VERT's
    // own -0.5..0.5 dab quad. Handing DAB_VERT's buffer to DISPLAY_VERT
    // covered only the imprint's middle quarter (and sampled the patch's
    // middle half, magnified), so the imprint's outer ring kept whatever
    // stale patch the pooled buffer last held and got laid straight back
    // onto the canvas — the square blocks a wide smudge stroke used to
    // stamp out (see index.smudge.test.ts's own square-block test).
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.screenBuf())
    const position=this.pickupPosLoc
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private imageDimensionLimit(): number {
    return this.maximumImageSide ??= this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
  }

  prepareColorSmudgeMean(): void {
    this.imageDimensionLimit()
    if(!this.colorMean){
      const gl=this.gl,program=createProgram(gl,DISPLAY_VERT,COLOR_SMUDGE_MEAN_FRAG)
      this.colorMean={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,['u_source','u_mask','u_geometry','u_maskMapping','u_radius'])}
    }
  }

  prepareColorSmudge(): void {
    this.prepareColorSmudgeMean()
    this.prepareMaterialProjection()
    if(this.colorSmudgeTransfer)return
    const gl=this.gl,program=createProgram(gl,DAB_VERT,wetTransferFragment(true,true,true,true))
    this.colorSmudgeTransfer={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,[...TRANSFER_UNIFORMS,
      'u_projectionCanvas','u_colorSmudgeHeight','u_tipProcedural','u_dualProcedural','u_tipProceduralGeometry','u_dualProceduralGeometry','u_dualProceduralAngle','u_wickPx','u_wickCap',
      'u_tipImageEnabled','u_dualImageEnabled','u_tipImageUVShift','u_dualImageUVShift','u_tipImageDomain','u_dualImageDomain'])}
  }

  private prepareMaterialProjection():void {
    if(this.materialProjection)return
    const gl=this.gl,program=createProgram(gl,DISPLAY_VERT,COLOR_SMUDGE_MATERIAL_FRAG)
    this.materialProjection={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,['u_color','u_height','u_resolution'])}
  }

  private projectMaterial(tile:PaintTarget,rect:WorldRect):void {
    const {gl}=this,buffer=tile.buffer,material=buffer.colorSmudge
    if(!material)return
    this.prepareMaterialProjection()
    const binding=this.materialProjection!
    const x=Math.max(0,Math.floor(rect.minX-tile.originX)),right=Math.min(buffer.width,Math.ceil(rect.maxX-tile.originX))
    const y=Math.max(0,Math.floor(buffer.height-(rect.maxY-tile.originY))),top=Math.min(buffer.height,Math.ceil(buffer.height-(rect.minY-tile.originY)))
    if(right<=x||top<=y)return
    buffer.beginReplaceDraw()
    try {
      gl.viewport(x,y,right-x,top-y);gl.useProgram(binding.program)
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,material.color.texture);gl.uniform1i(binding.uniforms.u_color,0)
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,material.height.texture);gl.uniform1i(binding.uniforms.u_height,1)
      gl.uniform2f(binding.uniforms.u_resolution,buffer.width,buffer.height)
      gl.bindBuffer(gl.ARRAY_BUFFER,this.ctx.screenBuf());gl.enableVertexAttribArray(binding.position);gl.vertexAttribPointer(binding.position,2,gl.FLOAT,false,0,0)
      gl.drawArrays(gl.TRIANGLES,0,6)
    } finally {buffer.endDraw()}
  }

  prepareRadialCurves(): void {
    this.imageDimensionLimit()
    if (this.curveTransfer) return
    const gl=this.gl, program=createProgram(gl,DAB_VERT,wetTransferFragment(true,true,true))
    this.curveTransfer={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,[...TRANSFER_UNIFORMS,
      'u_tipProcedural','u_dualProcedural','u_tipProceduralGeometry','u_dualProceduralGeometry','u_dualProceduralAngle','u_wickPx','u_wickCap',
      'u_tipImageEnabled','u_dualImageEnabled','u_tipImageUVShift','u_dualImageUVShift','u_tipImageDomain','u_dualImageDomain'])}
  }

  prepareIntegerImages(): void {
    this.imageDimensionLimit()
    if (this.imageTransfer) return
    const gl=this.gl, program=createProgram(gl,DAB_VERT,wetTransferFragment(true,true))
    this.imageTransfer={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,[...TRANSFER_UNIFORMS,
      'u_tipProcedural','u_dualProcedural','u_tipProceduralGeometry','u_dualProceduralGeometry','u_dualProceduralAngle','u_wickPx','u_wickCap',
      'u_tipImageEnabled','u_dualImageEnabled','u_tipImageUVShift','u_dualImageUVShift','u_tipImageDomain','u_dualImageDomain'])}
  }

  /** Compile once outside pointer input; initGL/forget invalidate this capability. */
  prepareProcedural(): void {
    const gl = this.gl
    if (!this.proceduralTransfer) {
      const program = createProgram(gl, DAB_VERT, wetTransferFragment(true))
      this.proceduralTransfer = {
        program,
        uniforms: getUniforms(gl, program, [
          ...TRANSFER_UNIFORMS, 'u_tipProcedural', 'u_dualProcedural',
          'u_tipProceduralGeometry', 'u_dualProceduralGeometry', 'u_dualProceduralAngle',
          'u_wickPx', 'u_wickCap',
        ]),
        position: gl.getAttribLocation(program, 'a_position'),
      }
    }
  }

  /** One half of a smudge dab's transfer — `clear` is `dst *= (1-a)` under
   *  beginErase()'s (ZERO, ONE_MINUS_SRC_ALPHA), `lay` is
   *  `dst += carried*a*tooth` under beginAdditiveDraw()'s (ONE, ONE). Issued
   *  as a pair, with identical uniforms apart from u_mode, so the two
   *  together are exactly `dst' = dst*(1-a) + carried*a*tooth` — a plain
   *  lerp wherever the deposit's own grain term is neutral (see
   *  SMUDGE_TRANSFER_FRAG's own file comment and smudgeGrain.ts). `patchX`/`patchGlY`/`patchSize` are the copied patch's own
   *  rect in this tile's GL pixel space, which is how a fragment finds
   *  itself in the imprint. */
  private drawTransferDab(
    tile: PaintTarget, dab: Dab, radius: number, carried: AccumulationBuffer,
    patchX: number, patchGlY: number, patchSize: number, mode: 'clear' | 'lay' | 'mask' | 'height', strength: number, wet?: WetStamp, original?: AccumulationBuffer, actual?:AccumulationBuffer,
  ): void {
    const { gl } = this
    const { buffer } = tile
    const paper = this.ctx.paper
    // A cold secondary tile clears its own framebuffer. Resolve it before
    // beginning the destination pass so allocation cannot redirect this dab.
    const secondaryTexture = wet?.secondary?.tile(wet.coverageBuffer ?? buffer).texture ?? paper.texture
    const brush = wet?.paint.brush, dual=brush?.behavior?.dual
    const tip=wet?.stamp.mask ?? brushTipSamplerId(brush?.tip)
    const dualTip=wet?.secondary ? undefined : wet?.stamp.dualMask ?? brushTipSamplerId(dual?.brush.tip)
    const dualGrain = !wet?.secondary && dual?.brush.texture?.application ? dual.brush.texture : undefined
    const mainImage = tip && brush?.tip.imageSampling ? nativeImageResource(tip,brush.tip,2*radius*(wet?.stamp.aspect ?? 1)) : undefined
    const imageRatio = dual && brush ? Math.max(.01,curveAt(dual.brush.sizeByPressure,dab.pressure)/Math.max(.01,curveAt(brush.sizeByPressure,dab.pressure))*(dual.brush.scatter?.scale ?? 1)) : 1
    const imageChildRx = Math.fround(Math.fround(Math.fround(radius)*Math.fround(wet?.stamp.aspect ?? 1))*imageRatio/(1+(wet?.stamp.edgeSoftness ?? 0)*.15))
    const childImage = dualTip && dual?.brush.tip.imageSampling ? nativeImageResource(dualTip,dual.brush.tip,2*imageChildRx) : undefined
    this.wetTextures.protect([...(tip ? [brushTextureResourceKey({id:tip,grain:false,colorPlanes:wet?.stamp.colorPlanes ?? (brush?.mixer?.paintThickness && wet?.stamp.gray ? [wet.stamp.gray,wet.stamp.gray,wet.stamp.gray] : undefined),nativeImage:mainImage,lookup32:brush?.tip.profile?.kind==='radialCurve'?true:undefined,gradientMap:wet?.gradientLut?true:undefined,gradientLut:wet?.gradientLut})] : []),...(brush?.texture ? [brushTextureResourceKey({id:brush.texture.id,grain:true,discrete:brush.texture.application?true:undefined})] : []),...(dualTip ? [brushTextureResourceKey({id:dualTip,grain:false,nativeImage:childImage,lookup32:dual?.brush.tip.profile?.kind==='radialCurve'?true:undefined})] : []),...(dualGrain ? [brushTextureResourceKey({id:dualGrain.id,grain:true,discrete:true})] : [])])
    const colorPlanes=wet?.stamp.colorPlanes ?? (brush?.mixer?.paintThickness && wet?.stamp.gray ? [wet.stamp.gray,wet.stamp.gray,wet.stamp.gray] as const : undefined)
    const tipTexture=tip ? this.wetTexture(tip,false,false,mainImage,brush?.tip.profile?.kind==='radialCurve'?true:undefined,colorPlanes,wet?.gradientLut) : paper.texture
    const grainTexture=brush?.texture ? this.wetTexture(brush.texture.id,true,!!brush.texture.application) : paper.texture
    const dualTexture=dualTip ? this.wetTexture(dualTip,false,false,childImage,dual?.brush.tip.profile?.kind==='radialCurve'?true:undefined) : paper.texture
    const dualGrainTexture=dualGrain ? this.wetTexture(dualGrain.id,true,true) : paper.texture
    if(mode==='height')buffer.beginAdditiveDraw()
    else if (wet) buffer.beginReplaceDraw()
    else if (mode === 'lay') buffer.beginAdditiveDraw()
    else buffer.beginErase()

    const primaryProfile = (brush?.tip.profile?.kind === 'standard' || brush?.tip.profile?.kind === 'radialCurve') ? brush.tip.profile : undefined
    const childProfile = !wet?.secondary && (dual?.brush.tip.profile?.kind === 'standard' || dual?.brush.tip.profile?.kind === 'radialCurve')
      ? dual.brush.tip.profile : undefined
    let binding = this.proceduralTransfer
    if (brush?.mixer?.algorithm) {
      this.prepareColorSmudge()
      binding=this.colorSmudgeTransfer
    } else if (primaryProfile?.kind==='radialCurve' || childProfile?.kind==='radialCurve') {
      this.prepareRadialCurves()
      binding=this.curveTransfer
    } else if (mainImage || childImage) {
      this.prepareIntegerImages()
      binding = this.imageTransfer
    } else if (primaryProfile || childProfile) {
      this.prepareProcedural()
      binding = this.proceduralTransfer
    } else binding = undefined
    gl.useProgram(binding?.program ?? this.transferProg)
    const u = binding?.uniforms ?? this.transferUni
    if (binding) {
      // Physical axes, not reconstructed inverse float matrices: the native
      // 10px stencil transition must not become 9.999999 after inversion.
      const ry = Math.fround(radius)
      const rx = Math.fround(ry * Math.fround(wet?.stamp.aspect ?? 1))
      const ratio = dual && brush ? Math.max(.01,
        curveAt(dual.brush.sizeByPressure, dab.pressure)
        / Math.max(.01, curveAt(brush.sizeByPressure, dab.pressure))
        * (dual.brush.scatter?.scale ?? 1)) : 1
      const childRx = Math.fround(rx * ratio / (1 + (wet?.stamp.edgeSoftness ?? 0) * .15))
      const childRy = Math.fround(childRx / (dual?.brush.tip.aspect ?? 1))
      gl.uniform4f(u.u_tipProcedural, ...brushTipProfileUniforms(primaryProfile ? brush?.tip : undefined))
      gl.uniform4f(u.u_dualProcedural, ...brushTipProfileUniforms(childProfile ? dual?.brush.tip : undefined))
      gl.uniform4f(u.u_tipProceduralGeometry, rx, ry,
        proceduralSampleCount(2 * Math.min(rx, ry), primaryProfile?.antialias ?? false), 0)
      gl.uniform4f(u.u_dualProceduralGeometry, childRx, childRy,
        proceduralSampleCount(2 * Math.min(childRx, childRy), childProfile?.antialias ?? false), 0)
      gl.uniform1f(u.u_dualProceduralAngle,
        dual?.brush.tip.rotation === 'fixed' ? dual.brush.tip.angle ?? 0 : wet?.stamp.angle ?? 0)
      // Only the native variant expands its quad; the legacy program and
      // compiler input retain their previous geometry and uniform traffic.
      // The stencil offsets lie in [0,1) on both world axes. A rotated
      // frame needs at most sqrt(2) local pixels on each axis. Retain the
      // nominal parent clipping quad when only its child is procedural.
      const wick = primaryProfile || mainImage ? Math.SQRT2 / Math.min(1, wet?.stamp.aspect ?? 1) : 0
      gl.uniform1f(u.u_wickPx, wick)
      gl.uniform1f(u.u_wickCap, Math.max(4, wick / radius))
    }
    if ((binding === this.imageTransfer || binding === this.curveTransfer || binding === this.colorSmudgeTransfer) && binding) {
      gl.uniform1f(u.u_tipImageEnabled,mainImage ? 1 : 0)
      gl.uniform1f(u.u_dualImageEnabled,childImage ? 1 : 0)
      const tipShift = mainImage ? nativeImageUVShift(mainImage, radius*(wet?.stamp.aspect ?? 1), radius, wet?.stamp.angle ?? 0, wet?.stamp.flipX ?? 1, wet?.stamp.flipY ?? 1) : [0,0] as const
      gl.uniform2f(u.u_tipImageUVShift, tipShift[0], tipShift[1])
      const dualShift = childImage && dual ? nativeImageUVShift(childImage, imageChildRx, imageChildRx/dual.brush.tip.aspect, dual.brush.tip.rotation==='fixed' ? dual.brush.tip.angle ?? 0 : wet?.stamp.angle ?? 0) : [0,0] as const
      gl.uniform2f(u.u_dualImageUVShift, dualShift[0], dualShift[1])
      if(mainImage && brush) gl.uniform4f(u.u_tipImageDomain,...nativeImageDomainUniform(nativeImageDomain(brush.tip,dab.x,dab.y,radius*(wet?.stamp.aspect ?? 1),radius,wet?.stamp.angle ?? 0),tile.originX,tile.originY,buffer.height))
      if(childImage && dual) gl.uniform4f(u.u_dualImageDomain,...nativeImageDomainUniform(nativeImageDomain(dual.brush.tip,dab.x,dab.y,imageChildRx,imageChildRx/dual.brush.tip.aspect,dual.brush.tip.rotation==='fixed' ? dual.brush.tip.angle ?? 0 : wet?.stamp.angle ?? 0),tile.originX,tile.originY,buffer.height))
    }
    gl.uniform2f(u.u_resolution, buffer.width, buffer.height)
    // Same world-space paper sampling every other dab shader uses — see
    // DAB_FRAG's own #141 comment for the origin-sign/world-size reasoning.
    const { w: paperTexW, h: paperTexH } = paper.worldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, actual?.texture ?? paper.texture)
    gl.uniform1i(u.u_paperHeightMap, 0)
    // Feedback returns before the paper pass: reuse sampler0 for actual layer.
    if(brush?.mixer?.algorithm)gl.uniform1f(u.u_projectionCanvas,actual?1:0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, carried.texture)
    gl.uniform1i(u.u_carried, 1)
    gl.uniform2f(u.u_patchOrigin, patchX, patchGlY)
    gl.uniform1f(u.u_patchSize, patchSize)
    gl.uniform1f(u.u_edgeBleed,wet?.stamp.edgeSoftness ?? 0)
    gl.uniform1f(u.u_wetEnabled,wet ? 1 : 0)
    // Foreground source-over precedes masked transfer. Dab opacity belongs
    // to both native stages; pickup belongs only to final transfer.
    let foregroundOpacity=brushSamplesCanvas(brush) && wet?.foregroundRate !== undefined
      ? clampNum(wet.foregroundRate*(wet.paint.strength)*(wet.paint.pressure ? curveAt(wet.paint.curve,dab.pressure) : 1)*dab.opacity*wet.stamp.opacityScale,0,1) : 0
    const modern=!!brush?.mixer?.algorithm
    const opacity=wet ? clampNum(wet.paint.strength*(wet.paint.pressure ? curveAt(wet.paint.curve,dab.pressure) : 1)*dab.opacity*wet.stamp.opacityScale,0,1) : 0
    const rates=colorSmudgeRates(opacity,wet?.step?.pickup ?? 0,wet?.foregroundRate ?? 0,!!brush?.mixer?.sampling)
    if(modern)foregroundOpacity=rates.color
    foregroundOpacity*=wet?.foregroundAlpha ?? 1
    gl.uniform1f(u.u_colorSmudgeTip,brush?.tip.color?1:0)
    const thickness=wet?.thickness ?? 1
    const heightAdjustment=!modern?1:brush?.mixer?.paintThickness?.mode==='overwrite' ? 1 : (wet?.step.pickup ?? 1)-.01+(1-((wet?.step.pickup ?? 1)-.01))*thickness
    if(modern)gl.uniform2f(u.u_colorSmudgeHeight,thickness,clampNum(opacity*heightAdjustment,0,1))
    gl.uniform4f(u.u_colorSmudge,modern?1:0,rates.smear,modern && brush?.mixer?.sampling && !brush.mixer.smearAlpha ? 1:0,mode==='height'?2:mode==='mask'?1:0)
    const foregroundColor=wet?.stamp.color ?? [0,0,0]
    gl.uniform4f(u.u_previousCanvasForeground,foregroundColor[0],foregroundColor[1],foregroundColor[2],foregroundOpacity)
    gl.uniform1f(u.u_previousCanvas,brushSamplesCanvas(brush) ? brush?.mixer?.smearAlpha ? 1 : 2 : 0)
    gl.uniform1f(u.u_tipKind,brush?.tip.kind === 'bitmap' ? 1 : 0)
    gl.uniform1f(u.u_hardness, brush?.tip.hardness ?? SMUDGE_HARDNESS)
    const threshold=brush?.tip.alphaThreshold, dualThreshold=brush?.behavior?.dual?.brush.tip.alphaThreshold
    gl.uniform3f(u.u_alphaThreshold,brushAlphaThresholdValue(threshold,wet?.stamp.sharpnessScale),threshold?.softness ?? 0,threshold ? 1 : 0)
    gl.uniform3f(u.u_dualAlphaThreshold,brushAlphaThresholdValue(dualThreshold,wet?.stamp.dualSharpnessScale),dualThreshold?.softness ?? 0,dualThreshold ? 1 : 0)
    const tipBounds=mainImage?.bounds ?? brush?.tip.maskBounds
    gl.uniform4f(u.u_tipBounds,tipBounds?.x ?? 0,tipBounds?.y ?? 0,tipBounds?.width ?? 1,tipBounds?.height ?? 1)
    const dualBounds=childImage?.bounds ?? dual?.brush.tip.maskBounds
    gl.uniform4f(u.u_dualBounds,dualBounds?.x ?? 0,dualBounds?.y ?? 0,dualBounds?.width ?? 1,dualBounds?.height ?? 1)
    for (const [unit,texture,name] of [
      [2,tipTexture,'u_tip'],
      [3,grainTexture,'u_wetGrain'],
      [4,dualTexture,'u_dual'],
      [5,original?.texture ?? carried.texture,'u_wetOriginal'],
      [7,dualGrainTexture,'u_dualGrain'],
    ] as const) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u[name],unit)
    }
    // Uploads bind on the current active unit; restore the carried sampler
    // after resolving all lazily-created masks and grain.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D,carried.texture)
    const blend=(name:typeof BRUSH_BLEND_MODES[number] | undefined):number=>Math.max(0,BRUSH_BLEND_MODES.indexOf(name ?? 'normal'))
    const dualAngle=(dual?.brush.tip.angle ?? 0)-(brush?.tip.angle ?? 0)
    gl.uniform1f(u.u_dualKind,dual && !wet?.secondary ? dual.brush.tip.kind === 'bitmap' ? 2 : 1 : 0)
    gl.uniform1f(u.u_dualBlend,blend(dual?.blendMode))
    gl.uniform4f(u.u_dualTransform,1+(wet?.stamp.edgeSoftness ?? 0)*.15,(1+(wet?.stamp.edgeSoftness ?? 0)*.15)*(brush?.tip.aspect ?? 1)/(dual?.brush.tip.aspect ?? 1),Math.cos(dualAngle),Math.sin(dualAngle))
    gl.activeTexture(gl.TEXTURE6)
    gl.bindTexture(gl.TEXTURE_2D,secondaryTexture)
    gl.uniform1i(u.u_secondaryCoverage,6)
    gl.uniform1f(u.u_secondaryEnabled,wet?.secondary?1:0)
    const primaryApplication=brushTextureApplication(brush?.texture,wet?.seed ?? 0,tile.originX,tile.originY)
    const secondaryApplication=brushTextureApplication(dualGrain,wet?.seed ?? 0,tile.originX,tile.originY,1)
    const maskScale=wet?.maskScale ?? 1
    if(maskScale!==1)for(const {mapping} of [primaryApplication,secondaryApplication]){
      mapping[0]*=maskScale;mapping[2]*=maskScale;mapping[3]*=maskScale
    }
    gl.uniform4f(u.u_textureApplication,...primaryApplication.application);gl.uniform4f(u.u_textureMapping,...primaryApplication.mapping)
    gl.uniform4f(u.u_dualTextureApplication,...secondaryApplication.application);gl.uniform4f(u.u_dualTextureMapping,...secondaryApplication.mapping)
    gl.uniform1f(u.u_dualGrainStrength,dualGrain?.strength ?? 0)
    const rendering=brush?.behavior?.rendering
    const modes=['lightGlaze','uniformGlaze','intenseGlaze','heavyGlaze','uniformBlend','intenseBlend','buildUp']
    gl.uniform4f(u.u_wetRender,0,rendering?.burntEdges ?? 0,rendering ? modes.indexOf(rendering.mode) : 6,rendering?.luminance ? 1 : 0)
    gl.uniform1f(u.u_wetBlend,blend(rendering?.blendMode))
    gl.uniform1f(u.u_burntBlend,blend(rendering?.burntEdgesMode))
    gl.uniform1f(u.u_wetGamma,rendering?.gammaCorrect ? 1 : 0)
    const g=brush?.behavior?.grain
    const period=Math.max(0.5,(brush?.texture?.periodPx ?? 1)*(g ? 0.1+g.zoom*1.9 : 1))
    const depth=(brush?.texture?.strength ?? 0)*(wet?.stamp.grainDepth ?? 1)
    gl.uniform1f(u.u_grainPeriod,period*maskScale)
    const random=(i:number):number=>brushDabRandom(wet?.seed ?? 0,i)
    gl.uniform1f(u.u_grainStrength,clampNum(Math.max(g?.depthMinimum ?? 0,depth)*(1-(g?.depthJitter ?? 0)*random(43)),0,1))
    gl.uniform1f(u.u_grainBlend,g ? Math.max(0,BRUSH_BLEND_MODES.indexOf(g.blendMode)) : 1)
    const movement=g?.mode === 'moving' ? 1-g.movement : 0
    const angle=(g?.rotation ?? 0)*Math.PI
    const jitter=g?.offsetJitter ? random(42)*period : 0
    const grainDab=wet?.maskSourceDab ?? dab
    gl.uniform4f(u.u_grainTransform,(-grainDab.x*movement+jitter)*maskScale+tile.originX*(maskScale-1),(-grainDab.y*movement+jitter)*maskScale+tile.originY*(maskScale-1),Math.cos(angle),Math.sin(angle))
    gl.uniform2f(u.u_grainTone,g?.brightness ?? 0,clampNum((g?.contrast ?? 0)+(wet?.stamp.wetGrade ?? 0),-1,1))
    gl.uniform2f(u.u_wetWorldOrigin,tile.originX,tile.originY+buffer.height)
    const phase=brushDabSeed(dab.x,dab.y,dab.pressure)
    gl.uniform2f(u.u_wetRoundPhase,phase&7,(phase>>>3)&7)
    gl.uniform2f(u.u_flip,wet?.stamp.flipX ?? 1,wet?.stamp.flipY ?? 1)
    gl.uniform1f(u.u_mode, mode === 'lay' ? 1.0 : 0.0)
    gl.uniform1f(u.u_strength, strength)
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_paperFillThreshold, paper.fillThreshold)
    gl.uniform1f(u.u_paperFillCap, paper.fillCap)
    // Both halves of the lerp read the same value, like every other uniform
    // here — see this method's own doc comment on why they must agree.
    gl.uniform1f(u.u_grainRelief, smudgeGrainRelief(dab.pressure))

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
    const position=binding?.position ?? this.transferPosLoc
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, wet?.stamp.angle ?? 0)
    gl.uniform1f(u.u_aspectRatio, wet?.stamp.aspect ?? 1)
    if(wet?.smearPlacement) {
      const rect=wet.smearPlacement.rect
      const left=Math.max(0,rect.minX-tile.originX),right=Math.min(buffer.width,rect.maxX-tile.originX)
      const bottom=Math.max(0,buffer.height-(rect.maxY-tile.originY)),top=Math.min(buffer.height,buffer.height-(rect.minY-tile.originY))
      const enabled=gl.isEnabled(gl.SCISSOR_TEST)
      const saved=enabled ? gl.getParameter(gl.SCISSOR_BOX) as Int32Array : undefined
      const x=saved ? Math.max(left,saved[0]) : left,y=saved ? Math.max(bottom,saved[1]) : bottom
      const x2=saved ? Math.min(right,saved[0]+saved[2]) : right,y2=saved ? Math.min(top,saved[1]+saved[3]) : top
      gl.enable(gl.SCISSOR_TEST);gl.scissor(x,y,Math.max(0,x2-x),Math.max(0,y2-y))
      try { gl.drawArrays(gl.TRIANGLES,0,6) }
      finally { if(saved)gl.scissor(saved[0],saved[1],saved[2],saved[3]);if(!enabled)gl.disable(gl.SCISSOR_TEST) }
    }else gl.drawArrays(gl.TRIANGLES, 0, 6)

    buffer.endDraw()
  }

  hasPreparedTexture(resource: BrushPreparationResource): boolean {
    return this.wetTextures.get(brushTextureResourceKey(resource)) !== undefined
  }

  prepareTexture(group: readonly BrushPreparationResource[], resource: BrushPreparationResource): void {
    if(group.some(entry=>entry.nativeImage || entry.lookup32)) assertNativeImageAdmission(group,this.imageDimensionLimit())
    this.wetTextures.protect(group.map(brushTextureResourceKey))
    this.wetTexture(resource.id,resource.grain,!!resource.discrete,resource.nativeImage,resource.lookup32,resource.colorPlanes,resource.gradientLut)
  }

  /** Byte-bounded residency; active samplers remain protected across draws. */
  private wetTexture(id: TipMaskId | BrushTextureId, grain: boolean, discrete = false, nativeImage?: NativeImageResource, lookup32?: true, colorPlanes?:readonly [string,string,string],gradientLut?:string): WebGLTexture {
    const key = brushTextureResourceKey({id,grain,discrete:discrete?true:undefined,nativeImage,lookup32,colorPlanes,gradientMap:gradientLut?true:undefined,gradientLut}), cached = this.wetTextures.get(key)
    if(cached)return cached
    if(colorPlanes){
      const alpha=importedAssetPixels(id),side=Math.sqrt(alpha.length)
      const pixels=gradientLut ? colorSmudgeGradientTipPixels(alpha,importedAssetPixels(colorPlanes[0]),gradientLut) : colorSmudgeTipPixels(alpha,colorPlanes.map(importedAssetPixels))
      const entry=uploadBrushTexture(this.gl,[pixels],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,false,{width:side,height:side})
      this.wetTextures.put(key,entry.texture,entry.bytes)
      return entry.texture
    }
    if (lookup32) {
      const entry=uploadBrushTexture(this.gl,[importedAssetPixels(id)],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,true)
      this.wetTextures.put(key,entry.texture,entry.bytes)
      return entry.texture
    }
    if(nativeImage) {
      const pixels=this.imageMips.get(key,()=>[nativeImagePixels(nativeImage,importedAssetPixels(id))])[0]
      const entry=uploadBrushTexture(this.gl,[pixels],this.gl.ALPHA,this.gl.CLAMP_TO_EDGE,false,nativeImage)
      this.wetTextures.put(key,entry.texture,entry.bytes)
      return entry.texture
    }
    const levels=grain ? brushTextureMips(id as BrushTextureId) : tipMaskMips(id as TipMaskId)
    const entry=uploadBrushTexture(this.gl,levels,this.gl.ALPHA,this.gl.CLAMP_TO_EDGE,discrete)
    this.wetTextures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }

  /** Smudge's own size-keyed free list (patches *and* imprints — both are
   *  square, patch-sized and LINEAR-filtered, and a stroke cycles two or
   *  three of them per dab). Kept separate from AreaOps' scratchPool — see
   *  the field's own comment. */
  private acquireScratch(size: number): AccumulationBuffer {
    return this.scratchPool.acquire(size, size)
  }

  private releaseScratch(buf: AccumulationBuffer): void {
    this.scratchPool.release(buf)
  }
}
