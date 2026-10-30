import { CANONICAL_MATERIAL_PROFILE, CANONICAL_SOURCE_MATERIAL_PROFILE, canonicalDefaultAutoSourcePin, canonicalDefaultAutoCost, CANONICAL_STROKE_RASTER_PROFILE, type CanonicalMaterialAsset, type CanonicalDefaultAutoSource, type AnyCanonicalMaterialFrame } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import { planCanonicalTargets } from './CanonicalTargetPlan'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { advanceSourcePrimaryComposition, createSourcePrimaryComposition, type SourcePrimaryCompositionContext, type SourcePrimaryCompositionResult, type SourcePrimaryCompositionState } from '../presets/sourcePrimaryComposition'
import { runBrushGlBatch } from './BrushGlBatch'
import { saveBrushGlState } from './BrushGlState'
import { bindCanonicalLayerTargets } from './CanonicalLayerTargets'
import type { CanonicalMaskSourceBank } from './CanonicalMaskSourceBank'
import type { CanonicalOwnedRgba8Target, CanonicalRgba8CompositePass, CanonicalRgba8SourceView } from './CanonicalRgba8CompositePass'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
import type { AnyTransformedMaskRequest, TransformedMaskPrepass } from './TransformedMaskPrepass'

/** Both authoring and history adapters submit the SAME already-decoded frame.
 * No pointer, sensor, author DTO, random source or mutable tool state enters here. */
export interface CanonicalFrameSubmission {
  readonly gestureId: string
  readonly layerId: string
  readonly layerEpoch: number
  readonly ordinal: number
  readonly frame: AnyCanonicalMaterialFrame
  readonly assets: readonly CanonicalMaterialAsset[]
  readonly rgb: readonly [number, number, number]
  readonly composition: SourcePrimaryCompositionContext
}
/** Reference profile is retained for recorded diagnostic corpora only. The
 * shared canonical wire profile requires the installed fused scalar kernels. */
export type CanonicalExecutorRasterProfile = 'reference-scalar-f32-rne-v1' | typeof CANONICAL_STROKE_RASTER_PROFILE
export interface CanonicalFrameExecutorOptions {
  /** Pinned by the room/capability adapter, never selected from mutable tools.
   * No default: a caller must explicitly prepare the matching shader pair. */
  readonly rasterProfile: CanonicalExecutorRasterProfile
  /** Trusted verified-descriptor binding, fixed for this executor; not a client grant. */
  readonly autoSource?: CanonicalDefaultAutoSource
  /** Authoritative room page, never viewport. Absent retains the closed infinite-page QA API. */
  readonly pageBounds?: Readonly<WorldRect> | null
  readonly bank?: CanonicalMaskSourceBank
  readonly prepass: TransformedMaskPrepass
  readonly composite: CanonicalRgba8CompositePass
  readonly scratch: RibbonScratchPool
  readonly layer: (id: string) => { readonly buffer: TiledLayerBuffer; readonly epoch: number }
  /** Existing engine GPU fence. Account scratch-pool live AND idle bytes there;
   * release removes this reservation, not the pool's actual allocation charge. */
  readonly reserveTransient: (bytes: number) => () => void
  readonly changed: (layerId: string) => void
  /** Must synchronously mark unsettled/block checkpoints until trusted rebuild.
   * The executor will never retry a possibly partly-written frame. */
  readonly poison: (layerId: string, reason: unknown) => void
}
interface TilePosition { x: number; y: number; width: number; height: number; writeBounds?: Readonly<WorldRect> }
interface WashTile extends TilePosition {
  original: AccumulationBuffer
  local: AccumulationBuffer
  lifetime: CanonicalOwnedRgba8Target['lifetime']
}
interface Work {
  input: CanonicalFrameSubmission
  result: SourcePrimaryCompositionResult
  sourceKeys: readonly (string | undefined)[]
  draw: number
  tile: number
  paintPart: number
  tiles?: readonly TilePosition[]
  present: number
  part: number
  presentTiles?: readonly WashTile[]
  releaseMetadata: () => void
}
const int = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min
const sameContext = (a: SourcePrimaryCompositionContext, b: SourcePrimaryCompositionContext) =>
  a.mode === b.mode && a.alphaDarken === b.alphaDarken && a.outerResourceOpacity === b.outerResourceOpacity && a.outerBlend === b.outerBlend
const key = (t: TilePosition) => `${t.x}:${t.y}`
const rect = (t: TilePosition) => ({ minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height })

/** Opt-in production layer service, not wired to engine operation transport yet.
 * One ordered cursor; synchronous leases only. Checkpoint readiness is explicit.
 * Caller serializes ALL writes to the gesture's layer, including peer writes. */
export class CanonicalFrameExecutor {
  private readonly options: CanonicalFrameExecutorOptions
  private readonly maskCapacity: Readonly<{width:number;height:number;epoch:object}>
  private readonly compositeCapacity: Readonly<{width:number;height:number;epoch:object}>
  private readonly gl: WebGLRenderingContext
  private readonly queue: Work[] = []
  private readonly washes = new Map<string, WashTile>()
  private readonly admittedTiles = new Map<string, TilePosition>()
  private readonly admissionReleases = new Set<() => void>()
  private planned?: SourcePrimaryCompositionState
  private gesture?: { id: string; layerId: string; epoch: number; buffer: TiledLayerBuffer; rgb: readonly [number, number, number]; profile: AnyCanonicalMaterialFrame['profile'] }
  private failed = false
  private readonly cleanupErrors: unknown[] = []
  private advancing = false

  constructor(options: CanonicalFrameExecutorOptions) {
    if (options.rasterProfile !== 'reference-scalar-f32-rne-v1' && options.rasterProfile !== CANONICAL_STROKE_RASTER_PROFILE) throw new TypeError('Unsupported canonical executor raster profile')
    const operations = options.rasterProfile === CANONICAL_STROKE_RASTER_PROFILE
      ? ['alphaDarken32FusedScalar', 'over32FusedScalar'] as const : ['alphaDarken32', 'over32'] as const
    if (!options.composite.supportsOperations(operations)) throw new Error('Canonical executor raster profile was not prepared')
    const a = options.prepass.brushGlBatchInfo(), b = options.composite.brushGlBatchInfo()
    if (a.gl !== b.gl || a.cache !== b.cache || a.cpu !== b.cpu) throw new Error('Canonical executor services must share budgets and context')
    planCanonicalTargets({minX:0,minY:0,maxX:0,maxY:0},options.pageBounds ?? null,1,1)
    this.maskCapacity=options.prepass.preparedCapacity();
    this.compositeCapacity=options.composite.preparedCapacity();
    this.options = Object.freeze({ ...options, pageBounds: options.pageBounds ? Object.freeze({...options.pageBounds}) : null, autoSource: options.autoSource ? canonicalDefaultAutoSourcePin(options.autoSource) : undefined })
    this.gl = a.gl
  }

  get pending(): boolean { return this.queue.length !== 0 }
  get checkpointReady(): boolean { return !this.failed && !this.pending && !this.gesture }
  get poisoned(): boolean { return this.failed }
  /** Additional cleanup/notification errors never replace a primary draw error. */
  get cleanupFailures(): readonly unknown[] { return Object.freeze([...this.cleanupErrors]) }

  /** Entire metadata admission before tile allocation, reservations or pixels.
   * At most eight accepted frames are retained. Inputs are copied, so later
   * caller mutation cannot relabel a queued definition, pigment or opacity. */
  enqueue(input: CanonicalFrameSubmission): void {
    if (this.failed || this.advancing) throw new Error('Canonical executor is poisoned or busy')
    if (this.queue.length >= 8) throw new RangeError('Canonical frame queue is full')
    if (![CANONICAL_MATERIAL_PROFILE, CANONICAL_SOURCE_MATERIAL_PROFILE].includes(input?.frame?.profile)) throw new TypeError('Canonical executor requires accepted material profile')
    if (!input || !input.gestureId || !input.layerId || !int(input.layerEpoch) || !int(input.ordinal)
      || !Array.isArray(input.rgb) || input.rgb.length !== 3 || !input.rgb.every(n => int(n) && n <= 255)) throw new TypeError('Invalid canonical frame identity/pigment')
    this.assertPrepared();
    const { buffer, epoch } = this.options.layer(input.layerId)
    if (epoch !== input.layerEpoch || buffer.tileWidth > 4096 || buffer.tileHeight > 4096 || buffer.pixelEncoding !== 'straight-rgba8') throw new Error('Stale or non-straight canonical layer')
    if (!this.options.prepass.isReady() || !this.options.composite.isReady()) throw new Error('Canonical services are not prepared')
    if (this.gesture && (this.gesture.profile !== input.frame.profile || this.gesture.id !== input.gestureId || this.gesture.layerId !== input.layerId || this.gesture.epoch !== input.layerEpoch
      || this.gesture.rgb.some((n, i) => n !== input.rgb[i]) || !sameContext(this.planned!.context, input.composition))) throw new Error('Canonical gesture interleaving or context change')
    if (!input.frame || input.frame.draws.length > 800 || input.frame.definitions.length > 800 || input.frame.fences.length > 2404 || input.assets.length > 512) throw new RangeError('Canonical frame exceeds decoder limits')
    const initial = this.planned ?? createSourcePrimaryComposition(input.composition).state
    const result = advanceSourcePrimaryComposition(initial, { ordinal: input.ordinal, frame: input.frame })
    const hasImageDefinitions = input.frame.definitions.some(r => !('kind' in r) || r.kind !== 'defaultAuto')
    const hasImage = hasImageDefinitions || input.frame.profile === CANONICAL_MATERIAL_PROFILE || (!input.frame.definitions.length && !this.options.autoSource)
    if (hasImage && !this.options.bank?.isReady()) throw new Error('Canonical image bank is not prepared')
    if (!hasImage && input.assets.length) throw new TypeError('Auto-only frame must not supply image assets')
    const prepared = hasImage ? this.options.bank!.preparedResources() : []
    const sourceKeys = input.frame.definitions.map(recipe => {
      if (recipe.width > this.maskCapacity.width || recipe.height > this.maskCapacity.height) throw new RangeError('Canonical material exceeds prepared capacity')
      if ('kind' in recipe && recipe.kind === 'defaultAuto') {
        if (!this.options.autoSource) throw new TypeError('Canonical auto source is not trusted')
        canonicalDefaultAutoCost(recipe, this.options.autoSource)
        return undefined
      }
      const asset = input.assets.find(a => a.id === recipe.asset)
      if (!asset) throw new Error('Canonical frame asset is not pinned')
      const m = canonicalTransformedMaskMetadata(recipe, asset)
      if (recipe.width > this.maskCapacity.width || recipe.height > this.maskCapacity.height) throw new RangeError('Canonical material exceeds prepared capacity')
      const source = prepared.find(p => p.canonical?.asset.id === asset.id && p.canonical.index === m.index
        && p.canonical.asset.size === asset.size && p.canonical.asset.x === asset.x && p.canonical.asset.y === asset.y
        && p.canonical.asset.width === asset.width && p.canonical.asset.height === asset.height)
      if (!source) throw new Error('Canonical frame source level is not prepared')
      return source.key
    })
    // Decoder caps definitions/draws. Reserve retained DTO/plan metadata in the
    // EXISTING CPU cache (estimate, not a hard JavaScript-heap guarantee).
    const bytes = 1024 + input.frame.definitions.length * 1024 + input.frame.draws.length * 512 + input.frame.fences.length * 128 + input.assets.length * 256
    const newTiles = new Map<string, TilePosition>(), frameTargets = new Map<string, TilePosition>()
    // Wash presentation/commit revisits ALL accumulated tiles, including an
    // empty gesture-end frame. Each can require recovery after a yield.
    if (result.commands.length) for (const [k, tile] of this.admittedTiles) frameTargets.set(k, tile)
    for (const d of result.draws) {
      const recipe = input.frame.definitions[d.definition]
      for (const t of this.targetPositions({ minX: d.x, minY: d.y, maxX: d.x + recipe.width, maxY: d.y + recipe.height },buffer)) {
        frameTargets.set(key(t), t)
        if (frameTargets.size > 64) throw new RangeError('Canonical frame exceeds bounded target union')
        if (input.composition.mode === 'wash' && !this.admittedTiles.has(key(t))) newTiles.set(key(t), t)
      }
    }
    if (newTiles.size + this.admittedTiles.size > 64) throw new RangeError('Canonical wash exceeds bounded tile count')
    const releaseMetadata = this.options.prepass.brushGlBatchInfo().cpu.reserve(bytes)
    let releaseWashMetadata: (() => void) | undefined, releaseBudget: (() => void) | undefined, releaseTargetBudget: (() => void) | undefined
    try {
      // Reserve an upper bound for the whole target union, not just wash pairs.
      // Even currently resident targets may be evicted before this frame runs.
      // The token lasts through this frame; actual target storage remains owned
      // by the layer and must still be charged by the engine after release.
      if (frameTargets.size) releaseTargetBudget = this.options.reserveTransient([...frameTargets.values()].reduce((sum, t) => sum + t.width * t.height * 4, 0))
      // Admit the entire frame union BEFORE any tile creation or pixel write.
      // Pool accounting stays authoritative; caller applies the existing fence.
      if (newTiles.size) {
        releaseWashMetadata = this.options.prepass.brushGlBatchInfo().cpu.reserve(newTiles.size * 512)
        releaseBudget = this.options.reserveTransient([...newTiles.values()].reduce((sum, t) => sum + t.width * t.height * 8, 0))
      }
      // Leave bounded headroom for the existing batch capsule plus <=8 staged
      // commands. Never let queued DTOs predictably consume its next turn.
      const info = this.options.prepass.brushGlBatchInfo(), other = this.options.composite.brushGlBatchInfo()
      const resources = new Set([...info.resources, ...other.resources].map(r => r.key)).size
      if (info.cpu.reservedBytes + (input.frame.definitions.some(r => 'kind' in r && r.kind === 'defaultAuto') ? 82432 : 65536) + resources * 128 > info.cpu.budgetBytes) throw new RangeError('Canonical queue exceeds shared CPU work headroom')
      const saved: CanonicalFrameSubmission = structuredClone(input)
      this.queue.push({ input: saved, result, sourceKeys, draw: 0, tile: 0, paintPart: 0, present: 0, part: 0,
        releaseMetadata: () => { try { releaseMetadata() } finally { releaseTargetBudget?.() } } })
      for (const [k, tile] of newTiles) this.admittedTiles.set(k, tile)
      if (releaseBudget) {
        const gpu = releaseBudget, cpu = releaseWashMetadata!
        this.admissionReleases.add(() => { try { gpu() } finally { cpu() } })
      }
      this.gesture ??= { id: input.gestureId, layerId: input.layerId, epoch: input.layerEpoch, buffer, rgb: [input.rgb[0], input.rgb[1], input.rgb[2]], profile: input.frame.profile }
      this.planned = result.state
    } catch (error) {
      if (releaseTargetBudget) this.cleanup(releaseTargetBudget)
      if (releaseBudget) this.cleanup(releaseBudget)
      if (releaseWashMetadata) this.cleanup(releaseWashMetadata)
      this.cleanup(releaseMetadata)
      throw error
    }

  }

  /** One synchronous cooperative batch. Call again from the existing engine
   * drain after yielding; this service creates no RAF, promise or scheduler. */
  advance(): { pending: boolean; checkpointReady: boolean } {
    if (this.failed || this.advancing) throw new Error('Canonical executor is poisoned or busy')
    const work = this.queue[0]
    if (!work) return { pending: false, checkpointReady: this.checkpointReady }
    this.advancing = true
    try {
      const turnStarted = performance.now();
      this.assertPrepared();
      const layer = this.currentLayer(work)
      // Logical composition was already advanced once at admission; clipping
      // only removes pixel work, without inventing or dropping source inputs.
      let clipped=0;
      while (work.draw < work.result.draws.length) {
        const d=work.result.draws[work.draw], r=work.input.frame.definitions[d.definition];
        if (this.targetPositions({minX:d.x,minY:d.y,maxX:d.x+r.width,maxY:d.y+r.height},layer).length) break;
        work.draw++; work.tile=0; work.paintPart=0; work.tiles=undefined;
        if (++clipped % 16 === 0 && performance.now()-turnStarted >= 4) return { pending:true, checkpointReady:false };
      }
      if (work.draw === work.result.draws.length && (!work.result.commands.length || !this.washes.size)) {
        // Source framing/opacity history was advanced at admission. No target
        // exists to present/commit: finish only ledger/reservation ownership.
        this.finish(work);
        return { pending:this.pending, checkpointReady:this.checkpointReady };
      }
      if (!this.prepareAuto(work,turnStarted) || performance.now()-turnStarted >= 4) return { pending: true, checkpointReady: false }
      // Resolve/copy may touch GL before entering a batch: retain and restore
      // the caller's complete state around the whole synchronous service turn.
      const info = this.options.prepass.brushGlBatchInfo()
      const restore = saveBrushGlState(info.gl, info.attributes, info.instancing, info.vertexArrays, 3)
      try {
        info.gl.activeTexture(info.gl.TEXTURE0)
        // Tile resolution/allocation happens outside the GL batch. The batch
        // then acquires exact current target handles and releases before yield.
        if (work.draw < work.result.draws.length) this.paint(work, layer)
        else this.present(work, layer)
      } finally { if (!this.gl.isContextLost()) restore() }
      if (work.draw === work.result.draws.length && (!work.result.commands.length || work.presentTiles && work.present === work.presentTiles.length)) this.finish(work)
    } catch (error) {
      this.fail(error, this.gl.isContextLost())
      throw error
    } finally { this.advancing = false }
    return { pending: this.pending, checkpointReady: this.checkpointReady }
  }

  private assertPrepared(): void {
    const mask=this.options.prepass.preparedCapacity(), composite=this.options.composite.preparedCapacity();
    for (const [current,pinned] of [[mask,this.maskCapacity],[composite,this.compositeCapacity]]) {
      if(current.width!==pinned.width||current.height!==pinned.height||current.epoch!==pinned.epoch)
        throw new Error('Canonical prepared service capacity/epoch changed');
    }
  }

  private targetPositions(footprint: Readonly<WorldRect>, layer: TiledLayerBuffer): TilePosition[] {
    return planCanonicalTargets(footprint,this.options.pageBounds ?? null,layer.tileWidth,layer.tileHeight).tiles.map(t => ({
      x:t.storage.minX,y:t.storage.minY,width:t.storage.maxX-t.storage.minX,height:t.storage.maxY-t.storage.minY,writeBounds:t.paint }));
  }

  private maskRequest(work: Work, draw: number): AnyTransformedMaskRequest {
    const d = work.result.draws[draw], recipe = work.input.frame.definitions[d.definition];
    const common = { owner: this, role: 'primary', rect: { x:d.x, y:d.y, width:recipe.width, height:recipe.height }, profile:'neon4-summed-wordsize64' as const };
    if ('kind' in recipe && recipe.kind === 'defaultAuto') {
      if (!this.options.autoSource) throw new TypeError('Canonical auto source is not trusted');
      return { ...common, material: { kind:'canonicalAuto', recipe, trustedSource:this.options.autoSource } };
    }
    if (!this.options.bank?.isReady()) throw new Error('Canonical image bank is not prepared');
    const source = this.options.bank.resources().find(s => s.key === work.sourceKeys[d.definition]);
    const asset = work.input.assets.find(a => a.id === recipe.asset);
    if (!source || !asset) throw new Error('Canonical prepared source was evicted');
    return { ...common, material: { kind:'canonical', recipe, asset }, source };
  }
  private prepareAuto(work: Work, start: number): boolean {
    if (work.draw >= work.result.draws.length) return true;
    const d=work.result.draws[work.draw], recipe=work.input.frame.definitions[d.definition];
    if (!('kind' in recipe) || recipe.kind !== 'defaultAuto') return true;
    if (this.options.prepass.beginAutoGeneration(this.maskRequest(work,work.draw))) return performance.now()-start < 4;
    if (performance.now()-start >= 4) return false;
    do { if(this.options.prepass.advanceAutoGeneration(64).done) return performance.now()-start < 4; }
    while(performance.now()-start < 4);
    return false;
  }

  private currentLayer(work: Work): TiledLayerBuffer {
    const current = this.options.layer(work.input.layerId)
    if (current.epoch !== work.input.layerEpoch || current.buffer !== this.gesture?.buffer || current.buffer.pixelEncoding !== 'straight-rgba8') throw new Error('Canonical layer changed while queued')
    return current.buffer
  }

  private paint(work: Work, layer: TiledLayerBuffer): void {
    // Plan at most eight commands before entering the synchronous capsule.
    // These temporary handles are retained only for this turn, never a yield.
    const tasks: { draw: number; tile: number; part: number; parts: number; writeBounds: Readonly<WorldRect>; tiles: readonly TilePosition[]; target: PaintTarget; wash?: WashTile }[] = []
    const stagingReleases: (() => void)[] = []
    try {
      let draw = work.draw, tile = work.tile, part = work.paintPart, positions = work.tiles
      while (tasks.length < 8 && draw < work.result.draws.length) {
        const d = work.result.draws[draw], r = work.input.frame.definitions[d.definition]
        const firstRecipe = work.input.frame.definitions[work.result.draws[work.draw].definition];
        if (draw !== work.draw && (('kind' in r && r.kind === 'defaultAuto') || ('kind' in firstRecipe && firstRecipe.kind === 'defaultAuto'))) break;
        if (!positions) {
          positions = this.targetPositions({ minX:d.x,minY:d.y,maxX:d.x+r.width,maxY:d.y+r.height },layer)
        }
        if (!positions.length) { draw++; tile=0; part=0; positions=undefined; continue; }
        const position = positions[tile], target = this.resolveTile(layer, position)
        const bound = bindCanonicalLayerTargets(layer, [target])[0]
        stagingReleases.push(bound.lifetime.lease())
        const wash = d.controls.kind === 'localAlphaDarken' ? this.washTile(position, target, bound) : undefined
        const paint=position.writeBounds ?? rect(position);
        const columns=Math.ceil((paint.maxX-paint.minX)/this.compositeCapacity.width);
        const rows=Math.ceil((paint.maxY-paint.minY)/this.compositeCapacity.height), parts=columns*rows;
        const x=paint.minX+(part%columns)*this.compositeCapacity.width;
        const y=paint.minY+Math.floor(part/columns)*this.compositeCapacity.height;
        const writeBounds={minX:x,minY:y,maxX:Math.min(paint.maxX,x+this.compositeCapacity.width),maxY:Math.min(paint.maxY,y+this.compositeCapacity.height)};
        tasks.push({ draw, tile, part, parts, writeBounds, tiles: positions, target, wash })
        if(++part===parts){part=0;if (++tile === positions.length) { draw++; tile = 0; positions = undefined }}
      }
      if (!tasks.length) return;
      const bound = bindCanonicalLayerTargets(layer, tasks.map(t => t.target))
      runBrushGlBatch({ participants: [this.options.prepass, this.options.composite], owners: [bound[0].lifetime, ...tasks.flatMap(t => t.wash ? [t.wash.lifetime] : [])] }, frame => {
        for (let i = 0; i < tasks.length; i++) {
          if (this.currentLayer(work) !== layer) throw new Error('Canonical layer changed during batch')
          const task = tasks[i], d = work.result.draws[task.draw]
          const output = task.wash ? this.scratchTarget(task.wash.local, task.tiles[task.tile], task.wash.lifetime) : bound[i]
          const group = this.options.prepass.resolveGroup([this.maskRequest(work,task.draw)], frame)
          try {
            const fused = this.options.rasterProfile === CANONICAL_STROKE_RASTER_PROFILE
            const operation = d.controls.kind === 'localAlphaDarken'
              ? fused
                ? { kind: 'alphaDarken32FusedScalar' as const, control: { profile: CANONICAL_STROKE_RASTER_PROFILE, variant: d.controls.variant, opacity: d.controls.opacity, averageOpacity: d.controls.averageOpacity, flow: d.controls.flow } }
                : { kind: 'alphaDarken32' as const, control: { profile: 'optimized32-scalar-f32-rne-v1' as const, variant: d.controls.variant, opacity: d.controls.opacity, averageOpacity: d.controls.averageOpacity, flow: d.controls.flow } }
              : this.overOperation(d.controls.opacity)
            this.options.composite.drawSource({ source: { kind: 'maskRgb', view: group.views[0], rgb: work.input.rgb }, target: output, operation, writeBounds: task.writeBounds }, frame)
            work.draw = task.draw; work.tiles = task.tiles; work.tile = task.tile; work.paintPart=task.part+1;
            if(work.paintPart===task.parts){
              work.paintPart=0;work.tile++;
              if (work.tile === task.tiles.length) { work.draw++; work.tile = 0; work.tiles = undefined }
            }
          } finally { group.release() }
          if (!task.wash) {
            layer.markContentPainted(task.writeBounds)
            this.options.changed(work.input.layerId)
          }
          if (frame.shouldYield) break
        }
      })
    } finally { for (const release of stagingReleases.reverse()) release() }
  }

  private resolveTile(layer: TiledLayerBuffer, t: TilePosition): PaintTarget {
    const targets = layer.resolveForPaint(rect(t))
    const target = targets.find(p => p.originX === t.x && p.originY === t.y && p.buffer.width === t.width && p.buffer.height === t.height)
    if (!target) throw new Error('Canonical tile geometry changed')
    return target
  }

  private washTile(position: TilePosition, target: PaintTarget, bound: CanonicalOwnedRgba8Target): WashTile {
    const existing = this.washes.get(key(position))
    if (existing) return existing
    if (this.washes.size >= 64) throw new RangeError('Canonical wash exceeds bounded tile count')
    if (!this.admittedTiles.has(key(position))) throw new Error('Canonical wash tile was not admitted')
    let original: AccumulationBuffer | undefined, local: AccumulationBuffer | undefined
    const releaseTarget = bound.lifetime.lease()
    try {
      original = this.options.scratch.acquire(position.width, position.height, 'straight-rgba8')
      local = this.options.scratch.acquire(position.width, position.height, 'straight-rgba8')
      target.buffer.copyTo(original)
      const gl = this.options.prepass.brushGlBatchInfo().gl
      gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true)
      local.clear()
      const tile = { ...position, original, local, lifetime: { kind: 'external' as const, owner: {}, lease: () => () => {} } }
      this.washes.set(key(position), tile)
      return tile
    } catch (error) {
      if (local) { const buffer = local; this.cleanup(() => this.options.scratch.release(buffer)) }
      if (original) { const buffer = original; this.cleanup(() => this.options.scratch.release(buffer)) }
      throw error
    } finally { releaseTarget() }
  }

  private scratchTarget(buffer: AccumulationBuffer, t: TilePosition, lifetime: CanonicalOwnedRgba8Target['lifetime']): CanonicalOwnedRgba8Target {
    return { brand: 'canonical-straight-rgba8-v1', texture: buffer.texture, framebuffer: buffer.fbo,
      width: t.width, height: t.height, originX: t.x, originY: t.y,
      lifetime }
  }

  private present(work: Work, layer: TiledLayerBuffer): void {
    if (!work.result.commands.length) return
    work.presentTiles ??= [...this.washes.values()]
    const command = work.result.commands[0]
    if (command.kind === 'beginWash') throw new Error('Unexpected queued wash initialization')
    const tasks: { tile: WashTile; index: number; part: number; columns: number; rows: number; target: PaintTarget }[] = []
    const releases: (() => void)[] = []
    try {
      let index = work.present, part = work.part
      while (tasks.length < 8 && index < work.presentTiles.length) {
        const tile = work.presentTiles[index]
        const columns = Math.ceil(tile.width / this.compositeCapacity.width), rows = Math.ceil(tile.height / this.compositeCapacity.height)
        const target = this.resolveTile(layer, tile)
        releases.push(layer.retainTargets([target]))
        tasks.push({ tile, index, part, columns, rows, target })
        if (++part === rows * columns) { part = 0; index++ }
      }
      if (!tasks.length) return
      const bound = bindCanonicalLayerTargets(layer, tasks.map(t => t.target))
      runBrushGlBatch({ participants: [this.options.prepass, this.options.composite], owners: [bound[0].lifetime, ...tasks.map(t => t.tile.lifetime)] }, frame => {
        for (let i = 0; i < tasks.length; i++) {
          if (this.currentLayer(work) !== layer) throw new Error('Canonical layer changed during batch')
          const task = tasks[i], tile = task.tile
          const x = task.part % task.columns * this.compositeCapacity.width, y = Math.floor(task.part / task.columns) * this.compositeCapacity.height
          const w = Math.min(this.compositeCapacity.width, tile.width - x), h = Math.min(this.compositeCapacity.height, tile.height - y)
          const original = this.scratchTarget(tile.original, tile, tile.lifetime)
          const view: CanonicalRgba8SourceView = { brand: 'canonical-straight-rgba8-view-v1', texture: tile.local.texture,
            textureWidth: tile.width, textureHeight: tile.height, rect: { x: tile.x + x, y: tile.y + y, width: w, height: h },
            bounds: { x: x / tile.width, y: (tile.height - y - h) / tile.height, width: w / tile.width, height: h / tile.height },
            mirror: { horizontal: false, vertical: false }, rowOrder: 'bottomAtV0', residency: tile.lifetime }
          this.options.composite.drawSource({ source: { kind: 'straightRgba8', view }, target: bound[i], readDestination: original,
            operation: this.overOperation(command.opacity), writeBounds: this.options.pageBounds ?? undefined }, frame)
          work.present = task.index; work.part = task.part + 1
          if (work.part === task.rows * task.columns) { work.part = 0; work.present++ }
          layer.markContentPainted(rect(tile)); this.options.changed(work.input.layerId)
          if (frame.shouldYield) break
        }
      })
    } finally { for (const release of releases.reverse()) release() }
  }

  private overOperation(opacity: number) {
    return this.options.rasterProfile === CANONICAL_STROKE_RASTER_PROFILE
      ? { kind: 'over32FusedScalar' as const, control: { profile: CANONICAL_STROKE_RASTER_PROFILE, opacity } }
      : { kind: 'over32' as const, control: { profile: 'portable-f32-division-rne-v1' as const, opacity } }
  }

  private finish(work: Work): void {
    this.queue.shift(); work.releaseMetadata()
    if (work.result.state.ended) {
      const before = this.cleanupErrors.length
      this.releaseWashes()
      this.cleanup(() => this.options.prepass.releaseOwner(this))
      this.gesture = undefined; this.planned = undefined
      if (this.cleanupErrors.length > before) throw this.cleanupErrors[before]
    }
  }

  /** Cancel after ANY accepted work requires trusted rebuild, even if this
   * particular turn had not yet written: earlier preview may already be visible. */
  cancel(reason: unknown = new Error('Canonical execution cancelled'), options: { lost?: boolean } = {}): void {
    if (options.lost && !this.gl.isContextLost()) throw new Error('Cannot forget canonical resources on a live context')
    if (this.advancing) throw new Error('Cannot cancel inside a canonical GL batch')
    if (this.gesture || this.pending) {
      const before = this.cleanupErrors.length
      this.fail(reason, options.lost ?? this.gl.isContextLost())
      if (this.cleanupErrors.length > before) throw this.cleanupErrors[before]
    }
  }

  private fail(reason: unknown, lost = false): void {
    const layerId = this.gesture?.layerId, pending = this.queue.splice(0)
    this.failed = true
    // Detach cursor ownership before invoking arbitrary notification/release
    // callbacks. Reentrancy can never release one reservation a second time.
    this.gesture = undefined; this.planned = undefined
    if (layerId) this.cleanup(() => this.options.poison(layerId, reason))
    for (const work of pending) this.cleanup(work.releaseMetadata)
    this.releaseWashes(lost)
    this.cleanup(() => this.options.prepass.releaseOwner(this))
  }

  private cleanup(action: () => void): void {
    try { action() } catch (error) { this.cleanupErrors.push(error) }
  }

  private releaseWashes(lost = false): void {
    const tiles = [...this.washes.values()], releases = [...this.admissionReleases]
    this.washes.clear(); this.admittedTiles.clear(); this.admissionReleases.clear()
    for (const tile of tiles) {
      // Lost handles are forgotten by the caller's ONE global pool.forget(),
      // after cancelling every owner, before recreating the context.
      if (!lost) {
        this.cleanup(() => this.options.scratch.release(tile.local))
        this.cleanup(() => this.options.scratch.release(tile.original))
      }
    }
    for (const release of releases) this.cleanup(release)
  }
}
