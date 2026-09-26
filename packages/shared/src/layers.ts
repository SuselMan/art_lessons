/** (#613) A room's layer structure — rasters, folders, the order arrays —
 *  and the ids every room starts with. */

export interface RasterLayer {
  kind: 'layer'
  id: string
  name: string
  opacity: number   // 0–1
  visible: boolean
  // (#488) Two locks, and the asymmetry between them is the point:
  //   `locked`      — a shared guard against anyone's hand, the owner's
  //                   included. Anyone may set it and anyone may take it off.
  //   `ownerLocked` — the room owner reserving a layer: it stops everyone
  //                   *but* the owner, and only the owner can release it.
  // Both travel in the log (`layer_lock` / `layer_owner_lock`). `locked` used
  // to be per-user view state that never became an operation, which made it
  // behave backwards — it did not survive its own author's reload, and it did
  // reach everyone else through the snapshot's layerState.
  locked?: boolean
  ownerLocked?: boolean
}

export interface LayerFolder {
  kind: 'folder'
  id: string
  name: string
  opacity: number
  visible: boolean
  collapsed: boolean
  locked?: boolean
  ownerLocked?: boolean
  children: string[]  // ordered ids, top→bottom
}

export type LayerItem = RasterLayer | LayerFolder

export interface LayerState {
  items: Record<string, LayerItem>
  rootOrder: string[]    // top→bottom; index 0 = topmost layer
  activeId: string
  selectedIds: string[]
}

export const BACKGROUND_LAYER_ID = 'background'

/**
 * The layers an operation applies to, in one shape whichever form it was
 * recorded in (#412).
 *
 * `layer_opacity` and `layer_visibility` used to name a single `layerId` and
 * now carry a `layerIds` list. Both forms are permanently valid to *read*:
 * the singular one is written into the operation logs of every room created
 * before #412, and those logs are replayed verbatim on every join. Only the
 * plural form is ever written from here on.
 *
 * Every reader goes through this. A `op.layerId` left somewhere would work
 * perfectly against old rooms and silently ignore every mass change made in
 * new ones — the kind of failure that shows up as "sometimes it doesn't
 * apply" months later.
 */
export function operationLayerIds(op: { layerId?: string; layerIds?: string[] }): string[] {
  if (op.layerIds) return op.layerIds
  return op.layerId === undefined ? [] : [op.layerId]
}

// The two layers every room starts with. Neither is ever produced by a
// `layer_add` operation — they are baked into the client's initial
// LayerState (see makeInitialLayerState) and therefore exist from seq 0 with
// nothing in the operation log to prove it. Anything that reconstructs "which
// layers exist" by folding over the log alone (the server's `aliveIds`
// mirror, #289) MUST seed itself from this list, or it will treat the initial
// layer as never-created and reject every delete/merge/transform touching it.
export const INITIAL_LAYER_ID = 'layer-1'
export const IMPLICIT_LAYER_IDS: readonly string[] = [BACKGROUND_LAYER_ID, INITIAL_LAYER_ID]
