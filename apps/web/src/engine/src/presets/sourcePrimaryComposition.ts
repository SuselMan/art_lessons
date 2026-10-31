import { CANONICAL_MATERIAL_PROFILE, CANONICAL_SOURCE_MATERIAL_PROFILE, CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE, isCanonicalStrokeComposition, type CanonicalMaterialEntry, type AnyCanonicalMaterialFrame, type CanonicalStrokeComposition } from '@grafetto/shared'
import { sourceBlendAverageOpacity } from './brushWash'
import { normalizeSourcePainterOpacity, type SourcePainterOpacity } from './sourcePainterOpacity'

export type SourcePrimaryCompositionContext = CanonicalStrokeComposition

/** Pure resumable gesture state. Original pixels and temporary surface are owned
 * by the renderer, never serialized or read here. Source fences are input only. */
export interface SourcePrimaryCompositionState {
  readonly version: 1
  readonly context: SourcePrimaryCompositionContext
  readonly entry: CanonicalMaterialEntry
  readonly lastGroup: number
  readonly nextFrameOrdinal: number
  readonly drawCount: number
  readonly averageQreal: number
  readonly ended: boolean
}
export type SourcePrimaryCompositionCommand =
  | { readonly kind: 'beginWash'; readonly target: 'freshTransparentStroke' }
  | { readonly kind: 'presentWash' | 'commitWash'; readonly source: 'stroke'; readonly destination: 'originalLayer'; readonly originalLayer: 'preStrokeSnapshot'; readonly opacity: number; readonly blend: CanonicalStrokeComposition['outerBlend'] }
export type SourcePrimaryCompositionControls =
  | ({ readonly kind: 'localAlphaDarken'; readonly variant: 'creamy' | 'hard' } & SourcePainterOpacity)
  | { readonly kind: 'directOver'; readonly opacity: number }
export interface SourcePrimaryCompositionDraw {
  readonly frameDrawIndex: number
  readonly drawOrdinal: number
  readonly definition: number
  readonly x: number
  readonly y: number
  readonly controls: SourcePrimaryCompositionControls
}
export interface SourcePrimaryCompositionResult {
  readonly state: SourcePrimaryCompositionState
  readonly draws: readonly SourcePrimaryCompositionDraw[]
  readonly commands: readonly SourcePrimaryCompositionCommand[]
}
const fail = (): never => { throw new RangeError('source primary composition: invalid context, state or frame order') }
const unit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
const integer = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min
function context(c: SourcePrimaryCompositionContext): void {
  if (!isCanonicalStrokeComposition(c, CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)) fail()
}
function entry(e: CanonicalMaterialEntry): void {
  if (!e || !['between', 'primary', 'mask'].includes(e.phase) || e.phase !== 'between' && !integer(e.group)) fail()
}
function validate(s: SourcePrimaryCompositionState): void {
  if (!s || s.version !== 1) fail()
  context(s.context); entry(s.entry)
  if (!integer(s.lastGroup, -1) || !integer(s.nextFrameOrdinal) || !integer(s.drawCount)
    || !unit(s.averageQreal) || s.drawCount === 0 && s.averageQreal !== 0 || typeof s.ended !== 'boolean'
    || s.entry.phase !== 'between' && s.entry.group !== s.lastGroup
    || s.ended && s.entry.phase !== 'between'
    || s.nextFrameOrdinal === 0 && (s.lastGroup !== -1 || s.entry.phase !== 'between' || s.drawCount !== 0 || s.averageQreal !== 0 || s.ended)) fail()
}
function state(s: SourcePrimaryCompositionState): SourcePrimaryCompositionState {
  return Object.freeze({ ...s, context: Object.freeze({ ...s.context }), entry: Object.freeze({ ...s.entry }) })
}
/** Caller creates once at gesture start. beginWash allocates a fresh transparent
 * stroke surface. Preview and final commit must use the SAME pre-stroke snapshot. */
export function createSourcePrimaryComposition(c: SourcePrimaryCompositionContext): SourcePrimaryCompositionResult {
  context(c)
  return Object.freeze({ state: state({ version: 1, context: c, entry: { phase: 'between' }, lastGroup: -1,
    nextFrameOrdinal: 0, drawCount: 0, averageQreal: 0, ended: false }), draws: Object.freeze([]),
    commands: Object.freeze(c.mode === 'wash' ? [Object.freeze({ kind: 'beginWash' as const, target: 'freshTransparentStroke' as const })] : []) })
}
/** Input must be the shared decoder's accepted frame, never pre-encode author
 * data. This layer rechecks capability/order, not CAS geometry/cost validation.
 * Pure all-or-nothing: rejection cannot advance state or issue renderer commands. */
export function advanceSourcePrimaryComposition(s: SourcePrimaryCompositionState, input: { readonly ordinal: number; readonly frame: AnyCanonicalMaterialFrame }): SourcePrimaryCompositionResult {
  validate(s)
  if (!input || s.ended || input.ordinal !== s.nextFrameOrdinal || !integer(input.ordinal)
    || !integer(s.nextFrameOrdinal + 1)) fail()
  const f = input.frame
  if (!f || ![CANONICAL_MATERIAL_PROFILE, CANONICAL_SOURCE_MATERIAL_PROFILE].includes(f.profile) || f.masked !== false || !Array.isArray(f.draws)
    || !Array.isArray(f.fences) || !Array.isArray(f.definitions)) fail()
  entry(f.entry)
  if (f.entry.phase !== s.entry.phase || f.entry.phase !== 'between' && (s.entry.phase === 'between' || f.entry.group !== s.entry.group)) fail()
  let current: CanonicalMaterialEntry = { ...s.entry }, lastGroup = s.lastGroup
  let average = s.averageQreal, count = s.drawCount, fi = 0, ended = false
  const draws: SourcePrimaryCompositionDraw[] = []
  for (let at = 0; at <= f.draws.length; at++) {
    while (fi < f.fences.length) {
      const fence = f.fences[fi]!
      if (!fence || !integer(fence.at) || fence.at < at || fence.at > f.draws.length || ended) fail()
      if (fence.at !== at) break
      if (fence.kind === 'gestureEnd') {
        if (current.phase !== 'between' || at !== f.draws.length || fi !== f.fences.length - 1) fail()
        ended = true
      } else {
        if (!integer(fence.group)) fail()
        if (fence.kind === 'segmentBegin') {
          if (current.phase !== 'between' || fence.group !== lastGroup + 1) fail()
          lastGroup = fence.group; current = { phase: 'primary', group: fence.group }
        } else if (fence.kind === 'primaryEnd') {
          if (current.phase !== 'primary' || current.group !== fence.group) fail()
          current = { phase: 'mask', group: fence.group }
        } else if (fence.kind === 'segmentEnd') {
          if (current.phase !== 'mask' || current.group !== fence.group) fail()
          current = { phase: 'between' }
        } else fail()
      }
      fi++
    }
    if (at === f.draws.length) break
    const d = f.draws[at]!
    if (ended || current.phase !== 'primary' || !d || d.role !== 'primary'
      || !integer(d.definition) || d.definition >= f.definitions.length || !integer(d.x, -100000000)
      || !integer(d.y, -100000000) || !unit(d.opacity) || !unit(d.flow) || !integer(count + 1)) fail()
    // Every actual draw updates history, including zero opacity / zero A8 masks.
    // No asset read is allowed to decide whether this record "counts".
    average = sourceBlendAverageOpacity(d.opacity, average)
    const p = normalizeSourcePainterOpacity({ opacity: d.opacity, averageOpacity: average, flow: d.flow })
    const controls: SourcePrimaryCompositionControls = s.context.mode === 'wash'
      ? Object.freeze({ kind: 'localAlphaDarken', variant: s.context.alphaDarken, ...p })
      : Object.freeze({ kind: 'directOver', opacity: p.opacity })
    draws.push(Object.freeze({ frameDrawIndex: at, drawOrdinal: count++, definition: d.definition, x: d.x, y: d.y, controls }))
  }
  if (fi !== f.fences.length) fail()
  const commands: SourcePrimaryCompositionCommand[] = []
  if (s.context.mode === 'wash' && (ended || draws.length > 0)) {
    commands.push(Object.freeze({ kind: ended ? 'commitWash' : 'presentWash', source: 'stroke', destination: 'originalLayer',
      originalLayer: 'preStrokeSnapshot', opacity: s.context.outerResourceOpacity, blend: s.context.outerBlend }))
  }
  return Object.freeze({ state: state({ ...s, entry: current, lastGroup, nextFrameOrdinal: s.nextFrameOrdinal + 1,
    drawCount: count, averageQreal: average, ended }), draws: Object.freeze(draws), commands: Object.freeze(commands) })
}
