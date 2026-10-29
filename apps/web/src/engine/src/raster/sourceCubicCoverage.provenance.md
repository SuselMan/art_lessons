# Isolated cubic coverage experiment

This helper is deliberately unconnected to the renderer or importer. It proves a
small CPU coverage contract, not Krita/Android parity or production admission.

Pinned reference: Qt `v5.15.13-lts-lgpl`, qt/qtbase official source:

- `src/gui/painting/qoutlinemapper.cpp:76`: cubic flattening before rasterization;
  `qoutlinemapper_p.h:106`: threshold `.25 / matrixScale`;
  `qoutlinemapper.cpp:267`: qRound26.6 coordinates.
- `src/gui/painting/qbezier.cpp:139`: subdivision termination test/depth9.
- `src/gui/painting/qgrayraster.c:545`: cell area integration;
  `:1219`: signed shift before absolute-value coverage;
  `:1357`: nonzero-winding accumulation.

These paths are available under
https://github.com/qt/qtbase/tree/v5.15.13-lts-lgpl/src/gui/painting .

Krita pin `bd6e8d061d2f0388c5b10278786cf0fe62e3135f` routes
`plugins/paintops/spray/spray_brush.cpp::paintEllipse` through
`libs/image/kis_painter.cc::Private::fillPainterPathImpl` to this Qt raster
boundary. Spray sets mask size to the effective shape dimensions; default
polygon antialiasing is true. This kernel starts after ellipse path creation and
integer raster-window selection. It does not implement native minimum-size
policy, compositing, particle generation, RNG, path bounds or ellipse construction.

## Implementation and license provenance

TypeScript text was newly written. It partitions each segment at rational
pixel-row/cell boundaries and integrates signed trapezoid areas directly. It does
not translate Qt/FreeType DDA loops, linked cell lists, memory pools or spans.
Qt's flatten/quantization/coverage laws informed the implementation. This is **not
a cleanroom claim or legal clearance**. The earlier research Python prototype
was source-adapted; it is not this implementation's license grant.

Qt qbezier.cpp carries Qt LGPL3 / GPL2-or-later / commercial alternatives.
qgrayraster.c additionally retains FreeType project notices. No project root
LICENSE was found during this audit. Before production integration, review
source-informed provenance and the project's distribution/license requirements.
This document does not assert that rewriting control flow removes obligations.
No upstream implementation text is included in the TypeScript file.

## Independent native fixtures

`__fixtures__/qtEllipseCoverage.oracle.cpp` executes installed QtGui CPU QImage
Raster engine, with no application/GUI/service. JSON records matching headers
and runtime Qt `5.15.13+dfsg-1ubuntu1`, official development-package SHA256,
existing runtime-library SHA256, C++/input SHA256 and actual cubic elements.
Host is x86_64. This does not establish Samsung Qt version or Android behavior.

45 native cases: 42 AA-on byteexact; three AA-off explicitly rejected.
Original 33 include rotated 25×22, negative/quarter centers, small/zero/clamped
particles, alternate chunk size and integer translation. Twelve extra cases
vary aspect and size (7.25×41.5,43.75×3.125,.375×1.75,61×62), angles
-.71/.123456789/2.1 and center(-7.375,9.8125), mask17×13. Thus matching is not
limited to stock Pointillism geometry.

Supported: single closed cubic contour, identity painter scale, integer raster
translation, AA-on, nonzero fill, bounded finite coordinates/window. Other inputs
fail explicitly. Native fixture comparison is independent of our renderer.
No GPU throughput or production memory guarantee follows from these CPU tests.
