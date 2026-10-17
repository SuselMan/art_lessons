import type {ControlBeforeState,HistoryGoneReason} from './controlHistory'
import type { Dab, Operation, StrokeOperation } from '@grafetto/shared'
import { operationLayerIds, strokeDabs } from '@grafetto/shared'

import { watercolorMixFromPreset } from '../presets/watercolorPresets'
import { WatercolorFootprintIndex, type FootprintBounds } from './watercolorFootprintIndex'
import { watercolorMaterialBoundaryLayers } from './watercolorMaterialBoundaries'

/** Minimal journal projection, independent of the OperationLog implementation. */
export interface WatercolorHistoryEntry {
  op: Operation
  state: 'done' | 'undone' | 'gone'
  goneReason?: HistoryGoneReason
  controlBefore?: readonly ControlBeforeState[]
}

/** Historical inactivity, not the replay client's wall clock. */
export const WATERCOLOR_UNDO_DRY_MS = 120_000

type Point = { x: number; y: number }
type Capsule = { a: Point; b: Point; r: number }
type Bounds = FootprintBounds
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

const sourceGeometry = new WeakMap<StrokeOperation, { footprint: Capsule[]; bounds: Bounds }>()
function geometryOf(op: StrokeOperation): { footprint: Capsule[]; bounds: Bounds } {
  const cached = sourceGeometry.get(op)
  if (cached) return cached
  const shapes = footprint(strokeDabs(op)), result = { footprint: shapes, bounds: boundsOf(shapes) }
  sourceGeometry.set(op, result)
  return result
}

function overlap(a: Bounds, b: Bounds): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
}

function intersects(a: WetNode, b: WetNode): boolean {
  return overlap(a.bounds, b.bounds) && a.footprint.some(x => b.footprint.some(y => touches(x, y)))
}

function isRemovedWaterCandidate(entry: WatercolorHistoryEntry): boolean {
  return entry.state === 'undone' || (entry.state === 'gone' && entry.goneReason === 'branch')
}

const modelCache = new WeakMap<StrokeOperation, boolean>()
export function isM70WatercolorStroke(op: Operation): op is StrokeOperation & { tool: 'watercolor' } {
  if (op.type !== 'stroke' || op.tool !== 'watercolor') return false
  const cached = modelCache.get(op)
  if (cached !== undefined) return cached
  const result = op.preset.split(':')[5] === 'wc@m70-r2-v1'
  modelCache.set(op, result)
  return result
}

const waterLevels = new WeakMap<StrokeOperation, number>()
function waterLevel(op: StrokeOperation): number {
  const cached = waterLevels.get(op)
  if (cached !== undefined) return cached
  const result = watercolorMixFromPreset(op.preset).water
  waterLevels.set(op, result)
  return result
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
 * Protection and connectivity are geometric and historical. The default
 * drying clock is per layer, matching the current one-source M70 adapter. Gone redo branches retain protected water; revocation does not. */
export interface WatercolorUndoOptions {
  dryAfterMs?: number
  /** M70 currently has one material source and one drying clock per layer. */
  dryingScope?: 'layer' | 'component'
}

type Eligibility = Map<string, Set<string>>
const gestureGroups = new WeakMap<StrokeOperation, string>()
function groupOf(op: StrokeOperation): string {
  const cached = gestureGroups.get(op)
  if (cached !== undefined) return cached
  const group = JSON.stringify([op.userId, op.layerId, op.strokeId ?? op.id])
  gestureGroups.set(op, group)
  return group
}

function resolveGeometry(
  entries: readonly WatercolorHistoryEntry[], options: WatercolorUndoOptions = {},
  eligibility?: Eligibility, unrestricted = new Set<string>(), observed?: Eligibility, enabled?: Set<string>, links?: Eligibility,
): Operation[] {
  const candidateLayers = new Set<string>()
  for (const entry of entries) {
    if (isRemovedWaterCandidate(entry) && isM70WatercolorStroke(entry.op)
      && waterLevel(entry.op) > 0) candidateLayers.add(entry.op.layerId)
  }
  if (!candidateLayers.size) return entries.filter(e => e.state === 'done').map(e => e.op)
  const dryAfter = options.dryAfterMs ?? WATERCOLOR_UNDO_DRY_MS
  const nodes = new Map<string, WetNode>(), candidateGroups = new Set<string>()
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index], op = entry.op
    if (!isM70WatercolorStroke(op) || !candidateLayers.has(op.layerId)
      || (entry.state !== 'done' && !isRemovedWaterCandidate(entry))) continue
    const group = groupOf(op)
    if (entry.state !== 'done' && (enabled && !enabled.has(group)
      || eligibility && !unrestricted.has(group) && !eligibility.get(group)?.size)) continue
    const node: WetNode = { op, group, index, active: entry.state === 'done',
      water: waterLevel(op) > 0, ...geometryOf(op) }
    nodes.set(op.id, node)
    if (!node.active && node.water) candidateGroups.add(group)
  }
  let retained = candidateGroups
  for (;;) {
    const wet: WetNode[] = [], parent: number[] = [], lastAt: number[] = []
    const open = new Map<string, Set<number>>()
    const layerLastAt = new Map<string, number>()
    const spatial = new Map<string, WatercolorFootprintIndex>()
    const componentSize: number[] = []
    const consumers: { component: number; node: WetNode }[] = []
    const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    const close = (layer: string) => { open.delete(layer); layerLastAt.delete(layer); spatial.delete(layer) }
    for (const entry of entries) {
      const op = entry.op
      if (entry.state === 'done') {
        for (const id of watercolorMaterialBoundaryLayers(op)) close(id)
        if (op.type === 'paper_dry') {
          if (op.layerId) close(op.layerId); else { open.clear(); layerLastAt.clear(); spatial.clear() }
        } else if (op.type === 'layer_clear' || op.type === 'layer_delete'
          || (op.type === 'layer_visibility' && !op.visible)) {
          for (const layer of operationLayerIds(op)) close(layer)
        } else if (op.type === 'stroke' && op.tool !== 'eraser' && !isM70WatercolorStroke(op)) {
          // Current adapter commits wet material before ordinary tools paint.
          close(op.layerId)
        }
        if (op.type === 'stroke' && (options.dryingScope ?? 'layer') === 'layer') {
          const last = layerLastAt.get(op.layerId)
          if (last !== undefined && op.timestamp >= last + dryAfter) close(op.layerId)
        }
      }
      const node = nodes.get(op.id)
      if (!node || (!node.active && !retained.has(node.group))) continue
      if ((options.dryingScope ?? 'layer') === 'layer') {
        const last = layerLastAt.get(node.op.layerId)
        if (last !== undefined && op.timestamp >= last + dryAfter) close(node.op.layerId)
        layerLastAt.set(node.op.layerId, op.timestamp)
      }
      const active = open.get(node.op.layerId) ?? new Set<number>()
      open.set(node.op.layerId, active)
      // Union removes replaced roots from this set, so it already contains
      // canonical roots. Layer-clock mode needs no per-stroke normalization.
      if (options.dryingScope === 'component') for (const id of active) {
        if (op.timestamp - lastAt[id] >= dryAfter) active.delete(id)
      }
      const index = spatial.get(node.op.layerId) ?? new WatercolorFootprintIndex()
      spatial.set(node.op.layerId, index)
      // Components are broad-phase filtered through their member AABBs; old
      // dry periods are never scanned or accidentally revived by a distant dab.
      const hit = new Set<number>()
      for (const id of index.candidates(node.bounds)) {
        const component = root(id)
        if (!hit.has(component) && active.has(component) && intersects(node, wet[id])) hit.add(component)
        if (hit.size === active.size) break
      }
      if (!node.water) {
        if (node.active) for (const component of hit) {
          consumers.push({ component, node }); lastAt[component] = Math.max(lastAt[component], op.timestamp)
        }
        continue
      }
      const id = wet.length; wet.push(node); parent.push(id); lastAt.push(op.timestamp)
      index.add(id, node.bounds)
      // Union by size keeps historical component roots shallow without
      // copying every member or merged bounding box on each new stroke.
      componentSize.push(1)
      let base = id
      for (const component of hit) if (componentSize[component] > componentSize[base]) base = component
      parent[id] = base
      if (base !== id) componentSize[base]++
      lastAt[base] = Math.max(lastAt[base], op.timestamp)
      for (const component of hit) {
        active.delete(component)
        if (component === base) continue
        componentSize[base] += componentSize[component]
        parent[component] = base; lastAt[base] = Math.max(lastAt[base], lastAt[component])
      }
      active.add(base)
    }
    // Latest active contribution per author and historical component. This
    // replaces the previous per-candidate full component/author scans.
    const latest = new Map<number, Map<string, WetNode>>()
    const record = (component: number, node: WetNode) => {
      const id = root(component), groups = latest.get(id) ?? new Map<string, WetNode>()
      if (!groups.has(node.group) || groups.get(node.group)!.index < node.index) groups.set(node.group, node)
      latest.set(id, groups)
    }
    for (let i = 0; i < wet.length; i++) if (wet[i].active) record(i, wet[i])
    for (const consumer of consumers) record(consumer.component, consumer.node)
    const supported = new Set<string>()
    const supports: Eligibility = new Map()
    for (let i = 0; i < wet.length; i++) {
      const node = wet[i]
      if (node.active) continue
      for (const consumer of latest.get(root(i))?.values() ?? []) {
        if (consumer.op.userId === node.op.userId || consumer.index <= node.index) continue
        if (eligibility && !unrestricted.has(node.group) && !eligibility.get(node.group)?.has(consumer.group)) continue
        supported.add(node.group)
        const groups = supports.get(node.group) ?? new Set<string>()
        groups.add(consumer.group); supports.set(node.group, groups)
      }
    }
    if (supported.size === retained.size) {
      if (observed) for (const [group, consumers] of supports) observed.set(group, consumers)
      if (links) {
        const componentGroups = new Map<number, Set<string>>()
        for (let i = 0; i < wet.length; i++) {
          const id = root(i), groups = componentGroups.get(id) ?? new Set<string>()
          groups.add(wet[i].group); componentGroups.set(id, groups)
        }
        for (let i = 0; i < wet.length; i++) if (!wet[i].active && supported.has(wet[i].group)) {
          const groups = links.get(wet[i].group) ?? new Set<string>()
          for (const group of componentGroups.get(root(i)) ?? []) groups.add(group)
          for (const group of supports.get(wet[i].group) ?? []) groups.add(group)
          links.set(wet[i].group, groups)
        }
      }
      break
    }
    retained = supported
  }
  return entries.flatMap(entry => entry.state === 'done' ? [entry.op]
    : isRemovedWaterCandidate(entry) && entry.op.type === 'stroke' && retained.has(nodes.get(entry.op.id)?.group ?? '')
      ? [waterOnlyStroke(entry.op)] : [])
}

type TimelineState = {
  source: Operation[]; simulated: WatercolorHistoryEntry[]; byId: Map<string, WatercolorHistoryEntry>
  eligibility: Eligibility; reactivators: Eligibility; view: Operation[]; material?: Operation[]; enabled: Set<string>; dryAfterMs: number | undefined; dryingScope: WatercolorUndoOptions['dryingScope']
}
const timelines = new WeakMap<readonly WatercolorHistoryEntry[], TimelineState>()

/** Interpret control events in their real order. Final-state geometry alone
 * cannot distinguish water used before undo from water absent before a new
 * stroke. The remembered links name whole gestures, never material fragments.
 * They are reconstructed from the existing journal, not added to the wire. */
export function effectiveWatercolorOperations(
  entries: readonly WatercolorHistoryEntry[], options: WatercolorUndoOptions = {},
): Operation[] {
  if (!entries.some(e => isRemovedWaterCandidate(e) && isM70WatercolorStroke(e.op))) {
    timelines.delete(entries)
    return entries.filter(e => e.state === 'done').map(e => e.op)
  }
  const isControl = (op: Operation): boolean => op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke'
  // Resolved historical entries and direct unit callers may have no controls.
  // Their previous contract treats the resolved changes as final transitions.
  if (!entries.some(e => isControl(e.op) && e.goneReason !== 'reject')) return resolveGeometry(entries, options)
  const cached = timelines.get(entries)
  const reusable = cached && cached.source.length < entries.length && cached.dryAfterMs === options.dryAfterMs && cached.dryingScope === options.dryingScope
    && cached.source.every((op, i) => entries[i]?.op === op)
  const state: TimelineState = reusable ? cached : {
    source: [], simulated: [], byId: new Map(), eligibility: new Map(), reactivators: new Map(), view: [], enabled: new Set(), dryAfterMs: options.dryAfterMs, dryingScope: options.dryingScope,
  }
  const {simulated, byId, eligibility, reactivators} = state
  let view = state.view
  let material = state.material
  let enabled = state.enabled
  for (let cursor = state.source.length; cursor < entries.length; cursor++) {
    const original = entries[cursor]
    state.source.push(original.op)
    const op = original.op
    if (original.goneReason === 'reject') {
      const removed = {...original}
      simulated.push(removed); byId.set(op.id, removed)
      continue
    }
    const present = new Set(view.filter(isM70WatercolorStroke).filter(source => byId.get(source.id)?.state !== 'done').map(groupOf))
    if (!isControl(op)) {
      for (const entry of simulated) if (entry.state === 'undone' && entry.op.userId === op.userId) {
        entry.state = 'gone'; entry.goneReason = 'branch'
      }
    }
    const next: WatercolorHistoryEntry = { ...original, state: 'done', goneReason: undefined }
    simulated.push(next); byId.set(op.id, next)
    const freshUndo = new Set<string>()
    enabled = new Set(present)
    if (op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke') {
      const target = byId.get(op.targetOpId)
      if (target && (op.type === 'operation_revoke' || target.op.userId === op.userId)) {
        const targetOp = target.op
        const gesture = targetOp.type === 'stroke' ? targetOp.strokeId : undefined
        const siblings = op.type === 'operation_revoke' || !gesture ? [target] : simulated.filter(entry =>
          entry.op.type === 'stroke' && entry.op.userId === targetOp.userId && entry.op.strokeId === gesture)
        for (const entry of siblings) {
          const group = isM70WatercolorStroke(entry.op) ? groupOf(entry.op) : undefined
          if (op.type === 'operation_undo' && entry.state === 'done') {
            entry.state = 'undone'
            if (group) { eligibility.delete(group); reactivators.delete(group); freshUndo.add(group); enabled.add(group) }
          } else if (op.type === 'operation_redo' && entry.state === 'undone') {
            entry.state = 'done'; entry.goneReason = undefined
            if (group) {
              eligibility.delete(group); reactivators.delete(group)
              // Only a replayed historical consumer can revive dormant water;
              // a newly drawn bridge cannot adopt an already absent source.
              for (const [source, historicalGroups] of reactivators) if (historicalGroups.has(group)) enabled.add(source)
            }
          } else if (op.type === 'operation_revoke') {
            entry.state = 'gone'; entry.goneReason = 'revoke'
            // Revoking one chunk must not delete latent support of siblings.
          }
        }
      }
    }
    const unrestricted = new Set([...present, ...freshUndo])
    material = undefined
    if (unrestricted.size) {
      const observed: Eligibility = new Map(), historicalLinks: Eligibility = new Map()
      material = resolveGeometry(simulated, options, eligibility, unrestricted, observed, enabled, historicalLinks)
      for (const group of unrestricted) {
        const consumers = eligibility.get(group) ?? new Set<string>()
        for (const consumer of observed.get(group) ?? []) consumers.add(consumer)
        eligibility.set(group, consumers)
        const groups = reactivators.get(group) ?? new Set<string>()
        for (const historicalGroup of historicalLinks.get(group) ?? []) groups.add(historicalGroup)
        reactivators.set(group, groups)
      }
    }
    if (!material && eligibility.size) material = resolveGeometry(simulated, options, eligibility, undefined, undefined, enabled)
    view = material?.filter(source => isM70WatercolorStroke(source) && byId.get(source.id)?.state !== 'done') ?? []
    enabled = new Set(view.filter(isM70WatercolorStroke).map(groupOf))
  }
  // A snapshot page can include already-resolved entries whose controlling
  // events are outside the available window. Preserve that historical fallback
  // without overriding states actually reconstructed from known controls.
  const synthetic = new Set<string>()
  let reconciled = false
  for (const original of entries) {
    const entry = byId.get(original.op.id)!
    if (entry.state === original.state && entry.goneReason === original.goneReason) continue
    reconciled = true
    entry.state = original.state; entry.goneReason = original.goneReason
    if (isRemovedWaterCandidate(entry) && isM70WatercolorStroke(entry.op)) {
      synthetic.add(groupOf(entry.op)); enabled.add(groupOf(entry.op))
    }
  }
  if (synthetic.size) {
    const observed: Eligibility = new Map()
    material = resolveGeometry(simulated, options, eligibility, synthetic, observed, enabled)
    for (const [group, consumers] of observed) eligibility.set(group, consumers)
    view = material.filter(source => isM70WatercolorStroke(source) && byId.get(source.id)?.state !== 'done')
    enabled = new Set(view.filter(isM70WatercolorStroke).map(groupOf))
  }
  if (reconciled) {
    timelines.delete(entries)
    if (!synthetic.size) material = undefined
  } else { state.view = view; state.enabled = enabled; state.material = material; timelines.set(entries, state) }
  return material ?? resolveGeometry(simulated, options, eligibility, undefined, undefined, enabled)
}
