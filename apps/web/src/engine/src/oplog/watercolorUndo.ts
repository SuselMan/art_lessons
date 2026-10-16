import type { Dab, Operation, StrokeOperation } from '@grafetto/shared'
import { operationLayerIds, strokeDabs } from '@grafetto/shared'

import { watercolorMixFromPreset } from '../presets/watercolorPresets'
import type { LogEntry } from './OperationLog'

/** Historical inactivity, not the replay client's wall clock. */
export const WATERCOLOR_UNDO_DRY_MS = 120_000

type Point = { x: number; y: number }
type Capsule = { a: Point; b: Point; r: number }
type Bounds = { left: number; top: number; right: number; bottom: number }
type WetNode = { op: StrokeOperation; group: string; index: number; active: boolean; water: boolean; footprint: Capsule[]; bounds: Bounds }


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

function boundsOf(shapes: Capsule[]): Bounds {
  const out = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const { a, b, r } of shapes) {
    out.left = Math.min(out.left, a.x - r, b.x - r); out.right = Math.max(out.right, a.x + r, b.x + r)
    out.top = Math.min(out.top, a.y - r, b.y - r); out.bottom = Math.max(out.bottom, a.y + r, b.y + r)
  }
  return out
}

function overlap(a: Bounds, b: Bounds): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
}

function intersects(a: WetNode, b: WetNode): boolean {
  return overlap(a.bounds, b.bounds) && a.footprint.some(x => b.footprint.some(y => touches(x, y)))
}

function isRemovedWaterCandidate(entry: LogEntry): boolean {
  return entry.state === 'undone' || (entry.state === 'gone' && entry.goneReason === 'branch')
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

/** A derived material view, never a mutation of the original journal.
 * Protection is historical, but connectivity and inactivity are local to each
 * wet component. Gone redo branches retain protected water; revocation does not. */
export function effectiveWatercolorOperations(
  entries: readonly LogEntry[], options: { dryAfterMs?: number } = {},
): Operation[] {
  const candidateLayers = new Set<string>()
  for (const entry of entries) {
    if (isRemovedWaterCandidate(entry) && isM70WatercolorStroke(entry.op)
      && watercolorMixFromPreset(entry.op.preset).water > 0) candidateLayers.add(entry.op.layerId)
  }
  if (!candidateLayers.size) return entries.filter(e => e.state === 'done').map(e => e.op)
  const dryAfter = options.dryAfterMs ?? WATERCOLOR_UNDO_DRY_MS
  const nodes = new Map<string, WetNode>(), candidateGroups = new Set<string>()
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index], op = entry.op
    if (!isM70WatercolorStroke(op) || !candidateLayers.has(op.layerId)
      || (entry.state !== 'done' && !isRemovedWaterCandidate(entry))) continue
    const group = JSON.stringify([op.userId, op.layerId, op.strokeId ?? op.id])
    const shapes = footprint(strokeDabs(op))
    const node: WetNode = { op, group, index, active: entry.state === 'done',
      water: watercolorMixFromPreset(op.preset).water > 0, footprint: shapes, bounds: boundsOf(shapes) }
    nodes.set(op.id, node)
    if (!node.active && node.water) candidateGroups.add(group)
  }
  let retained = candidateGroups
  for (;;) {
    const wet: WetNode[] = [], parent: number[] = [], lastAt: number[] = []
    const open = new Map<string, Set<number>>()
    const members = new Map<number, number[]>(), componentBounds = new Map<number, Bounds>()
    const consumers: { component: number; node: WetNode }[] = []
    const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    const close = (layer: string) => open.delete(layer)
    for (const entry of entries) {
      const op = entry.op
      if (entry.state === 'done') {
        if (op.type === 'paper_dry') {
          if (op.layerId) close(op.layerId); else open.clear()
        } else if (op.type === 'layer_clear' || op.type === 'layer_delete'
          || (op.type === 'layer_visibility' && !op.visible)) {
          for (const layer of operationLayerIds(op)) close(layer)
        }
      }
      const node = nodes.get(op.id)
      if (!node || (!node.active && !retained.has(node.group))) continue
      const active = open.get(node.op.layerId) ?? new Set<number>()
      open.set(node.op.layerId, active)
      const roots = new Set([...active].map(root)); active.clear()
      for (const id of roots) if (op.timestamp - lastAt[id] <= dryAfter) active.add(id)
      // Components are broad-phase filtered through their member AABBs; old
      // dry periods are never scanned or accidentally revived by a distant dab.
      const hit = new Set<number>()
      for (const component of active) {
        if (overlap(node.bounds, componentBounds.get(component)!)
          && members.get(component)!.some(i => intersects(node, wet[i]))) hit.add(component)
      }
      if (!node.water) {
        if (node.active) for (const component of hit) {
          consumers.push({ component, node }); lastAt[component] = Math.max(lastAt[component], op.timestamp)
        }
        continue
      }
      const id = wet.length; wet.push(node); parent.push(id); lastAt.push(op.timestamp)
      // Union by member count: a long running pool does not copy its entire
      // membership on each new dab/chunk.
      let base = id
      for (const component of hit) if ((members.get(component)?.length ?? 0) > (members.get(base)?.length ?? 0)) base = component
      const mergedMembers = members.get(base) ?? [], mergedBounds = { ...(componentBounds.get(base) ?? node.bounds) }
      mergedMembers.push(id); parent[id] = base
      lastAt[base] = Math.max(lastAt[base], op.timestamp)
      mergedBounds.left = Math.min(mergedBounds.left, node.bounds.left); mergedBounds.right = Math.max(mergedBounds.right, node.bounds.right)
      mergedBounds.top = Math.min(mergedBounds.top, node.bounds.top); mergedBounds.bottom = Math.max(mergedBounds.bottom, node.bounds.bottom)
      for (const component of hit) {
        active.delete(component)
        if (component === base) continue
        for (const member of members.get(component)!) mergedMembers.push(member)
        const oldBounds = componentBounds.get(component)!
        mergedBounds.left = Math.min(mergedBounds.left, oldBounds.left); mergedBounds.right = Math.max(mergedBounds.right, oldBounds.right)
        mergedBounds.top = Math.min(mergedBounds.top, oldBounds.top); mergedBounds.bottom = Math.max(mergedBounds.bottom, oldBounds.bottom)
        parent[component] = base; lastAt[base] = Math.max(lastAt[base], lastAt[component])
        members.delete(component); componentBounds.delete(component)
      }
      members.set(base, mergedMembers); componentBounds.set(base, mergedBounds)
      active.add(base)
    }
    // Latest active contribution per author and historical component. This
    // replaces the previous per-candidate full component/author scans.
    const latest = new Map<number, Map<string, number>>()
    const record = (component: number, node: WetNode) => {
      const id = root(component), authors = latest.get(id) ?? new Map<string, number>()
      authors.set(node.op.userId, Math.max(authors.get(node.op.userId) ?? -1, node.index)); latest.set(id, authors)
    }
    for (let i = 0; i < wet.length; i++) if (wet[i].active) record(i, wet[i])
    for (const consumer of consumers) record(consumer.component, consumer.node)
    const supported = new Set<string>()
    for (let i = 0; i < wet.length; i++) {
      const node = wet[i]
      if (!node.active && [...(latest.get(root(i)) ?? [])].some(([author, index]) => author !== node.op.userId && index > node.index)) {
        supported.add(node.group)
      }
    }
    if (supported.size === retained.size) break
    retained = supported
  }
  return entries.flatMap(entry => entry.state === 'done' ? [entry.op]
    : isRemovedWaterCandidate(entry) && entry.op.type === 'stroke' && retained.has(nodes.get(entry.op.id)?.group ?? '')
      ? [waterOnlyStroke(entry.op)] : [])
}
