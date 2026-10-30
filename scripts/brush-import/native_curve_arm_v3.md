# Standalone guarded mapped curve provider

This unit is offline only. It does not select a KPP profile, change shared
contracts, migrate stored curves, or enable an importer/renderer capability.
The existing `eigen-3.4.0-sparselu-f64-no-fma-v1` provider remains separate.

## Explicit API and identity

Build with `build_native_curve_arm_v3.py --eigen-include PATH --output PATH`.
Supply original Eigen5.0.1 headers matching every SHA in
`native_curve_arm_v3.lock.json`; the builder downloads nothing. It verifies the
compiler and cc1 binaries, source files, patch context/results and every upstream
header before creating a disposable overlay. Only seven patched headers are
copied; other headers are symlinks. System dependencies discovered by the actual
compiler are hashed into the build ID. Every actual local source dependency must
be present in the source lock. No unreviewed local header is silently omitted.
Temporary paths are remapped and the overlay is deleted in finally.

Trusted configuration constructs
`MappedCurveProvider(absolute_executable, expected_build_id)` and calls
`compile_curves_arm_v3(curves, provider)`. The executable and expected ID must
never come from a brush, uploaded bundle, or client-selected URI. The caller must
retain the reviewed build manifest. Build IDs identify exact source/toolchain
and system-header inputs, not just a human profile string. They deliberately
change when those inputs change.

`--describe` returns a closed profile/build/input-grammar object. Batch stdin is
ASCII count followed by each knot count and `x y corner` triples. Batch stdout is
one closed `{profile,buildId,curves}` JSON object. No stdout is emitted until all
input, source-branch, solver and finite-output checks pass. Python checks both
handshakes, dimensions and finite values, preserving binary64 signed zero.
Unknown/duplicate fields, diagnostics on success, malformed output, timeout,
output-budget violation and identity mismatch fail without fallback. The wrapper
bounds all three pipes concurrently and kills/reaps only its own child.

## Grammar versus fidelity domain

The grammar is 1..64 curves, 2..9 strictly increasing finite knots per curve,
coordinates in [0,1], Boolean corners, and natural (non-corner) endpoints, with a
4096-knot aggregate cap. A grammatically valid curve can still be rejected by a
runtime Eigen branch guard. This is intentional; there is no input-hash allowlist
or native-coefficient lookup. Unsupported branches report a bounded
`unsupported-source-branch:...` diagnostic and produce no partial batch JSON.

The named profile `eigen-5.0.1-mapped-arm64-f64-v3` uses the shared constraint
assembler with a distinct guarded Eigen5 overlay. It maps specifically observed
ARM64 multiply/add/subtract graphs using explicit `std::fma` only at mapped fused
sites. Separate products stay separate under `-ffp-contract=off`. Floating-point
environment is reset to nearest-even. Unknown positive panel products, packet
sizes, triangular dimensions and dynamic row paths remain closed in the patch;
zero-output no-ops are allowed only where source expressions perform no writes.
The source is generic within these guarded branches, not stock-name dependent.
This is not a claim about every SparseLU input, installed Eigen version, native
GUI factory selection, or whole-stroke compatibility.

## Independent gates and provenance

`fixtures/curve_arm_v3.native.json` contains 79 original installed ARM64
constructors: 64 input-only generic curves and 15 unique actual Gaussian sensor
curves. Original machinecode executed with FPCR0 in bounded emulation; no curve,
solver or arithmetic hooks supplied expected coefficients. Device ISA probes
independently checked relevant arithmetic primitives. These are compiled-code
receipts, not evidence that a GUI stroke selected that factory. Source pin:
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`; original image ELF SHA:
`24d3f19d43650100bce51e8e941d66e3999eadee94e64e9f59dfe6c9ef86396d`.
Input/native report SHA locks are in the fixture.

The standalone accepts 66/79 constructors (636 coefficients bit-exact) and rejects
13 at the unproved panel-product guard. All 15 actual Gaussian sensor programs
are among the accepted cases. Five independent soft-radial constructors from
`sourceSoftCircle/tables.native.json` supply another 44 exact coefficients;
3610 dense-table values and 40 bounded/full600 masks have separate downstream
proofs and are not inferred from coefficient counts alone.

Before extracting `native_curve_common.h`, the unchanged old3.4 binary's raw
stdout was frozen for 72 curves (one/two-point, old32 native and arbitrary35).
The refactored old provider reproduced every byte. The old profile, parser,
serializer, flags and Python API are unchanged; its arithmetic policy uses a
separate multiply/subtract intercept.

Native tests require explicit `GRAFETTO_MAPPED_CURVE_COMPILER` and
`GRAFETTO_MAPPED_CURVE_BUILD_ID`; the old suite separately uses
`GRAFETTO_NATIVE_CURVE_COMPILER`. Fixture data is test-only and is never read by
native/Python compilation. Production activation and regeneration of any stored
sensor program require a separate reviewed profile migration.

## Source and license notice

Eigen upstream is MPL-2.0 (individual headers retain their copyright/license
notices). The patch contains modifications and context from the seven Eigen5.0.1
headers listed in the lock and is distributed under MPL-2.0. Obtain the complete
corresponding upstream source from
https://gitlab.com/libeigen/eigen/-/archive/5.0.1/eigen-5.0.1.tar.gz
(archive SHA256 `e9c326dc8c05cd1e044c71f30f1b2e34a6161a3b6ecf445d56b53ff1669e3dec`).
License text: https://www.mozilla.org/en-US/MPL/2.0/ . The builder preserves
upstream notices in the overlay and requires exact original source hashes.
The mapped arithmetic is source-informed, not asserted to be clean-room or a
license-independent copy. No prebuilt compiler or Eigen archive is committed.
