# ADR 001: Layer Panel DnD

## Status

Accepted — implemented in the current `LayerPanel` refactor.

**Amended by #410 (nested folders).** The flat-list-plus-block-move design below
is unchanged and is what made the amendment cheap; the one-level restriction it
records is not. See "Amendment: nested folders (#410)" at the end — read it
alongside the sections it supersedes rather than instead of them, because the
reasons the restriction existed are the reasons the new invariants are shaped
the way they are.

## Context

The layer panel is a core UI surface of the app. Layers live in a flat map (`LayerState.items`) plus two order arrays:

- `rootOrder` — top-to-bottom order of root-level layers and folders.
- `folder.children` — top-to-bottom order inside a folder.

Folders were one level deep only; nested folders were intentionally not
supported. Superseded by #410 — see the amendment at the end.

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
- ~~**One-level folders only.** The design intentionally does not support nested folders, which keeps rendering, composite order, and future collaboration simpler.~~ Lifted by #410; the amendment below explains what that simplicity was actually worth.

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

### Three gestures on one finger (#411, final)

A finger on a row has to be able to do three different things: scroll the list,
reorder the row, open selection mode. Two of them are a vertical drag, so
something has to tell them apart, and there are only two candidates — *where*
the finger lands, or *how long* it waits. The section below records the
distance-based attempt; this one supersedes it.

**By time.** The touch sensor activates on a delay, and the release decides what
the gesture was:

| gesture | outcome |
|---|---|
| swipe | the browser scrolls; the delay never elapses |
| hold, then move | reorder |
| hold, then lift in place | selection mode, that row ticked |

**The sensor split is what makes it work, not the CSS.** `MouseSensor` +
`TouchSensor`, never `PointerSensor` — exactly the change #331 had to make on
MyLessons, for the identical reason. Pointer events cover mouse and finger
alike, so one PointerSensor was racing the delayed TouchSensor and winning it
after 5px, which on a list is a scroll. This was measured, not assumed: before
the split, a quick swipe over a row reordered layers instead of scrolling, and
`touch-action` alone could not fix it either way round — `none` killed the
scroll, `pan-y` killed the drag.

With the sensors split, `.rowMain` can carry `touch-action: pan-y pinch-zoom`
and dnd-kit calls `preventDefault` itself once a long press has promoted the
gesture to a drag.

Three details that are not obvious and were each found by measurement:

- **"Did it move?" is our own observation, not the event's.**
  `DragEndEvent.delta` is derived from the ending event's coordinates, and a
  `touchend` carries no touch point — it reported zero travel for drags that
  had plainly travelled, which sent real reorders down the selection-mode path.
  `dragMovedRef` is set from `onDragMove` instead.
- **The long-press timer is mouse-only.** A scrolling finger never delivers the
  `pointermove` that would cancel it: the browser fires `pointercancel` when it
  takes the pan and then goes quiet, so the timer outlived the swipe and fired
  into it. A finger's route into selection mode is the drag-end path.
- **The click suppression has to be cleared by the next press, anywhere in the
  panel.** On touch the release after a long press does not reliably produce a
  click, so a flag armed for a click that never came ate the *next* tap — a
  dead first press on the toolbar right after entering selection mode.

Nothing may *look* picked up until the drag actually moves (`dragMoved` gates
both the overlay and the dimming), or every long press would show a row lifting
and dropping back before the checkboxes appear.

### Touch activation is by distance, not delay (#411, superseded)

The two gestures on a row — drag, and long-press to open selection mode — both
begin with a finger resting on it, so something has to tell them apart.

`TouchSensor`'s `delay` cannot: at `delay: 200` a resting finger was already a
drag 300 ms before the long press could fire, so long-press-to-select never
worked on touch at all. The first attempt separated them by *place*, moving
dnd-kit's listeners onto the grip. That worked and was wrong: it made a 15px
icon the only way to reorder a row, which is unusable with a finger and was
reported as "drag and drop is broken on the tablet".

They are separated by *what the finger does* instead — `activationConstraint:
{ distance }`. A finger that moves is dragging; a finger that stays put is
selecting; the same threshold that starts the drag cancels the long-press
timer, so neither can steal the other's gesture. The whole row is the handle
again.

Two consequences worth knowing:

- `.rowMain` keeps `touch-action: none`, so a touch starting on a row cannot
  scroll the list. That was true before this too. It is a real wart, and the
  fix for it is not to give up dragging the row.
- Lifting the finger at the end of a long press fires a `click`, and that click
  must be swallowed — see `handleSuppressedClick`. Opening the mode inserts the
  selection bar, everything below shifts down while the finger is still on the
  glass, and the click lands on whatever moved under it. On an emulated tablet
  a long press on the top row released onto the newly-drawn "Select all" button
  and selected every layer. Hence suppression in the capture phase for the
  panel as a whole, rather than a check in the row's own handler.

## Amendment: nested folders (#410)

Folders nest to any depth. This supersedes "No nested folders" and the matching
trade-off above; everything else in this ADR stands, and the flat-list design is
precisely why the change was small.

### What the restriction turned out to cost

The original reasoning — that one level "keeps rendering, composite order, and
future collaboration simpler" — held for collaboration and did not hold for
rendering. `computeCompositeOrder` returns a flat list of raster layers with each
enclosing folder's opacity already multiplied into the layer's own. A folder is
not a group in the compositing sense: there is no framebuffer per folder and no
group blend step. Nesting therefore adds one more factor to a product, not a
render pass. The expensive part of nested folders in other editors does not exist
in this architecture.

What it did cost was legibility: the one-level assumption was not stated in one
place and enforced there, it was spread across seven functions that simply
weren't recursive. Reading any one of them told you nothing.

### The invariant that replaced it

A folder may not become its own descendant. It is enforced in `applyMove` — that
is, on **replay** — and not merely in the drag handler. This distinction is the
whole point: every client folds every operation, so a loop that slipped past a UI
gate would arrive at all of them at once and send the tree walks into unbounded
recursion. A wrong parent is a bug; a loop is a frozen tab for the whole room,
and the tab you would need to fix it is the frozen one.

Two further defences back it up, because a `LayerState` does not only arrive as
operations — it also arrives whole, from a stored snapshot that no present client
authored or validated:

- Every walk over the tree (`ancestorsOf`, `collectDescendants`, `orderedLayers`,
  `buildFlatList`) carries a `seen` set and terminates on a malformed state
  rather than hanging.
- `reconstructHierarchy` places every id exactly once, which makes its output
  structurally acyclic regardless of what it is fed.

### What changed in the flat list

The sentinel scheme was already right; it only needed a stack. `buildFlatList`
emits a nested sentinel pair per folder, and `reconstructHierarchy` /
`buildDropZoneMap` read them back with a stack of open folders instead of a
single "am I inside a folder" cursor. A sentinel closes the folder **named by its
own id**, not whichever folder happens to be innermost, so a scrambled list
degrades to a shallower tree instead of mis-parenting everything after it.

One behaviour genuinely changed rather than generalised: a folder header used to
map to `null` in the drop-zone map, which was indistinguishable from "the thing
enclosing it" back when every folder sat at root. Nested, the two part ways — the
header of an inner folder must map to the outer folder.

`blockFor` no longer assembles the moving block from a folder's children; it
takes the slice of the flat list from the folder's header to its own sentinel.
That is both the recursion-free way to include nested headers and sentinels in
the right order, and what makes dropping a folder inside its own subtree
structurally impossible: the entire subtree leaves `remainingIds` while it is in
the air, so none of its rows are on screen to aim at.

### Consequences

- `rootPlacementAbove` is gone. It existed only because a new folder's position
  had to climb to the active row's root ancestor and collapse to a bare
  `rootOrder` index. New layers and new folders are now placed by one rule,
  `placementAbove`.
- `folder_add` carries an optional `parentId`. Absent means root, which is where
  every already-recorded `folder_add` went, so live rooms replay unchanged.
- Indentation is capped at depth 3 (`LayerRow`). Depth itself is uncapped — the
  row simply stops stepping right, because it already carries eight controls and
  a tablet panel has no width left to give.
- A folder still never becomes the active row. `activeId` is where strokes land,
  and a folder holds no pixels of its own.
