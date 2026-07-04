# ADR 001: Layer Panel DnD

## Status

Accepted — implemented in the current `LayerPanel` refactor.

## Context

The layer panel is a core UI surface of the app. Layers live in a flat map (`LayerState.items`) plus two order arrays:

- `rootOrder` — top-to-bottom order of root-level layers and folders.
- `folder.children` — top-to-bottom order inside a folder.

Folders are one level deep only; nested folders are intentionally not supported.

### Original approach: flat list with sentinels

The first implementation rendered a single flat list for `@dnd-kit/sortable`:

```text
[folder, __top_folder, child1, child2, __bot_folder, layerX]
```

- `__top_` — drop zone between the folder header and its children.
- `__bot_` — drop zone after the folder, used to move an item out of the folder.

`reconstructHierarchy` converted the reordered flat list back into `rootOrder` and `folder.children`.

### Problems with the sentinel approach

1. **Cannot drop into a closed folder.** A collapsed folder only emitted `[folder, __bot_]`, and the DnD logic required `!folder.collapsed` to accept a drop on the folder header.
2. **Top sentinel was redundant.** The folder header itself already defines the "enter folder" boundary.
3. **Folders could be nested inside folders.** The types did not forbid it, and the UI allowed it, but `computeCompositeOrder` and the flattening code did not handle recursion.
4. **Dragging an open folder moved only the header.** `arrayMove` shifted only the folder id; the `__top_`, children, and `__bot_` stayed in place, breaking the visual and logical grouping.

## Decision

Use a **single flat `SortableContext`** containing all visible layer rows, and reconstruct the hierarchy from row order. Remove all sentinels.

### Visible flat list

`buildFlatList` produces:

```text
[folderA (depth 0), childA1 (depth 1), childA2 (depth 1), layerX (depth 0)]
```

- Open folders emit their children indented.
- Closed folders emit only the header.
- `depth` is used only for visual indentation (`marginLeft`).

### Block move for folders

When the dragged item is an open folder, the entire visible block `[folder, ...children]` moves together. This fixes the "only header drags" bug.

### Drop onto a folder header = put inside

When an item is dropped on a folder header, it is inserted **after** the header in the flat list. `reconstructHierarchy` then treats it as the first child of that folder.

### Moving out of a folder

To move an item out of a folder, drag it above the folder header or below the last child (i.e. past the folder block). Because `reconstructHierarchy` stops collecting children as soon as it sees an item that does not belong to the folder, the item becomes a root item.

### No nested folders

- Adding a folder always places it in `rootOrder`.
- `computeCompositeOrder` expects one level of folders and is kept as-is.
- Operation log for collaboration also assumes one level.

## Why the nested `SortableContext` attempt was rejected

We first tried rendering nested `SortableContext` instances — one per folder level — inside a single `DndContext`:

```text
root SortableContext
├─ Folder A  →  its own SortableContext for children
└─ Layer X
```

This approach failed because `@dnd-kit/sortable` does not support dragging items between nested `SortableContext` containers. Drag between root and a child context simply did not activate or complete reliably, so DnD stopped working entirely.

The flat-list approach is simpler, relies on a single well-supported dnd-kit pattern, and still gives the correct visual nesting through `depth`.

## Consequences

### What works now

- Reorder root-level layers and folders.
- Drag an open folder and its children as a single block.
- Drop a layer onto any folder header (open or closed) to move it inside.
- Move a layer out of a folder by dragging it past the folder block.
- Background layer stays locked at the bottom.
- Multi-select via Shift/Ctrl+Click and long-tap.
- Context menu (rename / merge down / delete) per row.
- Opacity slider popup per row.

### Trade-offs

- **DOM is flat, not nested.** All rows are siblings; nesting is expressed only through `marginLeft` and the data model. This is required for dnd-kit to handle cross-folder moves.
- **No sentinel drop zones.** Users must drop near an actual row or folder header. This is more predictable than invisible 10 px zones that collision detection often missed.
- **One-level folders only.** The design intentionally does not support nested folders, which keeps rendering, composite order, and future collaboration simpler.

## Files involved

- `apps/web/src/components/LayerPanel/flatList.ts` — flatten / reconstruct helpers.
- `apps/web/src/components/LayerPanel/LayerPanel.tsx` — DnD logic, selection, menus.
- `apps/web/src/components/LayerPanel/LayerRow.tsx` — sortable row rendering.
- `apps/web/src/lib/layers.ts` — `parentOf`, `getVisibleOrder`, `collectDescendants`, `computeCompositeOrder`.

## Notes on pointer-event handling

`useSortable` from dnd-kit attaches its own `onPointerDown` via `listeners`. The panel also needs `onPointerDown` / `onPointerUp` for long-press multi-select on touch. These handlers must be merged so that dnd-kit's listener runs first, then the custom long-press timer starts:

```tsx
onPointerDown={e => { listeners?.onPointerDown?.(e); onPointerDown?.(item.id) }}
```

Overwriting `listeners.onPointerDown` entirely breaks mouse dragging.
