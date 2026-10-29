# Straight RGBA8 material/group source fixture

**Explicit generic scalar profile only. This is not the default optimized RGB8
Krita painter, a full native paint device, GPU proof or completed spray support.**
Source pin `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`; exact source URLs/hashes
are retained in `buffer.native.json`. The colour fixture's pinned preparation
is reused; no upstream implementation text is copied into the TypeScript kernel.

## Exact source stages

`KisPainter::Private::fillPainterPathImpl` creates an opaque foreground-filled
polygon, renders Qt coverage, reads qRed from its opaque mask image, and calls
`colorSpace->applyAlphaU8Mask(...,nPixels=1)` before local `bitBlt`.
`KoColorSpaceAbstract` delegates directly to the trait. KoRgbU8Traits and
KoBgrU8Traits inherit KoColorSpaceTrait's generic alpha-mask method; neither
supplies a SIMD override. Its active U8 operation stores
`UINT8_MULT(sourceAlpha,coverage)` back into the alpha byte, leaving RGB alone.
The fixture executes unchanged native method bodies and checks that per-pixel
and whole-buffer calls produce the same material bytes. All65536 alpha/mask
combinations are retained, not a floating approximation of the product.

A separate important source stage is `KisFillPainter::fillRect`: after same-space
colour conversion it calls `setOpacity(data, suppliedU8,1)` and `device->fill`.
The foreground path supplies255, replacing even random ink alpha0/1/128 with255
BEFORE coverage. Bitmap/GIH material is not automatically given that override.
The generic `alphaOverride` material operation expresses this difference without
any brush/engine-name flag. Its default preserves the stored input alpha.

Local Over consumes the already-masked source WITHOUT a composite mask pointer.
For alpha1,coverage128,painter opacity.5 the stored mask alpha is1 and the local
result alpha is1; collapsing all three into generic composite mask/opacity gives0.
`alpha1-no-premultiply` also retains straight RGB128/64/32 at alpha1. A premul8
roundtrip would lose that colour. Neither group nor destination is premultiplied
anywhere in this kernel.

## Buffer oracle and requests

`oracle.cpp` invokes the actual native scalar headers on complete rectangles
with row strides/rows/columns. It captures every before-mask material buffer,
masked material buffer, group after each particle, final group and outer result.
32 requests include solid/image materials, overlaps, alpha0/1/128/255, local and
outer zero/.5/unit opacity, partial destination clipping, explicit transparent
storage window, empty particles/groups, Over/Add/creamy alphaDarken.
Three requests reuse captured host Qt5.15.13 coverage masks from the separately
pinned ellipse fixture (input SHA/case indices recorded). This reuses an actual
coverage input; the group executable does not run QPainter or prove Android AA.

Reproduce with separately obtained native files required by the colour fixture:

```sh
python3 prepare.py /path/to/pinned-source-files /private/group-oracle
g++ -std=c++17 -O2 -fno-fast-math -ffp-contract=off -fno-operator-names \
  -I/private/group-oracle /private/group-oracle/oracle.cpp -o /private/group-oracle/run
python3 run_capture.py /private/group-oracle/run /private/native-result.json
```

Compare raw result cases to each expected field plus maskTableHex. The authored
requests are deterministic numeric inputs, not a new PRNG/native emitter receipt.
Preparation verifies native hashes and preserves upstream notices in generated
source. The output build/executable is temporary and must be removed after use.

## Dispatch/storage/admission boundaries

Krita RGB8 commonly dispatches Over through KoOptimizedCompositeOpOver32 with
float/SIMD arithmetic; its byte rounding is not this generic integer Over.
That dispatch/alignment/tail law requires separate source fixtures. The same
caution applies to optimized alphaDarken. The test tolerance here is zero for
its declared native scalar headers; it does not claim default-factory identity.

Spray transfers `m_dab->extent()`, not necessarily the minimal particle union.
This helper accepts an explicit group storage window containing every particle;
default union is convenience only. Empty transparent windows can alter hidden
RGB under scalar alphaDarken. Native tile extent/allocation belongs to callers.

Inputs/outputs are dense stable ArrayBuffer-backed Uint8Array, straightRGBA8,
safe-integer pixel bounds; fractional geometry must already be rasterized.
Shared mutable storage, other colour spaces/profile conversion, Qt rasterization,
source clocks/RNG, layer premul8 storage and engine admission are outside scope.

All inputs, including clipped-out/opacity-zero/empty particles, are validated
before either output buffer is allocated. Explicit budgets bound particle count,
work pixels and combined returned bytes (hard safety caps16MiB/16M pixel work).
The caps are this isolated helper's resource admission, not a native source law
or an approved importer limit. Exceeding them rejects; no particle is truncated
or raster boundary changed. The caller retains all source buffers; returned group
and destination buffers have independent ownership. No renderer is connected.

## Source licences

- KoColorSpaceTraits.h, KoColorSpaceAbstract.h, KoRgbColorSpaceTraits.h and
  KoBgrColorSpaceTraits.h: LGPL-2.1-or-later.
- KisPainter implementation and KisFillPainter implementation: GPL-2.0-or-later.
- KoIntegerMaths.h and KoCompositeOpAlphaDarken.h: LGPL-2.0-or-later.
- KoCompositeOpOver/AlphaBase/Base and scalar maths: LGPL-2.1-or-later.
- KoAlphaDarkenParamsWrapper and GenericFunctorBase: GPL-2.0-or-later.
The extracted fixture bodies retain their original notices; authored TS is a
mathematical byte-operation reimplementation. This provenance is not legal
clearance for linking/copying a native renderer into the browser application.
