# Verified-uniform backing retention: external candidate only

Base: `397d03f5`, AccumulationBuffer content was byte-identical to current during preparation. No runtime source modifications, browsers or GPU runs. External patch: `candidates/uniform-retain.patch`; manifest records both touched source files. `git apply --check` passed before concurrent integration. This patch is independent of the fixed-window-skip candidate.

## Admission and invalidation

Only an actual successful eviction readback/whole-buffer equality scan establishes a four-byte uniform proof. Hydrating such a buffer retains that tuple while resident; hydrating a nonuniform Uint8Array discards the full backing as before. No constructor/clear guesses, no retained large arrays, no increased resident budget.

Every existing AccumulationBuffer level-zero write uses `_invalidateMips()`: all beginDraw variants, clear, restorePixels, writePixels, restorePixelsRect, copyTo destination and copyRegionInto destination. The new backing invalidation occurs BEFORE the mip-capability/validity early return, and callers invoke it AFTER ensureResident/hydration. Thus NPOT/no-mip buffers and evicted write destinations cannot keep stale proofs. `fbo` getter ensures residency then clears ONLY the uniform backing proof conservatively (mip/filter state is unchanged) for arbitrary external framebuffer rendering; read-only callers may lose the optimisation, never correctness.

A verified all-zero tuple needs no texSubImage2D on hydration: `_makeTexture` specifies RGBA/UNSIGNED_BYTE storage with null data, which WebGL security initialises to zero. Nonzero uniforms retain the existing full upload. Mip generation/filter restoration still occurs. Context forgetting clears backing; failed write invalidates before GL; exceptions during readback do not retire the resident allocation. Existing silent GL/context-loss errors retain the existing lifecycle behaviour: this is not a new error recovery implementation.

## Escape-path audit

`rg '\._fbo\b' apps/web/src/engine/src --glob '!*.test.ts'`: outside AccumulationBuffer only BufferResidency compares the current binding, without writes. FBO writes in Exporter, LayerCompositor, AreaOps, SmudgePainter, FilterPass and structuralOps obtain the public getter. Retained old FBO handles are deleted on eviction; new allocation requires a fresh getter for direct drawing.

One direct texture-write bypass was found: `watercolor/puddle/ContrastPhase.ts` uploads retainedComponents bytes directly into `regionKeep.texture` with texSubImage2D. The candidate replaces that single upload with `regionKeep.writePixels(keep)`, preserving TEXTURE0 activation, bytes, dimensions and texSubImage2D semantics while invalidating proof.

Remaining external texture upload sites were followed to their allocation/binding, not classified by name alone:

- AreaOps selection mask and imported image textures: fresh `gl.createTexture`, not AccumulationBuffer texture.
- ImageImport image texture: fresh createTexture.
- WatercolorSettlePlan flow/foreign/contact payload uploads: private flowTexture/foreign texture created separately; not a captured material buffer.
- BrushPainter tip mip levels, PortablePuddleNoise, watercolorNoise and paper builders: separately created asset textures.
- GpuBudgetFence: its own one-pixel texture/FBO.
- BufferResidency `_texture` reads compare bindings only.

The public texture getter remains sampling-only by audited convention; adding any direct upload using a buffer.texture requires writePixels or explicit invalidation. The patch does not globally wrap GL, nor invalidate on every sample (which would erase the intended benefit).

## CPU validation and limitations

Standalone external class imports the unchanged current BufferResidency; served class is never replaced. Runner:

`node_modules/.bin/vitest run --config docs/qa/runs/747-large-pages-20261017/candidates/uniform-vitest.config.mjs`

19 tests PASS. Original base under the first17 tests:15PASS/2FAIL, exactly repeated uniform readback/upload assertions. The suite checks pixel bytes after every write API, whole/region copy, partial restore, direct FBO clear, NPOT invalidation, actual LRU eviction→write→hydrate order, nonuniform array release, context forget, upload/write/readback failures. MockGL models pixels/copies/clear, not shader execution or GPU performance. Native read-only-base eviction pressure must still confirm reduced readPixels with unchanged material and original preset output.

## Merge with the separate idle-discard candidate

Do not apply both patches blindly. `747-idle-pool-discard-artifacts/idle-discard.patch` modifies the same `_residencyEvict` and `_residencyHydrate` bodies.

- Idle-discard branch must remain first: discarded contents have no verified backing and must not be interpreted as a retained tuple.
- After idle-discard hydrate, both discarded marker and backing are cleared. After ordinary uniform hydrate, keep only the verified tuple; ordinary nonuniform backing is cleared.
- Idle release/forget must clear any retained tuple before allowing content loss.
- Uniform readback skip applies only to ordinary valid retained tuple; it must not suppress the idle-discard lifecycle bookkeeping.

Root must merge sequentially, update the manifest against the merged source and rerun both suites. This candidate is NOT applied or promoted.
