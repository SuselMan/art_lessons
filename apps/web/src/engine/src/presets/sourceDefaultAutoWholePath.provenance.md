# Default-auto whole-wrapper coverage proof

This is a test-only composition of the existing geometry and coverage references. It does not add or activate a renderer profile.

The independent oracle executes the unchanged installed ARM64 `KisAutoBrush::generateMaskAndApplyMaskOrCreateDab` body at `0x2f7e0` (1228 bytes, SHA256 `7c69c96e5309c34c8e556a9bd86e96b776ad318555ca52c2613170c6b4bd25e7`). Its original calls execute the retained Krita geometry, Qt affine mapping, Bionic trigonometry, generator softness/scale methods, scalar or NEON applicator, and the original pigment NEON quantizer. Original library and function hashes are in `fixtures/sourceDefaultAutoWholePath/native-proof.json`.

Source reference: Krita 5.3.4.1, pin `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `libs/brush/kis_auto_brush.cpp` (`generateMaskAndApplyMaskOrCreateDab`), `kis_brush.cpp`, and the circle/rectangle mask generators/applicators. This source-informed conformance work is not a clean-room claim. The fixtures contain generated numeric inputs/outputs and hashes, not copied implementation bodies. Upstream Krita source notices and GPL licensing continue to apply to the private source/oracle evidence.

The actual wrapper establishes the coupling which the previous separate geometry and coverage fixtures did not establish:

- Geometry uses the stored brush scale and the normalized sum of brush and request rotations.
- Coverage receives the **raw**, unnormalized sum of those rotations through original Bionic `sincos`.
- The generator scale is request `scale`, `scale * ratio`; stored brush scale is not multiplied into it.
- The coverage center is continuous native hotspot minus `.5`, then plus subpixel. It is not half the integer allocation size.

There are 56 calls: seven stock default-auto roles (4, 8, 17, 18, 19, 21, 67), four raw requests, and two explicitly selected applicator routes. Nonunit stored scales, nonzero stored angles, rotations outside the normalized interval, fractional subpixels and tiny supersampling fallbacks are represented. All 24,590 coverage bytes match the composition of the existing references exactly; 14 calls enter the native vector branch. The test independently checks allocation dimensions, the original processing-data fields, generator scales and every output byte.

The execution is Unicorn 2.1.4 A72 instruction emulation at FPCR0. Six pinned libraries are read from the installed APK/system directly into RAM, verified before mapping, and never persisted as ELF/APK artifacts. Constructor initialization retains the previous original clamp/cast slices and setters; consumed generator/brush ABI state is constructed. The shared-pointer count stays above one, so destruction and complete constructor/lifetime behavior are outside this proof.

The only host interfaces are bounded owned fixed-device `setRect`/buffer/data, declared RGBA8 pixel size4, a declared PlainColor color pointer, explicit scalar/NEON applicator selection, bounded aligned row allocation/free, and owned memory copies. Scalar output captures the original U8 coverage argument with opaque source alpha255. Thus the scope is coverage, not arbitrary ink-color composition. No arithmetic, trigonometry, geometry or quantization hook computes expected results. Unexpected calls, memory accesses and budget exhaustion reject the run.

Reproduction evidence is private `fixes-v52/run-installed-auto-whole.py`, `launch-installed-auto-whole.py`, `installed-auto-whole-fixtures.json`, `installed-auto-whole-fetch.json` and `auto-whole-check.json` under the existing device-run evidence directory. Script hashes are retained in the compact proof. The pilot used circle and rectangle calls before the full run. No browser/context/forward or new disposable dependency was created; the parent-owned registered Unicorn tool was reused and remains under the parent's cleanup lifecycle.

This proves neither physical execution of this whole call on Samsung nor the installed GUI's selected factory, paint-device partition, tablet input, cross-browser universal libm identity or performance. The sampled trigonometric values match the current JS runtime exactly; the earlier geometry provenance's general libm limitation remains.
