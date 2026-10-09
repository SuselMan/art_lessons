# Detached first-live warmup: two next candidates

No new hardware run. Existing serial source `d5e9709a` evidence and current code were reviewed.

| Existing interval | Wall time |
|---|---:|
| Imports, packet/fields/buffers, encoding and synchronous factories before first submit | 226.1 ms |
| Source + live first queue completion | 3881.9 ms |
| Raw canvas bridge completion | 61.6 ms |
| Scope retirement completion | 0.4 ms |
| Other boundaries and assertions | 12.3 ms |
| Total | 4182.3 ms |

The first source/live completion accounts for 92.8% of warm wall time. It combines driver compilation, queue backlog, execution and synchronization; it is not a measured GPU duration. The preceding 226 ms has no fine-grained measured allocation/compiler split. Raw-only warmup is not the dominant target.

Warmup allocates nine 1024×1024 RGBA8 fields: 37.75 MB decimal or 36 MiB. Geometry is 61,776 bytes and transient buffers 64,304 bytes; only a permitted 4-byte constant remains in the shared ledger. It executes prepared coverage, solvent, pigment/color and one live composite, then a detached raw canvas pass. It constructs brush descriptors but does not run the dry planner or pressure transport. No source input is published to Room/GL/history.

## A. Exact descriptor preparation, no source dispatch warmup

Before readiness, asynchronously compile and cache the exact first-contact source render descriptors (stamp and ribbon coverage, pigment-only and color-only variants with their max/add blends), the baseline source field-op compute descriptor, the live composite and the raw canvas render descriptor. Keep the already prepared solver descriptors separate. Actual owner factories must reuse the identical prepared GPU pipeline objects. Do not replace shader arithmetic, textures, layout or blend states.

Critical guards: compare shader SHA, entry points, override constants, vertex layouts, formats/attachment counts, blend state and auto-layout; reject different device or unresolved/failed preparation; assert zero warm dispatches and no extra fields/history changes; actual before-READY and first-contact factory census must show no unprepared descriptor. Diagnostic tip/trigonometry/sampler variants need separate identities or must be explicitly disabled for this candidate.

Limitation: pipeline readiness does not prove texture allocation, canvas configuration or driver first-dispatch costs disappeared. This is a candidate, not a promise of pause-free drawing. Test first DOWN, the following wet DOWN and same-packed endpoint separately. Preparation wall is loading cost, not a net speedup.

## B. Exact descriptor preparation plus bounded first-use dispatch

Retain the same 1024×1024 field recipe and uniforms/geometry, but restrict the detached source/live raster and landing region to a nonempty 16×16 patch intersecting the synthetic brush. Keep raw canvas configuration and the existing cheap raw pass intact. This warms actual first-use pipelines while bounding expensive pixel work; it changes only discarded shadow output.

Important code seam: `segment.rect` currently limits field-op landing but **does not scissor stamp/ribbon render passes**. Stamp/ribbon encoders do not call `setScissorRect`. Therefore reducing the packet rect alone is not this experiment. A detached-only encoder/pass wrapper must enforce the region on every source render pass while preserving native method receivers and framebuffer signatures. Live composite already supports a scissor. Source field ops derive `canonicalDispatchRect` and dispatch `ceil(width/8) × ceil(height/8)`; a valid 16×16 landing rectangle means 2×2 groups, not 128×128. Verify the actual encoded group sizes and uniform offset, including GL-to-top-row conversion. Whole-field clear/copy passes still remain whole-field and must be reported separately.

Critical guards: same shader/descriptors and pipeline census as A; every raster pass uses a checked nonempty source-intersecting region; actual compute rect/group census; unchanged nine fields, dimensions/formats/filtering and allocation ledger; unchanged original input SHA and original buffer geometry; no publication into authoritative fields/Room history; validation scopes and retirement; same full real first-contact allocations and canonical endpoint after the warm scope. Do not say a smaller warm covers full allocation unless the exact allocation recipe and later first-DOWN allocation census match.

Decision: A separates compilation from dispatch; B distinguishes pixel workload from unavoidable first use. Existing logs cannot predict which removes the 3882 ms queue wall. Both require real-device measurements before replacing current full warmup. Neither changes the physical watercolor model or authorizes publication.
