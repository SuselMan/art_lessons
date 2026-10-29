# Exact coefficient provider for native source curves

The optional offline tool assembles the natural cubic interpolation constraints
as global polynomial coefficients, including independent natural boundaries at
corner knots, and solves them with pinned Eigen3.4.0 SparseLU. It is authored
code; it does not embed Krita's implementation or stock coefficient tables.
It deliberately preserves the explicit sparse zero entries and equation order,
which affect symbolic ordering and binary64 rounding. This is a versioned
coefficient profile, not a runtime CPU choice or a claim about all Krita builds.

Build explicitly with existing headers, without downloading dependencies:

```
python3 scripts/brush-import/build_native_curve_compile.py \
  --eigen-include /path/to/eigen-3.4.0 \
  --output /path/to/native-curve-compiler
```

The build pins Eigen3.4.0, disables FP contraction and unsafe math. Other Eigen
versions and fast-math builds are rejected. The Eigen dependency keeps its own
upstream license; it is not vendored here. An importer supplies the trusted
absolute executable path to `native_curve_compile.compile_curves`. There is no
automatic compilation, path search, data-controlled executable, native fixture
lookup or approximation fallback. Failure leaves source candidate admission to
the caller; legacy rendering is not changed by this tool.

The ASCII batch protocol is count, then knot-count/x/y/corner for each curve.
Bounds:1..64curves,1..256knots per curve,4096knots per batch,15second provider
execution limit. Input is completely validated before invoking the process.
The C++ boundary validates again, solves the complete batch before emitting any
JSON, and rejects singular/nonfinite solutions. Outputs are global [a,b,c,d]
coefficients, one interval per adjacent knot pair (one constant for a singleton).
Original raw curve text/selected reader law belongs in descriptor source data;
this tool must receive its actual selected points and corner flags.

Verification in fixes-v51/curve-compiler-*.json:
- All32 retained actual native SparseLU stock curves match every coefficient.
-35 independently executed unchanged native template cases match every
 coefficient: constants, lines, nonendpoint knots,130corner knots and a256knot
 curve. Source hashes, input data, flags and template diagnostic wrapper retained.
- Native protocol rejects invalid/trailing input without partial JSON. Python
 guards reject malformed batches before invoking a subprocess and reject malformed
 output/timeouts/process failures without invoking the legacy solver.

These are exact comparisons on the tested coefficient domains, not a universal
floating-point equivalence theorem or Android Eigen version/dispatch proof.
Replay uses persisted coefficients and the existing sourceCurve sampling law.
The importer/source author adapter must explicitly supply this provider; the
existence of the tool alone does not activate canonical authoring.

Run native integration tests explicitly (ordinary tests skip native execution
when the provider is absent):

```
GRAFETTO_NATIVE_CURVE_COMPILER=/absolute/path/to/compiler \
  python3 -m unittest discover -s scripts/brush-import -p test_native_curve_compile.py
```
