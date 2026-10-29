# Isolated default auto geometry / binary64 FMA reference

This is **not an active brush renderer or auto canonical admission**. No engine, importer, schema, codec, catalog or PNG code imports either new helper. `SourceAutoGeometryTip` is closed `kind:auto`, no fabricated image/CAS resource. Scope is the default standard generator, spikes2, LOD1, finite shape/brush scale and angle, nonnegative author fractions below1. It provides geometry only, not mask coverage or a source option compiler.

Implementation is independently written mathematical TypeScript informed by pinned Krita/Qt source and compiled operation order. No upstream source function was copied/adapted as a code body. This provenance is not legal clearance. Upstream project licensing remains applicable to any future code reuse; the helper does not make a clean-room claim.

Krita pin `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`: `libs/brush/kis_auto_brush.cpp:67–101` initializes sizes in two stages and only afterwards applies angle; `libs/image/kis_base_mask_generator.cpp:201–212` raw dimensions; `libs/brush/kis_brush.cpp:123–124` default angle0/scale1, setters232+, hotspot265+, characteristic477+; `libs/brush/kis_qimage_pyramid.cpp` transform132+, calculateParams159+, imageSize228+. Retained source paths and full handoff in ignored `fixes-v52/installed-auto-geometry-provenance.md`. Installed Qt source-law distinction: affine MAP performs a rounded c*y, then **fused** a*x+(c*y), then adds translation, for each original rectangle corner. This changes continuous dimensions even when a small sample's integer windows match unfused JS math.

## Independent oracle

`fixtures/sourceAutoGeometry/native-proof.json` pins five installed library full SHAs and original function-body SHAs. The libraries were streamed RAM-only from the Samsung APK/system libm; no APK or ELF disk copy. The isolated runner executed original ARM64 auto wrappers, base brush and image-pyramid, original Qt affine methods, QtCore aligned-rectangle conversion and Bionic sincos/fmod under existing Unicorn2.1.4/A72/FPCR0. Source-valid **consumed ABI fields** were constructed; full GUI constructors/lifetimes/active dispatch were not executed or claimed. Exact original constructor slices FMAXNM→FCVTZS→real setters establish initial qint32 truncation. Example raw7×3.5 becomes integer brush7×3.

No arithmetic hooks: only bounded owned-object memcpy as an interface boundary. Unexpected source-code/memory/external calls fail closed. Two missing Qt closure failures were retained and resolved with actual original code. Negative subpixel caused an actual source assertion, retained; final valid fractions are [0,1). Negative world placement is a separate integer floor component.

- `geometry.native.json`: 42 complete queries, seven actual stock roles × six generic shape variants, from raw input through original two-stage initialization/characteristic/hotspot/integer mask window. The TS helper matches **all outputs exactly** on the tested host runtime. No runtime stock-ID/fixture lookup.
- `math.native.json`: 512 independent executions of unchanged original QtGui `FMADD d1,d0,d3,d1` instruction at0x3b5c54, bytes0104431f. Finite operands include cancellation, underflow, signed zero and extreme finite exponents. The independently written integer-significand reference matches all512 binary64 result bits. RNE rounding is performed once; no multiplication overflow/underflow is rounded before addition.
- The same file retains42 actual original Bionic sincos arguments/results as bits, including nontrivial normalized angles. **Host Node** Math.sin/cos matches these sampled bits. This is not proof for arbitrary input angles, other JS runtimes, Safari/iPad, physical ARM instruction semantics, or a browser native-libm-compatible implementation. Trig capability remains an explicit blocker before broad author activation. The FMA calls now use the certified ordinary-number `sourceFmaF64` path with the independent BigInt reference as its extreme-input fallback. All42 native fixtures remain exact; primitive host timing is recorded separately, not a browser performance claim.

The old shared PNG evaluator has42/42 matching sample windows but9/42 nonidentical characteristic sizes and7/42 hotspots (max1.78e-15). These tiny differences must not be called native identity. The new independent auto profile fixes sampled fused corner arithmetic without changing the old path.

## Resources and next boundary

Own Capstone resources for coverage and geometry were disposed by standard locked QA finish with privileged strict /proc checks; `auto-geometry-disassembly-cleanup.json` records no references, removed=true. Existing parent-owned Unicorn remains for parent work, untouched. No own device context/tab/forward/process/runtime remains.

Next is default-mask scalar/NEON coverage using the independent original84-call coverage oracle, plus whole geometry→mask coupling. Generic arbitrary-geometry/fuzzy-angle/trig evidence and bounded hot-path arithmetic are still needed. Gaussian, softcurve, spikes>2, density/randomness, textures, smudge and all remaining engines remain outside this profile. No activation is justified by these geometry tests alone.


The pure implementation now lives in `packages/shared/src/sourceAutoGeometry.ts`
with exact binary64 FMA dependencies in the same package. This web path is a
compatibility re-export. The relocation changes import paths only, not arithmetic,
profiles or fixture inputs. It enables a future common server/client metadata
preflight; it does not admit procedural material codec/execution on its own.
