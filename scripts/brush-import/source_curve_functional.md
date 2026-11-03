# Source-functional curve provider

`eigen-5.0.1-source-functional-f64-v1` is an explicit offline coefficient
provider for common `sourceStamp.compiled.version=2`. It is not an ARM64,
SparseLU instruction-sequence, or native pixel-identity claim. Existing v3
provider, source lock, guards and golden coefficients remain unchanged.

The source contract is Eigen 5.0.1 SparseLU at the pinned source commit recorded
in the lock. Its panel update computes the logical matrix product `L = B * U`,
then the existing caller scatters U and subtracts L separately. The local overlay
implements that product with bounded scalar binary64 multiply followed by add,
without reassociation/FMA contraction, padding reads or a parallel solver. The
original constraint assembly, pivoting, gather, triangular solve, scatter and
subtraction remain in the shared compiler. This is authored glue, not a copied
native parser or a claim to reproduce ISA-specific multiplication scheduling.

The grammar admits 2..32 ordered knots, at most64 curves/4096 aggregate knots,
finite coefficients, and no corner endpoints. Panel matrices have at most124
logical rows/columns; aggregate panel work is bounded to16Mi multiply/add steps.
The process protocol is atomic and bounded. A result carries a distinct build ID,
profile and offline panel work witness; no new renderer permission is granted.

`build_source_curve_functional.py --eigen-include <verified-existing-headers>
--output <new-absolute-artifact>` verifies all408 original Eigen headers, the
single exact-context patch, local source hashes, compiler/cc1 hashes and system
header inputs. It reuses original headers through a temporary symlink overlay,
downloads nothing, and removes that overlay on exit. The resulting `.build.json`
binds actual toolchain, source lock and executable SHA. An existing target is
refused. Use the new explicit convert flags `--source-functional-curve-compiler`
and `--source-functional-curve-build-id`; do not pass an old native build identity.

`test_source_curve_functional.py` checks protocol/grammar isolation, the common
compiled2 path, deterministic coefficient bytes, atomic malformed input rejection,
and actual nonzero panel work. Five retained original nonlinear curves include
one10-knot primary curve, one22-knot mask curve and the three previously unproved panel cases. An independent
natural-spline second-derivative/Thomas reference is compared at knots and257
uniform positions with absolute tolerance5e-7. This is a functional numerical
oracle, not a native coefficient golden or GPU pixel test. Real-provider tests
require both explicit `GRAFETTO_SOURCE_FUNCTIONAL_CURVE_COMPILER` and
`GRAFETTO_SOURCE_FUNCTIONAL_CURVE_BUILD_ID`; absence skips them visibly.

Runtime consumes the same captured coefficients and common query pipeline with
an explicit `source-functional-fused-f64-v1` arithmetic provenance tag. It does
not resample RNG or solve curves during replay. New functional imports must use
browser-number coverage/browser raster policy; existing native histories and
legacy material3/4 coefficients are never relabelled.
