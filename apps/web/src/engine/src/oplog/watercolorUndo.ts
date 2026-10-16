import type { Dab, Operation, StrokeOperation } from '@grafetto/shared'
import { operationLayerIds, strokeDabs } from '@grafetto/shared'

import { watercolorMixFromPreset } from '../presets/watercolorPresets'
import type { LogEntry } from './OperationLog'

/** Historical inactivity, not the replay client's wall clock. */
export const WATERCOLOR_UNDO_DRY_MS = 120_000

type Point = { x: number; y: number }
type Capsule = { a: Point; b: Point; r: number }
type Gesture = {
  first: number; last: number; user: string; layer: string; epoch: number
  active: boolean; water: boolean; chunks: StrokeOperation[]; footprint: Capsule[]
}

const q = (value: number): number => Math.round(value * 256) / 256
const cross = (a: Point, b: Point, p: Point): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)

function distance2(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2
}

function touches(a: Capsule, b: Capsule): boolean {
  const r = a.r + b.r
  if (Math.max(a.a.x, a.b.x) + r < Math.min(b.a.x, b.b.x)
    || Math.max(b.a.x, b.b.x) + r < Math.min(a.a.x, a.b.x)
    || Math.max(a.a.y, a.b.y) + r < Math.min(b.a.y, b.b.y)
    || Math.max(b.a.y, b.b.y) + r < Math.min(a.a.y, a.b.y)) return false
  // Opposite sides plus intersecting bounds also handles collinear segments.
  if (cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) <= 0
    && cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) <= 0
    && Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) <= Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x))
    && Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) <= Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y))) return true
  return Math.min(distance2(a.a, b.a, b.b), distance2(a.b, b.a, b.b),
    distance2(b.a, a.a, a.b), distance2(b.b, a.a, a.b)) <= r * r
}

/** V1 semantic footprint: swept discs enclosing the nib, rounded to 1/256
 * world unit. This deliberately conservative geometry does not inspect GPU
 * pixels, animated fronts or particle provenance. */
function footprint(dabs: Dab[]): Capsule[] {
  const out: Capsule[] = []
  let previous: { p: Point; r: number } | undefined
  for (const dab of dabs) {
    if (![dab.x, dab.y, dab.size, dab.aspectRatio].every(Number.isFinite) || dab.size <= 0) continue
    const p = { x: q(dab.x), y: q(dab.y) }
    const r = q(dab.size * Math.max(1, dab.aspectRatio) / 2)
    out.push({ a: previous?.p ?? p, b: p, r: Math.max(previous?.r ?? r, r) })
    previous = { p, r }
  }
  return out
}

function intersects(a: Gesture, b: Gesture): boolean {
  return a.layer === b.layer && a.epoch === b.epoch
    && a.footprint.some(x => b.footprint.some(y => touches(x, y)))
}

export function isM70WatercolorStroke(op: Operation): op is StrokeOperation {
  return op.type === 'stroke' && op.tool === 'watercolor' && op.preset.split(':')[5] === 'wc@m70-r2-v1'
}

/** Preserve the entire gesture's water, never selected pixels or fragments.
 * Keep every other recorded parameter (including solver version) unchanged. */
const waterProjections = new WeakMap<StrokeOperation, StrokeOperation>()

export function waterOnlyStroke(op: StrokeOperation): StrokeOperation {
  const cached = waterProjections.get(op)
  if (cached) return cached
  const fields = op.preset.split(':')
  fields[2] = '0'
  const projection = { ...op, preset: fields.join(':') }
  waterProjections.set(op, projection)
  return projection
}

/** A derived view; original operations and their done/undone states never
 * change. Undoable drying boundaries are read only when currently done.
 * Revoked/gone entries disappear completely. Water-only projections cannot
 * themselves protect other undone gestures: protection needs a later active
 * foreign contribution in the same historical wet component. */
export function effectiveWatercolorOperations(
  entries: readonly LogEntry[], options: { dryAfterMs?: number } = {},
): Operation[] {
  if (!entries.some(({ op, state }) => state === 'undone' && isM70WatercolorStroke(op)
    && watercolorMixFromPreset(op.preset).water > 0)) return entries.filter(e => e.state === 'done').map(e => e.op)
  const dryAfter = options.dryAfterMs ?? WATERCOLOR_UNDO_DRY_MS
  const epochs = new Map<string, number>(), lastAt = new Map<string, number>()
  const gestures = new Map<string, Gesture>()
  let globalEpoch = 0
  const bump = (layer: string) => { epochs.set(layer, (epochs.get(layer) ?? globalEpoch) + 1); lastAt.delete(layer) }
  for (let i = 0; i < entries.length; i++) {
    const { op, state } = entries[i]
    if (state === 'gone') continue
    if (state === 'done' && op.type === 'paper_dry') {
      if ('layerId' in op && typeof op.layerId === 'string') bump(op.layerId)
      else { globalEpoch++; for (const layer of epochs.keys()) bump(layer); lastAt.clear() }
    }
    if (state === 'done' && (op.type === 'layer_clear' || op.type === 'layer_delete')) {
      for (const layer of operationLayerIds(op)) bump(layer)
    }
    if (!isM70WatercolorStroke(op)) continue
    const key = JSON.stringify([op.userId, op.layerId, op.strokeId ?? op.id])
    const existing = gestures.get(key)
    if (existing) {
      existing.last = i; existing.active ||= state === 'done'; existing.chunks.push(op)
      lastAt.set(op.layerId, op.timestamp)
      continue
    }
    const previous = lastAt.get(op.layerId)
    if (previous !== undefined && op.timestamp - previous > dryAfter) bump(op.layerId)
    if (!epochs.has(op.layerId)) epochs.set(op.layerId, globalEpoch)
    lastAt.set(op.layerId, op.timestamp)
    gestures.set(key, { first: i, last: i, user: op.userId, layer: op.layerId,
      epoch: epochs.get(op.layerId)!, active: state === 'done', water: watercolorMixFromPreset(op.preset).water > 0,
      chunks: [op], footprint: [] })
  }
  const all = [...gestures.values()]
  for (const g of all) g.footprint = footprint(g.chunks.flatMap(strokeDabs))
  let wet = all.filter(g => g.water)
  // Remove unsupported water and rebuild connectivity until stable. An
  // already-cancelled bridge must not keep two otherwise separate pools
  // connected merely because the original history contained it.
  for (;;) {
    const parent = wet.map((_, i) => i)
    const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    for (let i = 0; i < wet.length; i++) for (let j = 0; j < i; j++) {
      if (intersects(wet[i], wet[j])) parent[root(i)] = root(j)
    }
    const retained = wet.filter((g, i) => {
      if (g.active) return true
      const component = wet.filter((_, j) => root(i) === root(j))
      return all.some(other => other.active && other.user !== g.user && other.first > g.first
        && (other.water ? component.includes(other) : component.some(member => intersects(member, other))))
    })
    if (retained.length === wet.length) break
    wet = retained
  }
  const keep = new Set(wet.filter(g => !g.active).flatMap(g => g.chunks.map(chunk => chunk.id)))
  return entries.flatMap(({ op, state }) => state === 'done' ? [op]
    : state === 'undone' && op.type === 'stroke' && keep.has(op.id) ? [waterOnlyStroke(op)] : [])
}

