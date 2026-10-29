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

## Raw ellipse construction experiment

`sourceEllipseContour.ts` adds raw center/full dimensions/radians → four cubic
quarters → derivative extrema → floor/ceil integer raster window expanded by one.
The mathematical quarter tangent coefficient is the **source decimal**
`.5522847498`, not a fitted value or the higher precision ideal circle constant.
The transformed ellipse is the cubic approximation, so perfect-ellipse analytic
bounds are insufficient. Generic scalar cubic derivative roots and de Casteljau
evaluation determine the bounds; source contours are not looked up by brush ID.

Additional pinned source-law references: qstroker_p.h:113 decimal kappa;
qstroker.cpp:852 full-arc contract; qpainterpath.cpp:1166 addEllipse,
:1406 derivative coefficient definitions, :1427 extrema, :3543 path bounds;
qtransform.cpp:69 mapping arithmetic, :741 rotateRadians, :1715 path map,
:2135 fuzzy transform classification. New implementation text was written from
mathematical laws; no Qt implementation text is copied. Existing licensing
caveats still apply; no cleanroom/legal-clearance assertion is made.

All45 retained raw fixture inputs independently produce the native integer window
and corresponding transformed contour coordinates to 1e-12 absolute tolerance.
All42 AA-on whole masks remain **byteexact** through our coverage kernel.
AA-off geometry/window is tested, raster remains explicitly unsupported.
`sourceSprayEllipseSize` keeps native minimum `max(LOD,base*randomScale*LOD)`
separate: raw addEllipse 0x0 is empty, while source-clamped zero-scale particles
remain LOD×LOD. Zero in only one dimension is explicitly unsupported.

The fuzzy-transform guard was replaced after an actual second narrow host Qt
oracle run. Thirty-two new native cases cover sin near ±1e-12, exact pi/2pi and
adjacent representable angles, zero/quarter centers and translations around
±1e-12. They confirm the generic transformation categories: rotate when sine
is not fuzzy-null; otherwise scale if cosine differs from1; otherwise translate
or identity. Identity ignores fuzzy translations. Scale ignores fuzzy sine.
This matters even though an ideal continuous affine formula looks equivalent.

Current total:77 actual native cases,74 AA-on whole masks byteexact,3 AA-off
explicit rejects;157 focused tests across both helpers. The one repeated matching
header extraction was separately registered, used only for this oracle, and
removed through standard locked cleanup after root strict /proc validation
(receipt R49/native-qt-cleanup.json). No temporary resource remains. No production
imports were added.

Remaining limits: source operations and host/JS trigonometry are validated at
these inputs, not every possible floating-point tie. Other degenerate contours,
huge coordinates, negative sizes and nonfinite inputs fail explicit guards.
No Android Qt-version, GPU-performance or legal-clearance claim follows.
