# True incremental MAX source: isolated chronology plan

## Existing R7/R8 is not this law

Painter832 chooses fb.strokeInk as MAX destination;925 reconstructs inkLoad=inkBase+strokeInk. Fast closure copies displaced field.a/ca into BOTH strokeInk/strokeColor and inkLoad/inkColor. Therefore subsequent MAX is max(movedPaint,newStamp), not independently accumulated raw prefix. Repeated stamp can refill a hole produced by brush movement; raw source inventory depends on motion. No previous raw S record survives. Conversely it is inaccurate to say immutable full historical raw canvas is blindly re-injected: that canvas was overwritten by moved paint.

CPU two-cell example: initial raw[100,0], movement[0,100], same stamp[100,0]. Existing R7 MAX gives[100,100] total200; independent raw prefix remains[100,0], increment0; true moving record remains[0,100] total100.

## Proposed experiment law

Maintain two concepts separately: raw cumulative source S_n=max(S_(n−1),newGroupSource) per channel; moving M_n=Transport_n(M_(n−1)+S_n−S_(n−1)). Colours/deposit have separate paired records, same contact schedule and transport guide. For RGBA8 monotone S, each delta is nonnegative integer; sum_n delta=S_final exactly, regardless grouping, per channel. Transport and moving framebuffer addition can still clip; inventory theorem alone does not assert final mass preservation or pigment/colour cone consistency. Existing sampled geometry/group bridges must be identical ZERO/deferred/interleaved. No original one-shot geometry identity claim until raw-final hash measured.

## Minimal robust implementation footprint

Prefer four additional small RGBA8 research buffers on ONE fixed prefix window, not canonical1536 or full tile. Two prevRaw P/C + two persistentMoving P/C. At maximum512×512 each1MiB =>4MiB additional GPU storage (not8); if final crop guard1024 required, NEVER allocate persistence at1024 without separate approval (16MiB). Existing strokeInk/strokeColor hold current raw S permanently; NEVER write movement into them. Existing inkLoad/inkColor may be overwritten by normal painter rebuild and must not be the sole persistence. Need previousraw separately plus moving separately across prepare clears. Existing pressure/band/c/a/ca are transient, so borrowing them without rewriting lifecycle cannot prove independence.

All source on fixed world ROI S1, no pergroup changing grid origin. After painter: gather rawS into transient field.a/ca (same resampling=S1 nearest-copy), subtract previousraw with existing fieldOp mode1 k−1/max0, then ADD delta to persistentMoving into another transient field target, copy current raw into prevRaw. Copy moving+delta into transient field.a/ca, execute captured identical contacts, store result to persistentMoving. Preserve raw tile films so next MAX observes true rawprefix. Do not let normal gather restore raw as moving. Final normal settle must consume persistentMoving once, base0; raw remains only provenance until release. Coverage/standing retain cumulative original path records. Single blank pigment/tile, fixed contact tape, no priorpaint, film gesture unchanged, no duplicate final contacts.

This needs isolated prepare fast branch plus final stitch override, not a two-line patch. Existing fieldOp mode1 RGBA8 subtract/add sufficient mathematically if operations nearest-copy and moving sum<=255; each buffer read distinct from target. Fullfield existing shader writes allowed only existing canonical allocation; active scissor<=512 must be retained for new delta operations to avoid fullfield traffic. CopyRegionInto and fieldOp output UV scales require explicit source mapping: small textures cannot blindly be passed to canonical-sized fieldOp because same v_uv would resample. Correct use gather/scissor mapped region via existing resample pass or allocate exact small viewport pass; this is a blocking implementation detail until audited.

## First acceptance oracle / safety

4 groups ONLY nine-prefix, followed by8 if timing safe. ZERO requires rawFinal hash across grouped rawsource vs matched no-transport raw oracle, and sumDelta perchannel byte equality. Capture M beforebrush and afterbrush, and rawprev/current distinct IDs. DEFERRED/interleaved same contact field hashes/order/counts. RGBA255 report separately for moving record; if any clipping, theorem still about raw cumulative source, chronology comparison is capacity-limited. Wholegroup readPixels/FBO synchronization timing<=1s; no new512 persistence beyond4MiB; totalbound allocations/procedure static root approval before GPU. Do not reuse R7/R8 files or call source-only total mass invariant until measured.

No production engine edits, runnable spec or GPU started. This plan is feasible at small extra budget but requires explicit region-resample correctness rather than a blind lifecycle patch.
