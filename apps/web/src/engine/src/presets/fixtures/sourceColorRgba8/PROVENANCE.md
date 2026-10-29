# Scalar RGBA8 colour and two-stage group fixture

Source pin: `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`.
`scalar.native.json` retains exact official URLs and SHA-256 for every input.

## Compiled source, not colour-byte stubs

The fixture compiles unchanged native `KoColorSpaceMaths.h/.cpp`,
`KoIntegerMaths.h`, Over/AlphaBase, GenericSC/Base and creamy AlphaDarken headers.
The exact `cfAddition` body is extracted. The trait is four logical RGBA8
channels, alpha at index3, all channels enabled, additive RGB blend space.
BGRA memory layout is not a different colour law when named RGB channels agree.

The exact `KisHSVAdjustment::transform`, `RGBToHSL`, `HSLToRGB`, angle
normalization, quint8 clamp, and qreal `KoColorSpaceTraits::setOpacity` method
bodies are extracted without arithmetic changes. Generated source keeps native
copyright/SPDX notices. Source bodies remain in the offline C++ build, not in
browser code. Type/interface shims are authored here; they do not replace the
active byte operations. The LUT *storage* shim evaluates the unchanged native
`KoIntegerToFloat` functor, i.e. the same float values as the precomputed table.
The actual `HSVTransform`/HSVPolicy source is compiled too. Selected modes are
compatibility HSL and non-compatibility HSV; unused conversion/colorize branches
assert. Mode0/non-compatibility does not call legacy RGBToHSV/HSVToRGB: its
active algorithm is HSVTransform with HSVPolicy, retained unchanged here.

`SprayBrush::paintImpl` calls parameter3=`1`, parameter4=`false`; transform
constructor default compatibilityMode=`true`. Parameter3 selects **HSL**,
despite the spray UI/property and historical comments saying HSV. The signed
third control is lightness, not the newer HSV/chroma adjustment. The ordinary
`hsvAdjustColor` helper therefore cannot substitute for this operation.

## Reproduce

Obtain the exact files identified by the fixture's official URLs separately.
The script checks their hashes before creating a private build directory:

```sh
python3 prepare.py /path/to/pinned-source-files /private/color-oracle
g++ -std=c++17 -O2 -fno-fast-math -ffp-contract=off -fno-operator-names \
  -I/private/color-oracle /private/color-oracle/oracle.cpp -o /private/color-oracle/run
/private/color-oracle/run > /private/color-result.json
```

Compare `hsl`, `composite` and `groups` against JSON, excluding environment
provenance. Remove the executable/build after checking. No SDK, Qt library,
renderer, network service or native application process is needed.

## Coverage and exact scope

- 560 HSV/chroma cases:256 use control ranges of current stock71/100/113/114,
256 cover signed/achromatic/extreme colours and alpha0,48 exercise adjacent
float controls at half-byte boundaries. Output is exact native RGBA8.
- 384 HSL/alpha cases:256 use the four stock spray amplitude sets,128 authored
signed/achromatic/extreme cases. Byte alpha is preserved by the transform.
- 384 composites: Over, addition, creamy alphaDarken, with/without a mask,
nonopaque/empty/opaque source and destination, opacity/flow/average controls.
- 64 authored cloud groups exercise local Over followed by **one** outer
normal/add/alphaDarken transfer. Four families use the stock counts12/2/3/1,
colour once-per-emitter for Hearts and colour per-particle for the others.
Random-opacity controls replace colour alpha and independently set painter
opacity. For two particles at .5/.5 the group alpha is112; one outer .5
transfer gives56, whereas transferring each particle separately gives60.

These are scalar header/source-law fixtures, not an instrumented full Krita
render or a proof of optimized SIMD dispatch/byte identity on every platform.
The driver supplies already-rasterized coverage bytes and explicit controls.
It does not validate Qt ellipse coverage, bitmap alpha multiplication before
this boundary, embedded profile conversion, GPU compositing, input/time
scheduling, or the separate persistent Shoujo raster-noise source.

The earlier `sourceSpray` native consumer fixture proves draw order. This colour
fixture deliberately has no second PRNG implementation or claim about ordering:
its small integer generator merely authors test controls. Zero-amplitude native
HSV consumers still consume draws in the emitter planner, not in colour maths.

The generic helper accepts straight RGBA8 in an already selected RGB space;
it adds no gamma/profile conversion. Alpha-darken average opacity is explicit
caller state, not reconstructed from pixels. Existing normalized `brushWash`
remains separate because it does not model integer intermediates. Existing
`mixWeightedRgba8` supplies the shared RGBA8 type and continues to own weighted
pickup mixing. No catalog/core/importer admission is implied by these units.

## HSV versus legacy floating adjustment

The source-defined HSV kernel keeps float32 intermediate operations and a byte
store before coverage. In the authored560-case comparison, rounding the legacy
`hsvAdjustColor` output only at the end differs in16 RGB channels, maximum1byte,
all in the explicit boundary section. This is a bounded corpus observation, not
a tolerance used to accept the native oracle: all560 native cases match exactly.

A stock71-range witness has input[141,232,23,90], signed controls
[.04559413333333333,0,.03328253333333333], native result[117,233,31,90].
Using alpha128 over opaque black AFTER that byte store gives[59,117,16,255].
Deferring the colour quantization through coverage gives[59,117,15]. Thus a
normalized float HSV formula can be algebraically right and still store a
different pixel because its quantization stage is misplaced. No GPU or full
Krita renderer identity is inferred from this scalar witness.
