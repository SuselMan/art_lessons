import type { LayerFolder, LayerItem, LayerState, Operation, RasterLayer, LayerMoveOperation } from '@grafetto/shared'
import { BACKGROUND_LAYER_ID, operationLayerIds } from '@grafetto/shared'

export function isFolder(item: LayerItem): item is LayerFolder {
  return item.kind === 'folder'
}

/**
 * Whether this item refuses paint. The `locked` flag is the user's own toggle,
 * but the background is locked unconditionally and cannot be unlocked: it is
 * the paper, and every other rule about it already says so (it can't be moved,
 * deleted, merged, renamed, or multi-selected — see this file's own
 * BACKGROUND_LAYER_ID guards and the layer panel's).
 *
 * Ask this rather than reading `.locked` directly, or the background ends up
 * paintable simply because nothing ever set a flag on it — which is exactly
 * what happened.
 */
export function isLayerLocked(item: LayerItem | undefined): boolean {
  if (!item) return false
  return item.id === BACKGROUND_LAYER_ID || !!item.locked
}

/** Returns the folder id that holds the item, or null if the item is at root. */
export function parentOf(state: LayerState, id: string): string | null {
  for (const item of Object.values(state.items))
    if (isFolder(item) && item.children.includes(id)) return item.id
  return null
}

/**
 * The item's folders, nearest first, up to the root.
 *
 * (#410) Every walk over this tree carries a `seen` set, this one included,
 * and that is deliberate rather than defensive habit. Once folders nest, a
 * cycle becomes *expressible* — and a cycle is not a wrong answer, it is an
 * unbounded loop that hangs the tab. `applyMove` refuses to create one, so
 * anything a client authors is acyclic by construction; but LayerState also
 * arrives whole, from a stored snapshot (`snapshotRestore`), authored by
 * nobody present and validated by no one on the way in. A single bad snapshot
 * would otherwise hang every participant in the room at the same moment, with
 * no way back in — the tab that would let you fix it is the tab that's frozen.
 * The guard costs a Set per walk and buys immunity from that whole class.
 */
export function ancestorsOf(state: LayerState, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let current = parentOf(state, id)
  while (current !== null && !seen.has(current)) {
    out.push(current)
    seen.add(current)
    current = parentOf(state, current)
  }
  return out
}

/** Where a newly created layer goes: immediately above `id`, the row its
 *  author has selected, and inside the same folder if that row is in one.
 *
 *  Resolved here, at emission, because the answer depends on `activeId` —
 *  per-user view state that never enters the operation log, so no other
 *  client could reach the same conclusion by replaying (see
 *  `LayerAddOperation`). Callers put the result straight into the operation.
 *
 *  Falls back to the top for an id that isn't in the tree, which is also what
 *  an operation carrying no placement at all replays to — a layer with nowhere
 *  in particular to go goes where every layer used to.
 */
export function placementAbove(state: LayerState, id: string): { parentId: string | null; index: number } {
  const parentId = parentOf(state, id)
  if (parentId !== null) {
    const parent = state.items[parentId]
    if (isFolder(parent)) return { parentId, index: parent.children.indexOf(id) }
  }
  const index = state.rootOrder.indexOf(id)
  return { parentId: null, index: index >= 0 ? index : 0 }
}

/**
 * Whether this item reaches the screen at all: its own `visible` flag *and*
 * every ancestor folder's, since hiding a folder hides everything in it — the
 * same rule computeCompositeOrder applies when it skips a hidden folder
 * without ever looking at the children. (#410: every ancestor, not just the
 * immediate parent — a layer two folders deep is hidden by either of them.)
 *
 * Exists because "hidden" has to mean the same thing to paint as it does to
 * the compositor (#359). It didn't: the only gate on starting a stroke was
 * isLayerLocked, so a hidden layer took strokes normally — into its texture,
 * into the operation log, and out to every participant — while the compositor
 * left it out for everyone, author included. Work that is nowhere visible and
 * everywhere recorded is worse than either refusing it or showing it.
 */
export function isEffectivelyVisible(state: LayerState, id: string): boolean {
  const item = state.items[id]
  if (!item?.visible) return false
  return ancestorsOf(state, id).every(pid => !!state.items[pid]?.visible)
}

/** Every id the panel currently shows, top→bottom: root items plus the
 *  contents of open folders, to any depth. The background is left out — it is
 *  never a selection target (see isLayerLocked's note). */
export function getVisibleOrder(state: LayerState): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (ids: string[]): void => {
    for (const id of ids) {
      if (id === BACKGROUND_LAYER_ID || seen.has(id)) continue
      seen.add(id)
      const item = state.items[id]
      if (!item) continue
      out.push(id)
      if (isFolder(item) && !item.collapsed) walk(item.children)
    }
  }
  walk(state.rootOrder)
  return out
}

/**
 * The members of a selection that actually have to be moved (#413): anything
 * whose ancestor is also selected is dropped, because it rides along inside
 * that folder.
 *
 * Without this, "select a folder and one of its layers, drag both" would move
 * the layer twice — once inside the folder and once on its own, the second
 * lifting it back out of the folder it just travelled in. It is also what makes
 * the awkward cases of a group drag stop being special: a partial selection
 * inside a folder, a folder plus loose layers, an out-of-order pick. Order is
 * preserved from the input, which callers give in the panel's own top→bottom
 * order.
 */
export function normalizeMoveSet(state: LayerState, ids: readonly string[]): string[] {
  const set = new Set(ids)
  return ids.filter(id => !ancestorsOf(state, id).some(a => set.has(a)))
}

/** Collects an id plus every descendant beneath it, to any depth. */
export function collectDescendants(state: LayerState, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (currentId: string): void => {
    if (seen.has(currentId)) return
    seen.add(currentId)
    out.push(currentId)
    const item = state.items[currentId]
    if (item && isFolder(item)) for (const cid of item.children) walk(cid)
  }
  walk(id)
  return out
}

/** Walks the hierarchy bottom→top and returns raster layers with effective
 *  opacity — every enclosing folder's multiplied into the layer's own, to any
 *  depth (#410). A hidden folder is skipped whole, without looking at what is
 *  inside it, which is the same rule isEffectivelyVisible answers with.
 *  `includeHidden` keeps invisible items in the list.
 *
 *  Worth being explicit about what this multiplication is and isn't: a folder's
 *  opacity is folded into each of its layers individually, so a folder is not
 *  a *group* in the compositing sense — two overlapping strokes inside a folder
 *  at 50% do not look like one group drawn at 50%. That was already true of one
 *  level of folders; nesting just multiplies one more factor into the same
 *  chain and costs nothing extra. Real group compositing would mean a
 *  framebuffer per folder, and nothing here assumes it. */
function orderedLayers(state: LayerState, includeHidden: boolean): { id: string; opacity: number }[] {
  const result: { id: string; opacity: number }[] = []
  const seen = new Set<string>()
  const walk = (ids: string[], inherited: number): void => {
    for (const id of [...ids].reverse()) {
      if (seen.has(id)) continue
      seen.add(id)
      const item = state.items[id]
      if (!item || !(includeHidden || item.visible)) continue
      const opacity = inherited * item.opacity
      if (isFolder(item)) walk(item.children, opacity)
      else result.push({ id, opacity })
    }
  }
  walk(state.rootOrder, 1)
  return result
}

export function computeCompositeOrder(state: LayerState): { id: string; opacity: number }[] {
  return orderedLayers(state, false)
}

/** Bottom→top order of the given layers for merging. Hidden layers are
 *  included — a merge destroys its sources, so their pixels must be baked
 *  into the result rather than silently dropped. */
export function computeMergeOrder(state: LayerState, ids: string[]): { id: string; opacity: number }[] {
  const idSet = new Set(ids)
  return orderedLayers(state, true).filter(entry => idSet.has(entry.id))
}

// ── Operation replay (ADR 002: LayerState is derived from the operation log) ──

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length))
}

/** Inserts an id into a container, honoring the reserved bottom slot of the
 *  background layer when targeting the root. */
/** Places `id` at `index`, and nowhere else.
 *
 *  An id must appear exactly once across `rootOrder` and every folder's
 *  `children` — it is a position, not a count. This used to splice blindly,
 *  which held only as long as no operation was ever folded in twice. On
 *  2026-07-31 that stopped being true (see rooms.ts's isCoveredBySnapshot):
 *  a restored room replayed a years-old `layer_merge` on top of a layerState
 *  that already contained its result, and the layer appeared twice in the
 *  panel — then three times, gaining a row per reload, since the corrupted
 *  order was itself uploaded and restored from.
 *
 *  Stripping first makes a repeated fold idempotent instead of cumulative.
 *  The real fix was to stop replaying those operations at all, but this is the
 *  invariant that should have made it a no-op rather than visible corruption,
 *  and it still covers the case that fix cannot: a snapshot landing between a
 *  client's room_state and its own snapshot fetch, leaving it restoring
 *  structure one boundary newer than the server filtered against. */
function insertAt(state: LayerState, items: LayerState['items'], rootOrder: string[],
  id: string, parentId: string | null, index: number): LayerState {
  const strip = (ids: string[]): string[] => ids.filter(existing => existing !== id)
  const cleanedItems = Object.fromEntries(Object.entries(items).map(([key, item]) =>
    isFolder(item) && item.children.includes(id)
      ? [key, { ...item, children: strip(item.children) }]
      : [key, item]))
  const cleanedRoot = strip(rootOrder)

  if (parentId) {
    const folder = cleanedItems[parentId]
    if (folder && isFolder(folder)) {
      const children = [...folder.children]
      children.splice(clampIndex(index, children.length), 0, id)
      return { ...state, items: { ...cleanedItems, [parentId]: { ...folder, children } }, rootOrder: cleanedRoot }
    }
    // target folder vanished from history — fall back to root top
    return { ...state, items: cleanedItems, rootOrder: [id, ...cleanedRoot] }
  }
  const order = [...cleanedRoot]
  const bg = order.indexOf(BACKGROUND_LAYER_ID)
  const at = clampIndex(index, order.length)
  order.splice(bg >= 0 ? Math.min(at, bg) : at, 0, id)
  return { ...state, items: cleanedItems, rootOrder: order }
}

/** Applies one edit to several items at once, returning the *same* state
 *  object when nothing matched — replay runs on every operation of every join,
 *  and callers upstream (overlayLocalFields, React memoization) compare by
 *  reference. */
function patchItems(
  state: LayerState,
  ids: readonly string[],
  edit: (item: LayerItem) => LayerItem,
): LayerState {
  const items = { ...state.items }
  let changed = false
  for (const id of ids) {
    const item = items[id]
    if (!item) continue
    items[id] = edit(item)
    changed = true
  }
  return changed ? { ...state, items } : state
}

/** Detaches ids from wherever they sit — `rootOrder` and every folder's
 *  `children` — without placing them anywhere. Their own subtrees are
 *  untouched: a folder's contents live in `items`, not in the list it was
 *  removed from, so a detached folder arrives at its destination whole. */
function detachAll(state: LayerState, ids: readonly string[]): LayerState {
  const gone = new Set(ids)
  const items: LayerState['items'] = {}
  for (const [id, item] of Object.entries(state.items)) {
    items[id] = isFolder(item) && item.children.some(c => gone.has(c))
      ? { ...item, children: item.children.filter(c => !gone.has(c)) }
      : item
  }
  return { ...state, items, rootOrder: state.rootOrder.filter(id => !gone.has(id)) }
}

/**
 * Relocates one item or a whole group to `(parentId, index)` — a group landing
 * as one contiguous run, in the order given (#413).
 *
 * The refusals are all-or-nothing on purpose. A group move that silently
 * dropped its illegal members would be worse than one that does nothing: the
 * user would see part of the selection move with no way to tell which rule
 * bit, and every other client folds the same partial result.
 */
function applyMove(state: LayerState, op: LayerMoveOperation): LayerState {
  const ids = operationLayerIds(op).filter(id => id !== BACKGROUND_LAYER_ID && state.items[id])
  if (ids.length === 0) return state

  // An id whose ancestor is also moving would be relocated twice — once
  // implicitly, riding inside its folder, and once explicitly, which lifts it
  // back out again. Normalising here rather than trusting the sender keeps
  // replay correct for any operation, however it was authored.
  const moving = new Set(ids)
  const roots = normalizeMoveSet(state, ids)

  if (op.parentId !== null) {
    const target = state.items[op.parentId]
    if (!target || !isFolder(target)) return state
    if (moving.has(op.parentId)) return state
    // (#410) Folders nest now, so "a folder can never become a folder's child"
    // is gone and exactly one structural refusal replaces it: a folder may not
    // move into its own descendant. Enforced *here*, in replay, and not only in
    // the panel's drag handler — every client folds every operation, so a loop
    // that slipped past a UI gate would arrive at all of them and send the
    // walks below into unbounded recursion simultaneously. The UI gate stops
    // the gesture; this stops the state.
    const targetAncestors = ancestorsOf(state, op.parentId)
    for (const id of roots) {
      const item = state.items[id]
      if (item && isFolder(item) && targetAncestors.includes(id)) return state
    }
  }

  // Detach everything *first*, then place. Doing both per item would let each
  // removal shift the indices of the movers still to come, and a scattered
  // selection would arrive interleaved with the rows it travelled past instead
  // of contiguous — which is the one thing this operation promises.
  let next = detachAll(state, roots)
  roots.forEach((id, i) => {
    // `insertAt` clamps, so an index past the end appends; the run stays
    // together either way.
    next = insertAt(next, next.items, next.rootOrder, id, op.parentId, op.index + i)
  })
  return next
}

/** Applies one operation's structural effect. Pixel-only operations (stroke,
 *  clear) and the meta-operations (revoke/undo/redo — they only flip *another*
 *  entry's state, see OperationLog) pass through unchanged. Local view fields
 *  (activeId, selectedIds, collapsed, locked) are not touched — see
 *  overlayLocalFields. */
export function applyContentOp(state: LayerState, op: Operation): LayerState {
  switch (op.type) {
    case 'layer_add': {
      if (state.items[op.layerId]) return state
      const layer: RasterLayer = { kind: 'layer', id: op.layerId, name: op.name, opacity: 1, visible: true, locked: false }
      // Through insertAt rather than a plain prepend so a placement lands in
      // the same container-and-clamp rules layer_move already answers to —
      // including the one that matters most here, the background's reserved
      // bottom slot: "above the active layer" with the background active has
      // to mean above it, not below.
      return insertAt(state, { ...state.items, [op.layerId]: layer }, state.rootOrder,
        op.layerId, op.parentId ?? null, op.index ?? 0)
    }
    case 'folder_add': {
      if (state.items[op.layerId]) return state
      const folder: LayerFolder = { kind: 'folder', id: op.layerId, name: op.name, opacity: 1, visible: true, locked: false, collapsed: false, children: [] }
      // (#410) Placed by the same (container, index) pair as a layer now that
      // folders nest. A folder_add already in the log carries no parentId and
      // lands at root, exactly where it landed when it was recorded.
      return insertAt(state, { ...state.items, [op.layerId]: folder }, state.rootOrder,
        op.layerId, op.parentId ?? null, op.index ?? 0)
    }
    case 'layer_delete': {
      const ids = new Set(op.layerIds)
      ids.delete(BACKGROUND_LAYER_ID)
      const { items, rootOrder } = removeItems(state, ids)
      return { ...state, items, rootOrder }
    }
    case 'layer_move':
      return applyMove(state, op)
    // (#412) Both now carry a list. `operationLayerIds` reads the singular
    // `layerId` form too, which is what every pre-#412 room's log holds and
    // replays on every join.
    case 'layer_opacity':
      return patchItems(state, operationLayerIds(op), item => ({ ...item, opacity: op.opacity }))
    case 'layer_visibility':
      return patchItems(state, operationLayerIds(op), item => ({ ...item, visible: op.visible }))
    case 'layer_owner_lock': {
      const item = state.items[op.layerId]
      if (!item) return state
      return { ...state, items: { ...state.items, [op.layerId]: { ...item, ownerLocked: op.locked } } }
    }
    case 'layer_rename': {
      const item = state.items[op.layerId]
      if (!item) return state
      return { ...state, items: { ...state.items, [op.layerId]: { ...item, name: op.name } } }
    }
    case 'layer_merge': {
      const ids = new Set(op.sources.map(s => s.id))
      ids.delete(BACKGROUND_LAYER_ID)
      const { items, rootOrder } = removeItems(state, ids)
      const merged: RasterLayer = { kind: 'layer', id: op.layerId, name: op.name, opacity: 1, visible: true, locked: false }
      return insertAt(state, { ...items, [op.layerId]: merged }, rootOrder, op.layerId, op.parentId, op.index)
    }
    case 'stroke':
    case 'layer_clear':
    case 'image_import':
    case 'layer_transform':
    case 'operation_revoke':
    case 'operation_undo':
    case 'operation_redo':
      return state
  }
}

/** Rebuilds LayerState by replaying done operations over the room's base state. */
export function replayLayerState(base: LayerState, ops: Operation[]): LayerState {
  let state = base
  for (const op of ops) state = applyContentOp(state, op)
  return state
}

/** Drops references to items that no longer exist after replay/delete. */
export function sanitizeSelection(state: LayerState): LayerState {
  const selectedIds = state.selectedIds.filter(id => state.items[id])
  let activeId = state.activeId
  if (!state.items[activeId]) {
    activeId = state.rootOrder.find(id => id !== BACKGROUND_LAYER_ID) ?? BACKGROUND_LAYER_ID
  }
  if (activeId === state.activeId && selectedIds.length === state.selectedIds.length) return state
  return { ...state, activeId, selectedIds }
}

/** Carries per-user view state (selection, collapsed folders, local locks) from
 *  the current state onto a freshly replayed one — those fields live outside
 *  the shared operation log. */
export function overlayLocalFields(derived: LayerState, current: LayerState): LayerState {
  const items: LayerState['items'] = {}
  for (const [id, item] of Object.entries(derived.items)) {
    const cur = current.items[id]
    if (cur && isFolder(item) && isFolder(cur)) {
      items[id] = { ...item, locked: cur.locked, collapsed: cur.collapsed }
    } else if (cur && !isFolder(item) && !isFolder(cur)) {
      items[id] = { ...item, locked: cur.locked }
    } else {
      items[id] = item
    }
  }
  return sanitizeSelection({ ...derived, items, activeId: current.activeId, selectedIds: current.selectedIds })
}

/** Removes the given ids everywhere: from the items map, from rootOrder and
 *  from every folder's children. */
export function removeItems(
  state: LayerState,
  ids: ReadonlySet<string>,
): Pick<LayerState, 'items' | 'rootOrder'> {
  const items: LayerState['items'] = {}
  for (const [id, item] of Object.entries(state.items)) {
    if (ids.has(id)) continue
    items[id] = isFolder(item) && item.children.some(c => ids.has(c))
      ? { ...item, children: item.children.filter(c => !ids.has(c)) }
      : item
  }
  return { items, rootOrder: state.rootOrder.filter(id => !ids.has(id)) }
}
