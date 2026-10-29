import { createHash } from 'node:crypto'
import { CANONICAL_STROKE_RASTER_PROFILE, STRAIGHT_ROOM_RASTER_VERSION, decodeCanonicalStrokeFrame,
  type CanonicalMaterialContext, type CanonicalMaterialEntry, type CanonicalMaterialFrame,
  type CanonicalStrokeComposition, type CanonicalStrokeFrameEnvelope } from '@grafetto/shared'

export interface CanonicalAdmissionIdentity { readonly roomId: string; readonly userId: string }
/** Server-owned policy result, NEVER deserialized from a socket payload.
 * The resolver must use the authoritative pixel-owning board, permissions,
 * immutable descriptor revision and verified CAS metadata. sourceStamp presence
 * and a client's profile name are NOT an authorization. */
export interface TrustedCanonicalGesture {
  readonly roomId: string
  readonly userId: string
  readonly layerId: string
  readonly boardEpoch: number
  readonly roomRasterVersion: typeof STRAIGHT_ROOM_RASTER_VERSION
  readonly rasterProfile: typeof CANONICAL_STROKE_RASTER_PROFILE
  readonly descriptorSha256: string
  readonly brush: string
  readonly strokeId: string
  readonly pigmentRgb8: readonly [number, number, number]
  readonly composition: CanonicalStrokeComposition
  readonly material: CanonicalMaterialContext
}
export type CanonicalCapabilityResolver = (identity: CanonicalAdmissionIdentity, selector: { readonly layerId: string; readonly brush: string; readonly strokeId: string }) => TrustedCanonicalGesture | undefined
export type CanonicalFrameCandidate = {
  readonly type: 'canonical_stroke'; readonly id: string; readonly layerId: string; readonly frame: CanonicalStrokeFrameEnvelope
} | {
  readonly type: 'canonical_stroke_live'; readonly layerId: string; readonly frame: CanonicalStrokeFrameEnvelope
}
export interface AcceptedCanonicalFrame {
  readonly identity: CanonicalAdmissionIdentity
  readonly candidate: CanonicalFrameCandidate
  readonly decoded: CanonicalMaterialFrame
  readonly descriptorSha256: string
  readonly boardEpoch: number
}
interface Fingerprint { hash: string; operationId?: string; live: boolean; recorded: boolean }
interface Gesture {
  signature: string
  preflight: CanonicalMaterialContext['preflightDefinition']
  liveNext: number
  recordedNext: number
  uniqueNext: number
  entry: CanonicalMaterialEntry
  lastGroup: number
  ended: boolean
  fingerprints: Map<number, Fingerprint>
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.length && v.length <= 256 && !v.includes('\0')
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER
const sameEntry = (a: CanonicalMaterialEntry, b: CanonicalMaterialEntry) => a.phase === b.phase && (a.phase === 'between' || b.phase !== 'between' && a.group === b.group)
function fail(reason: string): never { throw new Error(`canonical admission: ${reason}`) }
const fields = (v: Record<string, unknown>, expected: readonly string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k))

/** Inactive until a real server policy installs a resolver and socket adapter.
 * This is admission state, not a second log or an authorization fallback. */
export class CanonicalStrokeAdmission {
  private readonly gestures = new Map<string, Gesture>()
  private revision = 0
  private readonly resolve: CanonicalCapabilityResolver
  private readonly maxGestures: number
  private readonly window: number

  constructor(options: {
    readonly resolve: CanonicalCapabilityResolver
    readonly maxGestures: number
    readonly retainedFrames: number
  }) {
    if (typeof options.resolve !== 'function' || !integer(options.maxGestures) || options.maxGestures < 1 || options.maxGestures > 1024
      || !integer(options.retainedFrames) || options.retainedFrames < 1 || options.retainedFrames > 8) fail('invalid bounded policy')
    this.resolve = options.resolve; this.maxGestures = options.maxGestures; this.window = options.retainedFrames
  }

  get size(): number { return this.gestures.size }

  /** Recorded: prepare -> pin -> recordOperation(assign seq) -> commit -> ack/relay.
   * Live: prepare -> pin -> commit -> relay (skip duplicate tickets).
   * Do NOT await or invoke another prepare/commit between external effects and
   * commit. A failed pin/store leaves this ticket uncommitted and ordinals intact.
   * The existing durable operation-ID lookup must run BEFORE preparing a recorded
   * retry; no unbounded copy of operation history is retained here. */
  prepare(identity: CanonicalAdmissionIdentity, value: unknown): {
    readonly value: AcceptedCanonicalFrame
    readonly duplicate: boolean
    readonly commit: () => void
  } {
    if (!identity || !text(identity.roomId) || !text(identity.userId) || !record(value)
      || !['canonical_stroke', 'canonical_stroke_live'].includes(value.type as string) || !text(value.layerId)
      || !fields(value, value.type === 'canonical_stroke' ? ['type', 'id', 'layerId', 'frame'] : ['type', 'layerId', 'frame'])
      || value.type === 'canonical_stroke' && !text(value.id) || !record(value.frame)) fail('invalid discriminated candidate')
    const f = value.frame
    if (!text(f.brush) || !text(f.strokeId) || !integer(f.frameOrdinal)) fail('invalid frame selector')
    const layerId = value.layerId, brush = f.brush, strokeId = f.strokeId, ordinal = f.frameOrdinal
    const scope = Object.freeze({ roomId: identity.roomId, userId: identity.userId })
    const grant = this.resolve(scope, Object.freeze({ layerId, brush, strokeId }))
    if (!grant || grant.roomId !== scope.roomId || grant.userId !== scope.userId || grant.layerId !== layerId
      || grant.brush !== brush || grant.strokeId !== strokeId || !integer(grant.boardEpoch)
      || grant.roomRasterVersion !== STRAIGHT_ROOM_RASTER_VERSION || grant.rasterProfile !== CANONICAL_STROKE_RASTER_PROFILE
      || !/^[0-9a-f]{64}$/.test(grant.descriptorSha256)) fail('trusted board/brush capability unavailable')
    // First service supports only the executor's single-primary material class.
    if (!grant.material || !Array.isArray(grant.material.assets) || grant.material.maskAsset !== undefined || grant.material.assets.length > 16) fail('unsupported trusted material capability')
    const m = grant.material
    const signature = JSON.stringify({ roomId: grant.roomId, userId: grant.userId, layerId: grant.layerId, boardEpoch: grant.boardEpoch,
      roomRasterVersion: grant.roomRasterVersion, rasterProfile: grant.rasterProfile, descriptorSha256: grant.descriptorSha256,
      brush: grant.brush, strokeId: grant.strokeId, pigmentRgb8: grant.pigmentRgb8, composition: grant.composition,
      material: { assets: m.assets, primaryAsset: m.primaryAsset, maskAsset: m.maskAsset, budget: m.budget,
        expectedDrawCount: m.expectedDrawCount, expectedStrokeEnd: m.expectedStrokeEnd } })
    const key = JSON.stringify([scope.roomId, scope.userId, strokeId]), previous = this.gestures.get(key)
    if (previous && (previous.signature !== signature || previous.preflight !== grant.material.preflightDefinition)) fail('immutable gesture capability changed')
    if (!previous && (ordinal !== 0 || this.gestures.size >= this.maxGestures)) fail('missing prefix or bounded gesture capacity')
    const state: Gesture = previous ?? { signature, preflight: grant.material.preflightDefinition, liveNext: 0, recordedNext: 0, uniqueNext: 0,
      entry: { phase: 'between' }, lastGroup: -1, ended: false, fingerprints: new Map() }
    const live = value.type === 'canonical_stroke_live', next = live ? state.liveNext : state.recordedNext
    const old = state.fingerprints.get(ordinal)
    if (!live && [...state.fingerprints].some(([n, item]) => n !== ordinal && item.operationId === value.id)) fail('operation ID reused across frames')
    if (ordinal > next || ordinal < next && !old || live && ordinal >= state.recordedNext + this.window) fail('noncontiguous or expired frame ordinal')
    const decoded = decodeCanonicalStrokeFrame(f, { brush: grant.brush, strokeId: grant.strokeId, frameOrdinal: ordinal,
      pigmentRgb8: grant.pigmentRgb8, composition: grant.composition, material: grant.material })
    if (decoded.frame.masked) fail('masked executor not admitted')
    const hash = createHash('sha256').update(JSON.stringify(decoded.envelope)).digest('hex')
    if (old && (old.hash !== hash || !live && old.operationId !== undefined && old.operationId !== value.id)) fail('frame identity conflicts with accepted lane')
    const duplicate = !!old && (live ? old.live : old.recorded)
    if (ordinal < next && !duplicate) fail('noncontiguous lane')
    let entry = state.entry, lastGroup = state.lastGroup, ended = state.ended
    if (!old) {
      if (ordinal !== state.uniqueNext || ended || !sameEntry(decoded.frame.entry, entry)) fail('missing cross-frame fence prefix')
      for (const fence of decoded.frame.fences) {
        if (fence.kind === 'segmentBegin') {
          if (fence.group !== lastGroup + 1) fail('noncontiguous segment group')
          lastGroup = fence.group; entry = { phase: 'primary', group: fence.group }
        } else if (fence.kind === 'primaryEnd') entry = { phase: 'mask', group: fence.group }
        else if (fence.kind === 'segmentEnd') entry = { phase: 'between' }
        else ended = true
      }
    }
    const candidate: CanonicalFrameCandidate = value.type === 'canonical_stroke'
      ? Object.freeze({ type: 'canonical_stroke', id: value.id as string, layerId, frame: decoded.envelope })
      : Object.freeze({ type: 'canonical_stroke_live', layerId, frame: decoded.envelope })
    const accepted = Object.freeze({ identity: scope, candidate, decoded: decoded.frame,
      descriptorSha256: grant.descriptorSha256, boardEpoch: grant.boardEpoch })
    const revision = this.revision
    let committed = false
    return Object.freeze({ value: accepted, duplicate, commit: () => {
      if (committed) return
      if (this.revision !== revision || this.gestures.get(key) !== previous) fail('stale admission ticket; prepare again before effects')
      const fingerprints = new Map(state.fingerprints), current = old ?? { hash, live: false, recorded: false }
      fingerprints.set(ordinal, { ...current, ...(live ? { live: true } : { recorded: true, operationId: candidate.type === 'canonical_stroke' ? candidate.id : undefined }) })
      const liveNext = duplicate ? state.liveNext : live ? next + 1 : state.liveNext
      const recordedNext = duplicate ? state.recordedNext : live ? state.recordedNext : next + 1
      // Authoritative records may progress without live traffic. Old live frames
      // beyond this retained digest window require the normal receiver resync.
      for (const n of fingerprints.keys()) if (n < recordedNext - this.window) fingerprints.delete(n)
      this.gestures.set(key, { ...state, fingerprints, liveNext, recordedNext, uniqueNext: old ? state.uniqueNext : ordinal + 1, entry, lastGroup, ended })
      this.revision++; committed = true
    } })
  }

  /** Room eviction/reset only AFTER its admission state can be reconstructed
   * from trusted persisted canonical history. No auto-tombstone eviction: IDs
   * must never silently become new gestures when a bounded cache fills. */
  clearRoom(roomId: string): void {
    if (!text(roomId)) fail('invalid room lifetime')
    for (const key of this.gestures.keys()) if ((JSON.parse(key) as string[])[0] === roomId) this.gestures.delete(key)
    this.revision++
  }
}
