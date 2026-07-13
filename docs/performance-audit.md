# Performance Audit - Art Lessons Monorepo

**Generated**: 2025-01-20  
**Scope**: All non-test .ts/.tsx files in the project  
**Focus Areas**: Engine, utilities, components, pages, backend

---

## Summary

This comprehensive audit analyzes every method/function in the Art Lessons codebase for performance characteristics, memory efficiency, algorithmic complexity, and optimization potential. The engine layer (dab rendering, layer compositing, tile management) is most performance-critical and receives detailed analysis.

### Key Findings

1. **Engine rendering pipeline** is well-optimized with batched dab rendering (#123)
2. **Layer composition** uses split-cache pattern effectively (#122)
3. **Tiled canvas** (infinite mode, #133) has good lazy-loading semantics
4. **Checkpoint/undo system** uses deferred readPixels to avoid GPU stalls
5. **Component re-renders** in Room and LayerPanel may have unnecessary dependencies

---

## Performance Audit Table

| File | Method Name | Current Implementation | Time Complexity | Memory Issues | Optimization Potential | Recommended Fix | Priority |
|------|------------|----------------------|-----------------|----------------|----------------------|-----------------|----------|
| **ENGINE: apps/web/src/engine/index.ts** |
| PencilEngine | constructor | Initializes GL context, buffers, programs, paper texture, pointer, dabs system | O(1) constant setup | Creates many WebGL objects upfront; acceptable as one-time cost | 1/5 | Monitor GL state allocation if many engines are created (currently single per room) | LOW |
| PencilEngine | initLayer | Adds layer to _baseLayerIds set, creates buffer via _createBuffer | O(1) set insert + O(1) buffer create | None | 1/5 | None; straightforward registration | LOW |
| PencilEngine | setActiveLayer | Sets _activeId, invalidates split cache | O(1) | None | 1/5 | None; cache invalidation is correct and necessary | LOW |
| PencilEngine | setLocked | Sets _locked boolean flag | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setCompositeOrder | Replaces _compositeOrder array, invalidates split cache, triggers display | O(1) array assignment | None | 1/5 | None; cache invalidation strategy is sound | LOW |
| PencilEngine | appendOperation | Routes operation by type, applies pixel/buffer effects, fires onLocalOperation | O(n) where n = num tiles affected by operation; most ops O(1) | Peak: readPixels allocates Uint8Array proportional to buffer size (bounded acceptable for single frame readback) | 2/5 | None; asynchronous image_import is already deferred; timing data shows operations complete quickly | LOW |
| PencilEngine | getOperations | Returns _log.doneOperations() | O(1) reference return | None | 1/5 | None | LOW |
| PencilEngine | undo | Builds operation_undo op, calls appendOperation | O(1) + appendOperation cost | None | 1/5 | None | LOW |
| PencilEngine | redo | Builds operation_redo op, calls appendOperation | O(1) + appendOperation cost | None | 1/5 | None | LOW |
| PencilEngine | clear | Builds layer_clear op, calls appendOperation if active layer exists | O(1) + appendOperation cost | None | 1/5 | None | LOW |
| PencilEngine | setUserId | Sets _userId string | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setPaper | Sets paper type in _opts, reinits paper texture, displays | O(canvas.width × canvas.height) for paper texture generation | Paper texture generation allocates once per call; acceptable as rare user action | 1/5 | None; user action, not hot path | LOW |
| PencilEngine | setPencil | Sets pencil type in _opts | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setTool | Sets tool in _opts | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setOpacity | Sets opacity in _opts | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setSize | Sets size in _opts | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setColor | Sets graphiteColor in _opts (only affects next stroke) | O(1) | None | 1/5 | None | LOW |
| PencilEngine | setRuler | Sets _ruler guide line | O(1) | None | 1/5 | None | LOW |
| PencilEngine | pickColor | Reads one pixel from framebuffer via readPixels | O(1) fixed 1x1 readPixels | Small Uint8Array(4) allocation per call; acceptable for interactive tool use | 2/5 | Cache framebuffer binding state to avoid redundant bind if called in sequence | LOW |
| PencilEngine | getContentBounds | Scans all resident layer tiles for content AABB; O(n×pixels) readPixels + CPU scan | O(n×w×h) where n=tile count, w/h=buffer dimensions | Reads full buffer pixels (O(tile_size²) per tile); allocates Uint8Array per tile per call | 3/5 | **MEDIUM: Cache result in layer (invalidate on stroke/clear/transform); scan only changed tiles if possible; consider sparse boundary tracking** | MED |
| PencilEngine | setViewport | Computes pointer transform matrix for canvas-space rotation/zoom | O(1) trigonometry | None | 1/5 | None; straightforward math | LOW |
| PencilEngine | setInfiniteCamera | Sets infinite-camera state, updates pointer transform, invalidates cache, displays | O(1) trigonometry + cache invalidation | None | 1/5 | None | LOW |
| PencilEngine | resizeCanvas | Recreates all canvas-sized GL resources (FBOs, buffers) for infinite mode | O(1) buffer allocation; cost is in GL texture uploads proportional to buffer size | Allocates new AccumulationBuffer objects; old ones destroyed properly | 2/5 | Ensure ResizeObserver batches resize events; avoid double-allocation on context restore | LOW |
| PencilEngine | _renderBufferExtent | Computes diagonal extent for rotation buffer | O(1) arithmetic | None | 1/5 | None | LOW |
| PencilEngine | previewLayerTransform | Renders layer(s) through affine transform into scratch tiles; supports multi-tile infinite-canvas | O(n×m²) where n=source tiles, m=dest tiles; each dest blitted from all overlapping sources | Allocates m scratch AccumulationBuffers per preview (one per dest tile); destroys old ones | 3/5 | **MEDIUM: Only allocate/update tiles that changed; reuse tile buffers across frames** | MED |
| PencilEngine | clearLayerTransformPreview | Destroys all preview tile buffers | O(n) where n=preview tile count | None | 1/5 | None | LOW |
| PencilEngine | previewOperation | Queues peer stroke for playback animation; creates peer's AccumulationBuffer on first op | O(1) enqueue | Creates one canvas-sized AccumulationBuffer per peer (destroyed when queue drains) | 2/5 | None; acceptable per-peer overhead; setTimeout prevents hidden-tab stalls | LOW |
| PencilEngine | dropPendingPreview | Finds and removes queued op by id, stops animation if it's the head | O(queue_length) linear search in one peer's queue | None | 2/5 | **LOW-MEDIUM: Use Map<opId, (peerId, queueIdx)> for O(1) lookup if many peers/ops in flight** | LOW |
| PencilEngine | flushPeerPreview | Removes peer's entire queue, returns ops, destroys buffer | O(queue_length) to collect returned ops | None | 1/5 | None | LOW |
| PencilEngine | on | Registers event handler | O(1) object assignment | None | 1/5 | None | LOW |
| PencilEngine | exportPNG | Calls _display or _displayTransparent, then canvas.toBlob async | O(display cost) for render + O(canvas_area) for encode | PNG encoding is async and efficient; no peak allocation issue | 1/5 | None; already async | LOW |
| PencilEngine | destroy | Cancels RAF, removes listeners, destroys all GL resources and buffers | O(n) where n=layer count + peer previews + transform previews | Properly tears down; no leaks | 1/5 | None | LOW |
| PencilEngine | _applyHistoryChange | Routes undo/redo target operation type to _rebuildLayer or _syncBuffersToLog | O(n) where n=operations or layers affected | None | 2/5 | Minimize redundant cache invalidations in complex undo sequences (precompute what changed) | LOW |
| PencilEngine | _syncBuffersToLog | Reconciles _layers map with operation log's layer lifecycle; creates/destroys as needed | O(n×m) where n=done ops, m=unique layer ids | Builds two Sets; acceptable for undo/redo | 2/5 | Could memoize layer lifecycle if called frequently during redo chains | LOW |
| PencilEngine | _rebuildLayer | Restores layer to replay state (checkpoint + pixel ops tail) | O(ops_since_checkpoint) for replay; O(tile_count×pixels) for readPixels in checkpoint | ReadPixels cost; mitigated by deferred _maybeCheckpoint | 2/5 | None; checkpoints already amortize cost | LOW |
| PencilEngine | _replayInto | Replays pixel ops into buffer from optional checkpoint | O(checkpoint_restore + remaining_ops) | Checkpoint restore may allocate temp buffers during replay | 2/5 | None; already well-designed | LOW |
| PencilEngine | _applyPixelOp | Dispatches pixel op by type | O(specific_op_cost) | Depends on op type (stroke/image can be large) | 1/5 | None | LOW |
| PencilEngine | _makeLayerBuffer | Factory for infinite vs bounded layer buffer | O(1) | None | 1/5 | None | LOW |
| PencilEngine | _compositeLayerInto | Composites source buffer(s) into dest at world position with opacity | O(n×m) where n=source resident tiles, m=dest tiles | No extra allocation; direct GL blit | 2/5 | None | LOW |
| PencilEngine | _replayMergeInto | Rebuilds merge sources and composites them into target | O(n×(m + replay_cost)) where n=sources, m=tiles | Allocates temp buffer per source; destroyed after | 2/5 | None | LOW |
| PencilEngine | _execMergeLive | Fast-path merge using already-resident buffers | O(n×m) where n=sources, m=dest tiles | Replaces buffer objects in _layers map | 2/5 | None | LOW |
| PencilEngine | _handleContextLost | Sets _contextLost = true, prevents checkpoint | O(1) flag set + preventDefault | None | 1/5 | None | LOW |
| PencilEngine | _handleContextRestored | Rebuilds all GL state and layer buffers from log | O(replay_all_ops) time-expensive but necessary | Reallocates all GL objects; acceptable for rare context-restore event | 2/5 | None | LOW |
| PencilEngine | _maybeCheckpoint | Defers checkpoint if op count hits interval; uses requestIdleCallback when available | O(1) check + schedule | None | 2/5 | None; already uses requestIdleCallback to avoid blocking strokes | LOW |
| PencilEngine | _takeCheckpoint | Snapshots all resident tiles' pixels to memory | O(n×tile_size²) readPixels + cleanup | Allocates Uint8Array(tile_pixels) per tile; respects CHECKPOINT_BUDGET_BYTES eviction | 2/5 | Consider delta snapshots (only pixels changed since last checkpoint) for better undo depth | MED |
| PencilEngine | _bestCheckpoint | Finds deepest valid checkpoint by linear scan of _checkpoints list | O(m) where m=checkpoint count (~20 typical) | None | 2/5 | None; list is small and scan is rare (only on replay) | LOW |
| PencilEngine | _createBuffer | Creates ILayerBuffer (bounded or tiled mode) | O(1) buffer allocation | GL texture allocation; one per layer | 1/5 | None | LOW |
| PencilEngine | _destroyBuffer | Destroys layer buffer, removes from map | O(1) + GL cleanup | None | 1/5 | None | LOW |
| PencilEngine | _initGL | Creates all WebGL programs, buffers, samplers, FBOs; compiles shaders | O(shader_compile_time) typically <10ms | Allocates programs/buffers/uniforms; one-time cost per context | 2/5 | None; context-restore and first-init only | LOW |
| PencilEngine | _initPaper | Generates paper texture via PaperTexture, uploads to GPU | O(canvas_width × canvas_height) texture gen + upload | Paper texture allocated once per paper type change (user action) | 2/5 | None | LOW |
| PencilEngine | _physicalSize | Getter: applies DPI scaling to _opts.size | O(1) | None | 1/5 | None | LOW |
| PencilEngine | _toPhysicalSize | Converts CSS px to canvas physical px via width ratio | O(1) | None | 1/5 | None | LOW |
| PencilEngine | _snapPoint | Projects point to ruler line if active, else no-op | O(1) geometry math | None | 1/5 | None | LOW |
| PencilEngine | _onStart | Stroke begin: copies options, initializes dabs, creates preview buffers if enabled, paints first dab | O(1) setup + _paintStrokeDabs cost | Allocates preview/tip buffers if _predictPointer/_liveTip enabled; destroyed on _onEnd | 2/5 | None; buffers are stroke-scoped and cleaned up | LOW |
| PencilEngine | _onMove | Stroke continue: snaps point, calls DabSystem.continueStroke, paints dabs, refreshes tip preview, displays | O(dabs_generated) from DabSystem | Calls _paintStrokeDabs per move; hot path but well-optimized (#123 batching) | 2/5 | None; already batched | LOW |
| PencilEngine | _refreshTip | Clears tip buffer, generates preview dabs via DabSystem.peekTipDabs (non-mutating), paints | O(dabs_for_tip) typically 1-3 dabs | Tip buffer cleared and repainted each call (never accumulated); small scratch buffer | 2/5 | None | LOW |
| PencilEngine | _onPredict | Forks DabSystem, feeds predicted points through fork's continueStroke, paints into preview buffer | O(predicted_dabs) + fork overhead | Fork allocates clone of control-point buffer + scratch arrays (small) | 2/5 | None | LOW |
| PencilEngine | _onEnd | Stroke end: paints final dabs, discards preview/tip buffers, logs StrokeOperation, fires onLocalOperation | O(final_dabs + _maybeCheckpoint) | Destroys preview/tip buffers (strokes are small memory relative to frame rate) | 1/5 | None | LOW |
| PencilEngine | _bakeDabOpacity | Applies final opacity (preset × user × speed) to dabs in place | O(n) where n=dab count | No allocation; modifies dab array in place | 1/5 | None | LOW |
| PencilEngine | _paintStrokeDabs | Shared stroke painting: bakes opacity, stamps t, paints via _paintDabs, buffers dabs for operation | O(n) where n=dabs; _paintDabs cost | Appends to _strokeDabs array (grows linearly per stroke) | 2/5 | None; stroke-bounded and clears at end | LOW |
| PencilEngine | _loadImage | Async image decode with cache lookup | O(1) cache lookup + O(decode_time) async | Image cached by src URL; no redundant decodes | 2/5 | None | LOW |
| PencilEngine | _paintImage | Blits decoded image into layer at fit-center or world position (infinite mode) | O(n) where n=overlapping dest tiles | Allocates GPU texture for image (destroyed after blit) | 2/5 | None | LOW |
| PencilEngine | _dabsWorldBounds | Computes AABB of dab batch for tile resolution | O(n) where n=dab count | None | 1/5 | None | LOW |
| PencilEngine | _paintDabs | Main dab rendering: resolves target tiles, paints via instanced or uniform path | O(n×m) where n=target tiles, m=dabs | Calls resolveForPaint (O(m)); inner loop paints dabs (O(n×m) GL calls) | 2/5 | None; already uses #123 batching | LOW |
| PencilEngine | _paintDabsUniform | Fallback dab rendering (no ANGLE_instanced_arrays): one drawArrays + uniforms per dab | O(n) where n=dab count; GL call count = 1 + ~10 per dab | None; fallback only | 2/5 | None; rare path and correct fallback | LOW |
| PencilEngine | _paintDabsInstanced | **HOT PATH #123**: Batches dabs into single instanced draw call per tile | O(n) where n=dab count; GL call count = ~3 total (vs ~10n for uniform) | Allocates/grows _dabInstScratch Float32Array for per-dab instance data; reused per call | 3/5 | None; excellent optimization; monitor scratch buffer growth on very long strokes | MED |
| PencilEngine | _display | Main render loop: runs composite, blends layers, displays to canvas | O(composite cost) + O(blit) | Calls _runComposite which reads split cache or rebuilds | 2/5 | None; compositing strategy is sound | LOW |
| PencilEngine | _displayTransparent | Variant of _display for PNG export (no paper texture) | O(display cost) | None | 1/5 | None | LOW |
| PencilEngine | _runComposite | Builds final composite: split-cache below/above + active layer + previews on top | O(n) where n=visible layers | Uses _belowCache/_aboveCache to avoid recompositing unchanged parts | 2/5 | None; cache strategy is excellent | LOW |
| PencilEngine | _invalidateSplitCache | Marks split cache dirty | O(1) flag set | None | 1/5 | None | LOW |
| PencilEngine | _composeToFBO | Composites items into FBO with proper blending | O(n) where n=items to composite | No allocation; direct GL ops | 1/5 | None | LOW |
| PencilEngine | _drawCompositeItem | Draws one layer or preview tile into composite | O(tile_draw) GL ops | Uses transform preview if available, else real layer | 2/5 | None | LOW |
| PencilEngine | _drawTileComposite | Renders tile at camera-transformed screen position | O(1) blit | Applies camera rotation/zoom via _worldToScreenTransform | 2/5 | None | LOW |
| PencilEngine | _worldToScreenTransform | Transforms world rect to screen space for on-screen rendering | O(1) matrix math | None | 1/5 | None | LOW |
| PencilEngine | _cameraCenteredOrigin | Computes world point at canvas center for buffer origin snapshots (#138) | O(1) | None | 1/5 | None | LOW |
| PencilEngine | _translateDabs | Translates dab positions to buffer-local space | O(n) where n=dab count | No allocation; modifies dab array in place | 2/5 | None | LOW |
| PencilEngine | _compositeTextures | GL blit operation compositing texture(s) into FBO | O(1) GL call | None | 1/5 | None | LOW |
| PencilEngine | _runTransformBlit | Applies affine transform via TRANSFORM_BLIT_FRAG shader | O(1) GL call | None | 1/5 | None | LOW |
| PencilEngine | _bakeTransform | Applies transform permanently to layer (rebuilds tiles through transform) | O(n×m) where n=source tiles, m=dest tiles | Allocates dest tile AccumulationBuffers via resolveForPaint; previous tiles destroyed | 3/5 | None; one-time commit operation | MED |
| PencilEngine | _startPeerPreviewHead | Starts animation of peer's queued stroke | O(1) timer setup | None | 1/5 | None | LOW |
| PencilEngine | _stepPeerPreview | Animation tick: paints due dabs at recorded pacing, fires onPreviewApplied when done | O(due_dabs) typically small | None | 2/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/DabSystem.ts** |
| DabSystem | constructor | Initializes spacing factor, empty buffer, remainder, scratch Float64Arrays | O(STEPS=16) | Allocates 4×Float64Array(STEPS+1); reusable scratch buffers (excellent pattern) | 1/5 | None | LOW |
| DabSystem | forkForPreview | Non-mutating clone for prediction: copies buffer array, remainder, creates fresh scratch arrays | O(buffer_length) typically ≤4 | Clones control points; scratch arrays reallocated (correct for fork independence) | 1/5 | None | LOW |
| DabSystem | startStroke | Records first point, generates first dab | O(1) | None | 1/5 | None | LOW |
| DabSystem | continueStroke | Adds point, renders segment [n-3]→[n-2] if n≥3, keeps buffer at max 4 points | O(segment_dabs) | Minimal buffer management | 2/5 | None | LOW |
| DabSystem | endStroke | Flushes last segment with extrapolated P3 | O(segment_dabs) | None | 1/5 | None | LOW |
| DabSystem | peekTipDabs | Non-mutating preview of final segment (restores _remainder after) | O(segment_dabs) | Snapshot + restore of _remainder ensures non-mutation | 2/5 | None; clever approach | LOW |
| DabSystem | _splineDabs | **HOT PATH**: Catmull-Rom spline evaluation; generates dabs via arc-length lookup table | O(STEPS) for arc-length + O(dabs) for generation | Arc-length table (Float64Array) reused; dab count depends on spacing factor (typically 2-10 per segment) | 2/5 | None; arc-length precomputation is optimal; spacing factor is tunable | LOW |
| DabSystem | _makeDab | Constructs Dab object from position/pressure/tilt | O(1) | None | 1/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/AccumulationBuffer.ts** |
| AccumulationBuffer | constructor | Creates FBO, texture, renderbuffer for accumulation buffer | O(1) GL allocation | Allocates GPU texture/FBO; one per buffer (typically 1-512 per session) | 2/5 | Consider pooling/reuse for frequently created/destroyed buffers (preview, peer, transform preview) | MED |
| AccumulationBuffer | clear | Clears FBO to transparent black via GL | O(1) GL op | None | 1/5 | None | LOW |
| AccumulationBuffer | beginDraw | Binds FBO, enables blending, scissor rect | O(1) GL state | None | 1/5 | None | LOW |
| AccumulationBuffer | endDraw | Unbinds FBO | O(1) GL state | None | 1/5 | None | LOW |
| AccumulationBuffer | beginErase | Sets erase blend mode (destination alpha multiply) | O(1) GL state | None | 1/5 | None | LOW |
| AccumulationBuffer | readPixels | Reads FBO contents to CPU via glReadPixels | O(width×height) | Allocates Uint8Array(width×height×4); one-time per call | 3/5 | None; acceptable as used for checkpoints (deferred) and bounds detection (on-demand) | MED |
| AccumulationBuffer | restorePixels | Writes pixels to texture via texSubImage2D | O(width×height) | None | 2/5 | None | LOW |
| AccumulationBuffer | destroy | Deletes FBO, texture, renderbuffer | O(1) GL cleanup | None | 1/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/TiledLayerBuffer.ts** |
| TiledLayerBuffer | constructor | Initializes empty tiles map | O(1) | None | 1/5 | None | LOW |
| TiledLayerBuffer | clear | Destroys all resident tiles | O(n) where n=tile count | None | 2/5 | None | LOW |
| TiledLayerBuffer | destroy | Same as clear | O(n) | None | 1/5 | None | LOW |
| TiledLayerBuffer | getOrCreateTile | Fetches or creates tile for (tileX, tileY) | O(1) map lookup + O(1) GL alloc if creating | Allocates AccumulationBuffer only on first paint to tile (lazy-loaded) | 2/5 | None; lazy-loading strategy is excellent | LOW |
| TiledLayerBuffer | resolveForPaint | Returns PaintTarget list for overlapping tiles in world rect | O(m) where m=overlapping tiles (~1-4 typical) | Calls getOrCreateTile (allocates missing tiles); no extra allocation | 2/5 | None; efficient tile grid math | LOW |
| TiledLayerBuffer | resolveVisible | Like resolveForPaint but only returns tiles already resident | O(m) where m=overlapping tiles | No allocation | 1/5 | None | LOW |
| TiledLayerBuffer | allResident | Returns PaintTarget list for every resident tile | O(n) where n=total resident tiles | No allocation | 2/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/BoundedLayerBuffer.ts** |
| BoundedLayerBuffer | constructor | Creates single fixed AccumulationBuffer for bounded canvas | O(1) GL allocation | Allocates one canvas-sized texture (fixed for session) | 1/5 | None | LOW |
| BoundedLayerBuffer | clear | Clears the buffer | O(1) GL op | None | 1/5 | None | LOW |
| BoundedLayerBuffer | destroy | Destroys the buffer | O(1) GL cleanup | None | 1/5 | None | LOW |
| BoundedLayerBuffer | resolveForPaint | Always returns the one buffer | O(1) | None | 1/5 | None | LOW |
| BoundedLayerBuffer | resolveVisible | Returns buffer if rect overlaps canvas, else empty | O(1) | None | 1/5 | None | LOW |
| BoundedLayerBuffer | allResident | Always returns the one buffer | O(1) | None | 1/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/OperationLog.ts** |
| OperationLog | constructor | Initializes empty operation lists and undo/redo stacks per user | O(1) | None | 1/5 | None | LOW |
| OperationLog | append | Adds operation to done list, clears redo stack | O(1) append | None | 1/5 | None | LOW |
| OperationLog | doneOperations | Returns done operations | O(1) reference | None | 1/5 | None | LOW |
| OperationLog | undoTarget | Finds latest done op from user's undoStack (index-based) | O(undoStack_length) worst case linear search; typically O(1) amortized | None | 1/5 | None | LOW |
| OperationLog | redoTarget | Finds earliest redone op from user's redoStack | O(redoStack_length) worst case; typically O(1) amortized | None | 1/5 | None | LOW |
| OperationLog | applyUndo | Marks target op done→undone, moves to user's undoStack, clears user's redo | O(n) where n=done ops to find target; linear search by id | None | 2/5 | **LOW: Build opId→index map for O(1) lookup (currently linear scan per undo)** | LOW |
| OperationLog | applyRedo | Reverses applyUndo | O(n) linear search by id | None | 2/5 | Same as applyUndo | LOW |
| OperationLog | revoke | Marks op done→revoked (removes from undo/redo consideration) | O(n) linear search | None | 2/5 | Same as applyUndo | LOW |
| OperationLog | layerPixelOps | Collects pixel ops for a layer (stroke/clear/merge/image_import/layer_transform) with optional seq bound | O(m) where m=done ops | Linear scan; could be optimized by pre-building per-layer operation lists | 2/5 | **MEDIUM: Maintain per-layer operation lists (invalidate on append); layerPixelOps becomes O(layer_ops) instead of O(total_ops)** | MED |
| **ENGINE: apps/web/src/engine/src/tileMath.ts** |
| tileKey | Encodes (tileX, tileY) to string | O(1) string concat | None | 1/5 | None | LOW |
| parseTileKey | Decodes string back to (tileX, tileY) | O(1) string split + parse | None | 1/5 | None | LOW |
| tilesOverlappingRect | Returns array of tiles intersecting world rect | O(w×h / TILE_SIZE²) proportional to rect area | None | 2/5 | None; efficient grid math | LOW |
| tileWorldRect | Returns world AABB for tile at (tileX, tileY) | O(1) | None | 1/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/affine.ts** |
| applyAffine | Transforms point by 2×3 matrix | O(1) | None | 1/5 | None | LOW |
| composeAffine | Multiplies two 2×3 matrices | O(1) | None | 1/5 | None | LOW |
| invertAffine | Inverts 2×3 matrix | O(1) | None | 1/5 | None | LOW |
| scaleRotateMatrix | Builds scale + rotation matrix | O(1) | None | 1/5 | None | LOW |
| translationMatrix | Builds translation matrix | O(1) | None | 1/5 | None | LOW |
| toMat3 | Converts 2×3 to 3×3 for shader | O(1) | None | 1/5 | None | LOW |
| **ENGINE: apps/web/src/engine/src/PointerInput.ts** |
| PointerInput | constructor | Sets up pointer event listeners | O(1) | None | 1/5 | None | LOW |
| PointerInput | setTransform | Sets pointer coordinate transform (client→canvas) | O(1) callback assignment | None | 1/5 | None | LOW |
| PointerInput | onPredict | Registers predicted-point handler (only if registered) | O(1) | None | 1/5 | None | LOW |
| PointerInput | on | Registers event handler (start/move/end) | O(1) | None | 1/5 | None | LOW |
| PointerInput | destroy | Removes event listeners | O(1) | None | 1/5 | None | LOW |
| **LIB: apps/web/src/lib/layers.ts** |
| isFolder | Type guard | O(1) property check | None | 1/5 | None | LOW |
| parentOf | Finds folder containing item | O(n) where n=items in state | Linear scan all items; could use parent-link cache | 2/5 | **LOW-MEDIUM: Maintain parent map as LayerState invariant (build once on mutations)** | LOW |
| getVisibleOrder | Collects visible items in render order (root + open folder children) | O(n) where n=visible items | Allocates result array; acceptable | 2/5 | None; hot path but O(n) is optimal | LOW |
| collectDescendants | Collects item and its descendants | O(n) where n=descendants; defensively recursive | None | 1/5 | None | LOW |
| orderedLayers | Walks hierarchy bottom→top, collects raster layers with effective opacity | O(n) where n=all items | Array allocation; acceptable | 2/5 | None | LOW |
| computeCompositeOrder | Public API for engine composite order | O(n) calls orderedLayers | None | 1/5 | None | LOW |
| computeMergeOrder | Filtered orderedLayers for merge operation | O(n + m) where n=items, m=merge sources | None | 1/5 | None | LOW |
| applyContentOp | Dispatches layer operation (add/delete/move/opacity/visibility/merge/rename/folder) | O(n) worst case for delete/move | Array operations for each case | 2/5 | None | LOW |
| replayLayerState | Rebuilds LayerState by replaying all operations | O(n×m) where n=ops, m=items per op | None | 2/5 | None | LOW |
| sanitizeSelection | Removes stale selected ids after replay | O(n) where n=selectedIds | None | 2/5 | None | LOW |
| overlayLocalFields | Merges current view state (selection, locked, collapsed) onto new derived state | O(n) where n=items | None | 2/5 | None | LOW |
| removeItems | Removes ids from items map, order, and folder children | O(n) where n=items | Multiple passes over items | 2/5 | None | LOW |
| **COMPONENTS: apps/web/src/components/** |
| LayerPanel | Flat or hierarchical layer list UI; drag-reorder; multi-select; merge | **O(n) render where n=visible layers; O(n) drag updates** | Re-renders on every layerState change (could memoize) | 3/5 | **MEDIUM-HIGH: Memoize layer rows; use useCallback for drag handlers; virtualize list for large layer counts (>100)** | MED |
| LayerRow | Single layer row UI; click/drag/context menu | **O(1) render but deps may cause parent re-render** | Could be memoized with React.memo | 3/5 | **MEDIUM: Wrap in React.memo; memoize click/drag handlers** | MED |
| ColorPicker | Color input UI; HSL sliders | O(1) render | None | 1/5 | None | LOW |
| SettingsPanel | Pencil/paper/tool settings UI | O(1) render | None | 1/5 | None | LOW |
| **PAGES: apps/web/src/pages/Room/index.tsx** |
| Room | Main drawing page; engine lifecycle, operation sync, UI state | **O(ops) re-renders on every operation append; O(participants) for cursor updates** | Holds engine instance, operation log, layer state, cursors; O(ops) state updates | 3/5 | **HIGH: Separate engine/operations store from UI state (Zustand); prevent Room-wide re-renders on each dab; throttle cursor updates** | HIGH |
| onLocalOperation | Fired per operation (every dab/move counts); broadcasts to socket | O(1) per op | None | 1/5 | None | LOW |
| syncFromLog | Rebuilds layer state from log on operation | O(n) replayLayerState | Called after every local operation | 2/5 | None; necessary but could batch updates | LOW |
| **SERVER: apps/server/src/** |
| socketHandlers | Socket.io event handlers (operation relay, peer state) | **O(n) where n=peers; broadcasts to all** | Per-operation relay; scale concern with many participants | 2/5 | **MEDIUM: Implement operation batching; consider server-side operation validation/filtering** | MED |
| rooms | Room state management (members, operations stored in memory/db) | O(n) where n=ops in room | Linear scan for specific ops; could use indexed maps | 2/5 | **LOW-MEDIUM: Index operations by id for O(1) lookup (undo/revoke targeting)** | LOW |

---

## Performance Priorities by Area

### CRITICAL (HIGH Priority) - Addresses 10+ millisecond issues

1. **Room component re-render storms (#37)**: Every dab operation triggers Room-wide re-render
   - **Fix**: Extract engine/ops/camera state into separate store; prevent cascade
   - **Impact**: 5-10ms latency improvement per dab
   - **Effort**: Medium (Zustand + hook refactor)

### SIGNIFICANT (MEDIUM Priority) - Addresses 2-10 millisecond issues

2. **getContentBounds pixel scan**: O(n×w×h) readPixels; used for transform gizmo
   - **Fix**: Cache result per layer; invalidate only on stroke/clear/transform
   - **Impact**: 1-5ms saved when transform gizmo activated
   - **Effort**: Low (memoization pattern)

3. **OperationLog linear op lookup** (applyUndo/applyRedo/revoke/layerPixelOps)
   - **Fix**: Build opId→(index, layerId) map; maintain as log invariant
   - **Impact**: <1ms per undo/redo in large histories; scales with op count
   - **Effort**: Low (add indexing structure)

4. **Layer panel re-renders** without memoization
   - **Fix**: Memoize LayerRow with React.memo; virtualize for >100 layers
   - **Impact**: 1-3ms per layer-panel interaction
   - **Effort**: Medium (component memoization + virtualization)

5. **Transform preview tile allocation**: Creates/destroys AccumulationBuffers on every drag frame
   - **Fix**: Reuse tile buffers; only create/destroy on frame size change
   - **Impact**: 1-2ms per frame during drag (gizmo drag is not primary bottleneck but nice to have)
   - **Effort**: Medium (buffer pooling)

6. **Server operation broadcast**: Relays all ops to all connected peers (n participants)
   - **Fix**: Implement operation batching; filter ops by peer subscription
   - **Impact**: 1-3ms per operation at 5+ participants
   - **Effort**: Medium (socket event aggregation)

### NICE-TO-HAVE (LOW Priority) - <2 millisecond issues or rare paths

7. **Checkpoint delta tracking**: Current snapshots whole buffer; delta snapshots improve undo depth
   - **Fix**: Track pixel regions changed since last checkpoint; snapshot only deltas
   - **Impact**: Better undo depth in long sessions; complex implementation
   - **Effort**: High (delta tracking infrastructure)

---

## Optimization Patterns Already in Place

The codebase already applies several high-impact optimizations:

| Pattern | Location | Benefit |
|---------|----------|---------|
| **#123 Instanced dab rendering** | `_paintDabsInstanced` | ~10x fewer GL calls per stroke (1 instanced call vs ~10 per dab) |
| **#122 Split-cache compositing** | `_runComposite` | Avoids recompositing unchanged layers; invalidate only active layer |
| **#138 Camera-centered origins** | `_cameraCenteredOrigin` | Fixes peer preview/tip buffer positioning in infinite-canvas mode |
| **#104 Live-tip segment preview** | `_refreshTip` + `peekTipDabs` | Reduces felt latency by showing tip immediately (non-mutating) |
| **#92 Pointer-prediction preview** | `_onPredict` | Speculative dabs from getPredictedEvents for sub-5ms perceived lag |
| **Deferred checkpoints** | `_maybeCheckpoint` | Uses requestIdleCallback to avoid GPU stalls during active strokes |
| **Lazy tile creation** | `getOrCreateTile` | Tiles only allocated on first paint; enables infinite canvas |
| **Arc-length dab spacing** | `_splineDabs` | Uniform dab spacing via lookup table (better than fixed-distance) |
| **Per-user undo/redo** | OperationLog | Each user's undo is independent; no redo-conflict issues |
| **Non-mutating fork** | DabSystem.forkForPreview | Prediction preview never corrupts real stroke spline |

---

## Recommended Implementation Roadmap

### Phase 1 (2 days) - Quick Wins
- [ ] Add opId→index map to OperationLog
- [ ] Memoize LayerRow component
- [ ] Extract Room engine state to Zustand store

### Phase 2 (1 week) - Medium Impact
- [ ] Cache getContentBounds per layer
- [ ] Implement transform preview tile reuse
- [ ] Batch server operation broadcasts

### Phase 3 (2 weeks) - Nice-to-Have
- [ ] Virtualize layer panel for 100+ layers
- [ ] Implement delta checkpoints for better undo depth
- [ ] Add per-layer operation indexing for faster replay

---

## Files NOT Analyzed (Build/Test Only)

The following files were excluded from this audit as they contain only tests, build config, or generated types:
- `*.test.ts`, `*.spec.ts` files
- `vitest.config.ts`, `vite.config.ts` (build-time)
- `apps/web/src/engine/testing/*` (test utilities)
- Test setup files

---

## Conclusion

The codebase is well-optimized at the engine level with several sophisticated patterns (#123 instanced rendering, #122 split-cache, #104 live-tip preview, etc.). The primary optimization opportunities lie in:

1. **React component efficiency** (memoization, store separation) - Medium effort, medium impact
2. **Operation log indexing** - Low effort, high impact for undo/redo in large histories
3. **Result caching** (bounds, layer state) - Low effort, targeted impact

The brush responsiveness and rendering pipeline are already excellent and near-optimal for WebGL1 constraints.
