# Native KPP host timing195

The public `convert_krita(..., timed_input=None)` entry gives a genuine root KPP
with checked `PaintOpSettings/isAirbrushing` the literal descriptor version195.
The source PNG and all original native settings own its identity. A private
`ContextVar` delegates clock parsing in older rendering adapters; it neither
changes source flags nor projects a descriptor to another version. Native
material/mask/filter/feedback payloads remain their existing implementations.
Explicit `timed_input=False`/`True` retain the historical Python entry policies.
Previously stored descriptors are not rewritten.

`behavior.timing` is `{version:2, rate, hostRate, ignoreDistanceSpacing,
updateSpacingBetweenDabs, rateDynamics?}`. Canonical `PaintOpSettings/rate`, when
present, sets both rates. When absent, the native settings host resolves1Hz and
`KisAirbrushOptionData::read` resolves20Hz. `updateSpacingBetweenDabs` defaults to
false. Rates are finite0..1000; positive `floor(1000/rate)` and
`floor(500/hostRate)` must fit signed32 milliseconds. Host rate0 represents the
native LONG_TIME case and schedules no stationary callback. The same bounds and
strict booleans apply to portable records.

The callback role derives from the actual family payload, never from a public
policy selector:

| Native consumer | Host callback role |
| --- | --- |
| Pixel, Spray, Color Smudge legacy/modern, Deform | Ordinary effective distance/time |
| MyPaint | Effective distance/time; native Rate option is absent |
| Clone, Filter, Grid, Hatching, RoundMarker | Refresh only; native engine timing is disabled |
| Sketch, Particle | Moving input bypasses the base sampler; equal-position input uses it |
| Curve, Experiment, Bristle | Native line callback, including equal positions |
| Tangent Normal | Effective; checked Sharpness with native1×1 brush uses its line branch |

Initial no-ink point calls and actual zero-pixel requests remain canonical state
boundaries. Nonpainting scheduling queries are author-only; this importer adds
no refresh-event network protocol or fake opacity-zero paint. Replay consumes
recorded requests and never retimes them. Native timer restart/order, source
history and renderer integration belong to the engine, not this converter.

Rate uses the generic size-like sensor parser, including captured time, tilt,
stylus twist/tangential pressure and compound curves. Native families that do
not instantiate Rate ignore copied Rate controls. Functional fuzzy controls use
captured F64 sourceTime, gesture seed and sensor role; per-stroke fuzzy keeps its
exact native option key. Native random draw order/sequence and Qt/ICC/U8 pixel
identity are not claimed. Tangent195 alone retains the strict native
`sharpnessChecked` boolean from `PressureSharpness`; older five-field payloads
stay unchanged.

Portable admission is a separate strict195 root path, with primitive mask,
curve, dynamic, texture and CAS checks. An actual Pixel masking child keeps its
literal190/191 record and identity; nested195 and unrelated child authority are
rejected. Original shader/material data is not stripped to pass historical gates.

`timing195_corpus.py` builds52 self-authored genuine KPP inputs across16 native
paintop IDs. They cover all callback roles, default1/20, zero/max rate, spacing
refresh, Rate sensors/combination, MyPaint ignored Rate, canonical source Spray,
Tangent1×1 with pressure off/on,190 child time,192 masks/GIH/texture and193
Smudge. These are input/settings fixtures, not captured native pixel results.
No commercial resources are included. The native audit checked33 cached source
blobs against the pinned Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f` tree;
receipts and generated archives remain outside Git under the task QA directory.
