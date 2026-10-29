import { createHash } from 'node:crypto'
import {
  CANONICAL_MATERIAL_LIMITS, CANONICAL_STROKE_RASTER_PROFILE, STRAIGHT_ROOM_RASTER_VERSION,
  canonicalMaterialGeometryCost, extractCanonicalSinglePngCapability, hasCanonicalSourceCurvePrograms,
  type BrushLibrary, type CanonicalMaterialContext, type CanonicalStrokeBegin,
} from '@grafetto/shared'
import { BrushStorage, merge } from '../brushLibrary/storage.js'
import { canonicalPaintRejectReason } from './operationGate.js'
import { lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import type { CanonicalAdmissionIdentity, CanonicalCapabilityResolver, TrustedCanonicalGesture } from './CanonicalStrokeAdmission.js'

export type CanonicalGestureBegin = CanonicalStrokeBegin
interface PinnedGesture { readonly board: RoomRecord; readonly lesson: RoomRecord; readonly grant: TrustedCanonicalGesture }
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !v.includes('\0')
const key = (identity: CanonicalAdmissionIdentity, strokeId: string) => JSON.stringify([identity.roomId, identity.userId, strokeId])
function fail(reason: string): never { throw new Error(`canonical capability: ${reason}`) }
function normalizedDescriptor(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedDescriptor)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, normalizedDescriptor(v)]))
  return value
}

/** Executable server-owned binder; deliberately NOT installed in socket routes.
 * Epochs identify resident record lifetimes only. Reconnect/restart must rebuild
 * persisted gesture prefixes before new admission; this is not durable history.
 * Descriptor/CAS semantics are verified here; a sourceStamp/profile claim alone
 * grants nothing. The author option compiler/RNG is never run on the server. */
export class CanonicalBrushCapabilityResolver {
  private readonly storage: BrushStorage
  private readonly operator: () => BrushLibrary
  private readonly variants: ReadonlySet<'creamy' | 'hard'>
  private readonly maxGestures: number
  private readonly gestures = new Map<string, PinnedGesture>()
  private readonly epochs = new WeakMap<RoomRecord, { readonly lesson: RoomRecord; readonly value: number }>()
  private nextEpoch = 0
  /** Pass directly to CanonicalStrokeAdmission; no ambient mutable identity. */
  readonly resolve: CanonicalCapabilityResolver = (identity, selector) => {
    if (!validIdentity(identity) || !selector || !text(selector.strokeId)) return undefined
    const pinned = this.gestures.get(key(identity, selector.strokeId))
    if (!pinned || pinned.grant.layerId !== selector.layerId || pinned.grant.brush !== selector.brush) return undefined
    const current = this.authorizedBoard(identity, selector.layerId)
    if (!current || current.board !== pinned.board || current.lesson !== pinned.lesson) return undefined
    return pinned.grant
  }

  constructor(options: {
    readonly storage: BrushStorage
    /** The actual startup operator manifest, not its protected personal archive. */
    readonly operator: () => BrushLibrary
    readonly rasterProfile: typeof CANONICAL_STROKE_RASTER_PROFILE
    /** Explicit server execution/config policy, never inferred from saved KPP. */
    readonly alphaDarkenVariants: readonly ('creamy' | 'hard')[]
    readonly maxGestures: number
  }) {
    if (!(options.storage instanceof BrushStorage) || typeof options.operator !== 'function'
      || options.rasterProfile !== CANONICAL_STROKE_RASTER_PROFILE
      || !Number.isInteger(options.maxGestures) || options.maxGestures < 1 || options.maxGestures > 1024
      || !Array.isArray(options.alphaDarkenVariants) || options.alphaDarkenVariants.length < 1 || options.alphaDarkenVariants.length > 2
      || options.alphaDarkenVariants.some(v => v !== 'creamy' && v !== 'hard')
      || new Set(options.alphaDarkenVariants).size !== options.alphaDarkenVariants.length) fail('invalid explicit execution policy')
    this.storage = options.storage; this.operator = options.operator
    this.maxGestures = options.maxGestures; this.variants = new Set(options.alphaDarkenVariants)
  }

  get size(): number { return this.gestures.size }

  /** Called only after authentication, using that principal, never payload userId.
   * Validates all settings/CAS/permission before changing binder state. No pin,
   * relay, DB write, RNG, geometry execution or descriptor mutation occurs. */
  beginGesture(identity: CanonicalAdmissionIdentity, input: CanonicalGestureBegin): TrustedCanonicalGesture {
    const prepared = this.prepareBeginGesture(identity, input)
    prepared.commit()
    return prepared.grant
  }

  /** Transport pins the verified brush between prepare and commit, synchronously.
   * A failed pin publishes no grant. No await/reentrant binder call is allowed. */
  prepareBeginGesture(identity: CanonicalAdmissionIdentity, input: CanonicalGestureBegin): { readonly grant: TrustedCanonicalGesture; readonly commit: () => void } {
    if (!validIdentity(identity) || !input || Object.keys(input).length !== 6
      || !['layerId', 'brush', 'strokeId', 'pigmentRgb8', 'outerResourceOpacity', 'alphaDarken'].every(k => Object.hasOwn(input, k))
      || !text(input.layerId) || !text(input.brush) || !text(input.strokeId)
      || !Array.isArray(input.pigmentRgb8) || input.pigmentRgb8.length !== 3 || !input.pigmentRgb8.every(v => Number.isInteger(v) && v >= 0 && v <= 255)
      || !Number.isFinite(input.outerResourceOpacity) || input.outerResourceOpacity < 0 || input.outerResourceOpacity > 1
      || !this.variants.has(input.alphaDarken)) fail('invalid gesture resource settings')
    const current = this.authorizedBoard(identity, input.layerId)
    if (!current) fail('board or paint permission unavailable')
    const identityKey = key(identity, input.strokeId)
    const previous = this.gestures.get(identityKey)
    if (previous) {
      const g = previous.grant
      if (previous.board !== current.board || previous.lesson !== current.lesson || g.layerId !== input.layerId
        || g.brush !== input.brush || g.pigmentRgb8.some((v, i) => v !== input.pigmentRgb8[i])
        || g.composition.outerResourceOpacity !== input.outerResourceOpacity || g.composition.alphaDarken !== input.alphaDarken) fail('gesture already pinned with different resources or lifetime')
      return Object.freeze({ grant: g, commit: () => {
        const now = this.authorizedBoard(identity, input.layerId)
        if (!now || now.board !== previous.board || now.lesson !== previous.lesson || this.gestures.get(identityKey) !== previous) fail('stale begin ticket')
      } })
    }
    if (this.gestures.size >= this.maxGestures) fail('gesture capacity exhausted; rebuild prefix before clearing')
    const match = /^brush:([a-z0-9-]+)@([1-9][0-9]*)$/.exec(input.brush)
    if (!match || !Number.isSafeInteger(Number(match[2]))) fail('exact versioned brush required')
    const library = merge(this.operator(), this.storage.library('owners', identity.userId), this.storage.library('rooms', identity.roomId))
    const descriptor = library.brushes.find(b => b.descriptor.id === match[1] && b.descriptor.version === Number(match[2]))?.descriptor
    if (!descriptor) fail('brush unavailable')
    const asset = library.assets.find(a => a.id === descriptor.tip.mask)
    if (!asset) fail('source CAS metadata unavailable')
    const result = extractCanonicalSinglePngCapability(descriptor, asset)
    if (!result.supported) fail(result.reasons.join(','))
    if (!hasCanonicalSourceCurvePrograms(descriptor.sourceStamp!)) fail('retained native curve programs unavailable')
    // Verify original CAS before publishing capability. No per-frame reread or
    // claim that inverse-gray bytes prove provenance in an installed native app.
    this.storage.asset(asset.id.slice(6), asset.size)
    const descriptorSha256 = createHash('sha256').update(JSON.stringify(normalizedDescriptor(descriptor))).digest('hex')
    const priorEpoch = this.epochs.get(current.board)
    let boardEpoch = priorEpoch?.lesson === current.lesson ? priorEpoch.value : undefined
    if (boardEpoch === undefined) {
      if (this.nextEpoch >= Number.MAX_SAFE_INTEGER) fail('resident epoch exhausted')
      boardEpoch = this.nextEpoch++; this.epochs.set(current.board, { lesson: current.lesson, value: boardEpoch })
    }
    const capability = result.capability
    const preflightDefinition: CanonicalMaterialContext['preflightDefinition'] = (recipe, source) => {
      if (recipe.brushScale !== capability.brushScale || recipe.brushAngle !== capability.brushAngle) fail('source brush geometry changed')
      return canonicalMaterialGeometryCost(recipe, source)
    }
    const material = Object.freeze({ assets: Object.freeze([result.capability.asset]), primaryAsset: asset.id,
      preflightDefinition, budget: Object.freeze({ workUnits: CANONICAL_MATERIAL_LIMITS.workUnits,
        outputBytes: CANONICAL_MATERIAL_LIMITS.outputBytes, drawPixels: CANONICAL_MATERIAL_LIMITS.drawPixels }) })
    const grant: TrustedCanonicalGesture = Object.freeze({ roomId: identity.roomId, userId: identity.userId, layerId: input.layerId,
      boardEpoch, roomRasterVersion: STRAIGHT_ROOM_RASTER_VERSION, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      descriptorSha256, brush: input.brush, strokeId: input.strokeId,
      pigmentRgb8: Object.freeze([input.pigmentRgb8[0], input.pigmentRgb8[1], input.pigmentRgb8[2]] as const),
      composition: Object.freeze({ mode: result.capability.mode, alphaDarken: input.alphaDarken,
        outerResourceOpacity: input.outerResourceOpacity, outerBlend: 'over' as const }), material })
    let committed = false
    return Object.freeze({ grant, commit: () => {
      if (committed) return
      const now = this.authorizedBoard(identity, grant.layerId)
      if (!now || now.board !== current.board || now.lesson !== current.lesson || this.gestures.has(identityKey)
        || this.gestures.size >= this.maxGestures) fail('stale begin ticket')
      this.gestures.set(identityKey, { ...current, grant }); committed = true
    } })
  }

  /** Trusted lifetime close only, paired with admission.clearRoom. Caller must
   * reconstruct persisted prefixes before accepting the same stroke IDs again. */
  clearRoom(roomId: string): void {
    for (const [id, pinned] of this.gestures) if (pinned.grant.roomId === roomId) this.gestures.delete(id)
  }

  private authorizedBoard(identity: CanonicalAdmissionIdentity, layerId: string): { board: RoomRecord; lesson: RoomRecord } | undefined {
    const board = rooms.get(identity.roomId)
    if (!board || board.room.id !== identity.roomId || board.room.rasterVersion !== STRAIGHT_ROOM_RASTER_VERSION) return undefined
    let lesson: RoomRecord
    try { lesson = lessonRecordOf(board) } catch { return undefined }
    if (canonicalPaintRejectReason(board, lesson, identity.userId, layerId) !== null) return undefined
    return { board, lesson }
  }
}
function validIdentity(identity: CanonicalAdmissionIdentity): boolean {
  return !!identity && text(identity.roomId) && text(identity.userId)
}
