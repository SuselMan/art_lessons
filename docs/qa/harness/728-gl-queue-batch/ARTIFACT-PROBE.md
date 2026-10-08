# OFF material artifact diagnostic

`ARTIFACT_PROBE=1` requires Float32 DirectEarly preview. The diagnostic is never a paint input. No production shader or default changes.

Two own64 targets add81920 texture bytes (shader/driver allocations are not included). Three separate programs compile before input. Factory rollback, original texture/FBO bindings, and idempotent fence-owned disposal are tested.

At actual owner2 steps1/2, a64 ROI follows the actual captured source probe point. The physical FBO is64; target proxy, projection, world paper, original texture UV, and local-depth offsets remain1024. Viewport translates by negative ROI origin; fragment coordinates add that origin. Original pre-stroke region is copied first to preserve discarded pixels.

First, the unchanged material output is compared byte-for-byte with the actual pending64 ROI. Nonexact reconstruction invalidates branch interpretation and fails the controller. Only after this control do float planes expose pre/post migration deposit, strength, pigment mass, depth/local-depth alpha, density, and spread coverage. Actual128 P/C8×8 inputs and fullsource coverage64 samples accompany them. A zero debug result may be a discarded pixel, not a computed zero branch.

Readback budget512KiB; expected two observations364544 bytes. Diagnostic reads/copies perturb scheduling; no latency or GPU-time claim. Canonical inputs are only sampled; actual source8 content hashes remain a separate primitive proof. Controller preserves NEW operation tape and performs meaningful Dry/Undo/Redo; that gate is not original same-tape parity.

CPU: resource rollback/restoration/once-only disposal, projection/offset contract and literal diagnostic anchors pass. Hardware compilation, plainRGBA equality, and actual branch attribution remain unproven until the separately allocated ONE cohort.

## Surface actual ONE, 2026-10-09

Raw `temp/device-runs/owner-water-dab-artifact-surface.json`, compact `owner-water-dab-artifact-summary.json`, NEW `owner-water-dab-artifact-tape.json` SHA49775836d788b392094f5bf4ecdb4e203e9eef22117d0cfa365ffcf67c6c7ef3. Both actual steps1/2 plainRGBA controls exact0/max0.364544B reads. Programs compile/FBO/finite data; glError0/lostfalse. Dry/Undo/Redo meaningful/exact1f7a6cb875d43206af11df7108d407d5037c47214182eb18d8242897b068c1f4. This is internal history only, not original SAME NEW tape parity. Own target closed, pre2233MiB/post2090MiB; Surface released.

25 positions each: coverage1, strength0.99999994–1, migratePx0/migrate0; pre/post deposit identical. Step1 deposit0.038467–0.086142, density0.071268–0.153195; step2 deposit0.046528–0.074884, density0.085684–0.134555. Ink fallback0.004 and density guard1e-4 are inactive at these positions. Local-depth prior branch active17/13 positions; branch presence alone is not causality. Samples do not cover every artifact pixel.

Captured inkSmoothPx87.999908 derives from production wash scratch, not a preview override. `RibbonStrokePainter.ts:358` calls `scratch.noteDabSpacing(firstGap)`. `RibbonStrokeScratch.ts:376` caches the first nonzero gap; `beginStroke():501` does NOT reset spacing or composite. Only destroy/restore assign it later. Actual scalar-lifecycle fixture: water spacing88→beginStroke→pigment gap0 or15.4 still88. Generated source capture clones this exact recipe; normal canonical composite also passes it. Production `wcInkAvg` ring radius is half-spacing44worldpx, larger than a nominal70dab half-width35. Sparse-ring reconstruction is a concrete candidate cause; no shader/default/canonical change is justified by this provenance alone.
