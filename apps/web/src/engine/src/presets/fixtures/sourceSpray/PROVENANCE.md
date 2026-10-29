# Spray consumer CPU fixture — integration not admitted

`consumer.native.json` captures **actual compiled source method bodies**, not a
full Krita runtime. Source pin: `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`.

Official sources (SHA-256 in JSON, enforced by assembler):

- [SprayBrush](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/spray/spray_brush.cpp)
- [CDF builder/sampler](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/spray/KisSprayRandomDistributions.cpp)

The assembler extracts `rotationAngle`, the complete two-distribution
`paintImpl`, and the CDF private class. It renames only that class, keeps the
upstream copyright/SPDX notices, and compiles them with authored capture stubs.
GPL native bodies are not copied into the production TypeScript helper.

Reproduce, with separately obtained pinned source files:

```sh
python3 assemble.py /path/to/pinned-spray-sources /private/native-spray.cpp
g++ -std=c++17 -O2 -fno-fast-math -ffp-contract=off -Wall -Wextra /private/native-spray.cpp -o /private/native-spray
node --import tsx runCapture.mjs /private/native-spray /private/native-result.json
```

Remove the executable after checking. The native result contains CDF triples
and particle/draw captures. `consumer.native.json` wraps those with request
parameters and provenance. Its four stock-derived configurations come from
Krita 4 Default Resources bundle SHA-256
`4180f474052305e9de6eaac1d832c1ddeb0654142bcde2eb2460629cf23796d0`:
Pointillism, Starfield, Hearts, Shoujo Bubbles. Seven authored cases isolate
cloud/particle scale, zero rotation/HSV amplitudes, single-frame consumption,
proportional dimensions, circle rotation, empty emission and colour scope.

## What this proves

- Native CDF trapezoid integration/simplification and interpolation, with 1000
  PDF samples, sigma .5, support 0..2.5, resulting in 319 retained samples on
  this CPU/compiler. The actual CDF body runs; it is **not** a Gaussian stub.
- Native emitter geometry, colour-control call order and particle count.
- Actual requests to the normalized/bounded random interface. The explicit raw
  tape is supplied by the separately Boost-verified `nativeRandom` helper.
  It does not constitute a second independent Taus88 receipt. Its inclusive
  bounded method matches that existing uniform-smallint fixture, including
  singleton consumption; no claim about arbitrary rejection samplers is made.
- Plain snapshot restore/continuation and no mutation of the incoming source.

## Explicit boundaries

The affine transform implements the isotropic cloud rotation/scale exercised
here. Painter calls capture ellipse/brush centres, dimensions and controls.
Brush hotspot is zero and mask rasterization is intercepted: **allocation,
phase, QPainter ellipse AA, byte HSV/opacity, blending and emitter-group
transfer are not tested**. HSV records transform parameters, not output RGB.
The stub GIH selector consumes the explicit random frame interface; it does
not decode frame pixels or prove all GIH selection modes. Shoujo's separate
persistent raster-noise RNG is not implemented or replaced by a hash.

Input surface sampling, background mixing/fill, jitter, density-count,
non-ellipse Qt shapes and image-stamp paths intentionally assert in the
capture executable. Size/rate sensors and timed emitter scheduling remain
outside this isolated per-emitter helper. A once-per-emitter colour value
must be reset by each emitter; each call owns fresh colour controls.

At normalized U=1 the pinned inverse-CDF implementation dereferences `end()`.
The helper explicitly uses the last support coordinate there: a safe endpoint
policy, **not native identity at undefined behaviour**. Offline CDF tables are
finite, strictly increasing immutable DTOs; runtime PDF generation is absent.

No catalog/importer/core admission or complete spray engine support is implied.
