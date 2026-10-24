---
layer: tooling
summary: импорт внешних кистей
---

# Offline brush import

Offline conversion of Procreate `.brush` / `.brushset` , Photoshop ABR 1/2 sampled and 6/7/9/10, and Krita `.kpp` / `.bundle` into Grafetto's shared `BrushDescriptor` contract. Python's standard library reads archives, keyed plist objects, Photoshop Action Descriptors and VMAL channels. Pillow decodes/resamples images; no external converter or vendor engine runs.

```sh
python3 -m venv ~/.local/share/grafetto/brush-import-python
~/.local/share/grafetto/brush-import-python/bin/pip install -r scripts/brush-import/requirements.txt
~/.local/share/grafetto/brush-import-python/bin/python scripts/brush-import/convert.py \
  --output ~/.local/share/grafetto/brush-import-catalog \
  /path/to/pack.abr /path/to/pack.brushset
~/.local/share/grafetto/brush-import-python/bin/python -m unittest discover -s scripts/brush-import -v
```

Pass all source packs in one invocation: `manifest.json` is replaced, not appended. Output belongs outside Git. The converter does not delete files from an existing output folder. Asset binaries absent from the new manifest are unreferenced; use a new output folder when changing source packs. Do not redistribute commercial brush assets or commit them.

## Manifest v1

- `schemaVersion: 1`
- `brushes: [{descriptor, name, source, warnings, compatibility?}]`: shared `BrushDescriptor`, UTF-8 display name, source basename, explicit approximation warnings.
- `assets: [{id, size, file}]`: `id = "asset:" + SHA256(raw)`, `file = SHA256(raw) + ".bin"`. Exactly `size * size` bytes, one unsigned 8-bit luminance channel, **white = coverage**. `size` is a power of two up to 2048. `descriptor.tip.mask` and optional `descriptor.texture.id` refer to asset IDs. Duplicate raw pixels share a single asset. The SHA covers pixel bytes, whose length determines size.
- `skipped: [{name, reasons}]`: brushes without embedded shape/grain or supported sampled tip. Missing built-in Procreate resources are never silently substituted.

Tips are centered in a transparent POT square, retaining original pixels until dimensions exceed 2048. Larger tips are proportionally resampled, with a warning. Grain is resampled to square POT; non-square grain may change aspect, reported as a warning. Alpha multiplies image luminance. ABR samples already encode positive coverage and are not inverted heuristically.

Imported descriptors have `id: imported-<24 hexadecimal digits>`, immutable preset versions4 (ABR),13 (Krita),5 (Procreate) and behavior schema2, `model: stamp` or `mixer`; the ID hashes source settings, all final rendering fields (including shape/grain content hashes), and the importer schema/version. Source file paths are not persisted. Preset identity/settings are immutable at runtime. A future importer which changes rendering must bump its import version/identity rule; it must not overwrite referenced resources.

## Fidelity and supported subset

Importer rendering versions **3/4/5/6/7/8/9/10/11/12/13** emit optional `descriptor.behavior.version: 2` and per-brush `compatibility: [{feature,status,detail}]`. Existing imported IDs and historical manifests are not rewritten; old built-in tokens intentionally resolve to the current pre-release set. `approximate` means source semantics are retained but Grafetto's formula differs or the archive transfer function is undocumented; `unsupported` identifies an active lost feature. Neither status promises Photoshop/Procreate pixel equivalence.

ABR 6/7/9/10 minor 1/2: descriptor blocks plus both the minor-1 bitmap layout and minor-2 VMAL/fixed-preamble layouts, raw/PackBits 8/16-bit samples; 16-bit converted to 8-bit coverage. Embedded grayscale/RGB `patt` records use a separate bounded VMAL reader (indexed/CMYK rejected). Computed round tips, tip transforms, shape/scatter/count dynamics, pressure/tilt/direction/fade controls, color jitter, tool options, texture and one dual component are retained. Unknown blend modes/controls, projection, pose, noise, mixer/smudge tools and foreground/background mixing produce specific compatibility notes. Legacy 1/2 sampled records are supported with bounded per-record resynchronization; computed legacy records are skipped because shape metadata is undocumented. Modern variants, patterns and legacy are synthetic-fixture tested; the owner's real reference pack is 6.2.

Procreate: signed pressure curves, source spacing down to 1e-6, shape Rotation (stroke following, distinct from pencil azimuth), random orientation per stroke, count/count jitter, moving grain settings, rendering flags, wet/burnt edges, wet-mix fields, pressure taper and one secondary archive are retained. Normalized count is approximated linearly to 1–16; published numeric blend identifiers are decoded; rendering formulas and private archive-to-handbook scales remain explicitly approximate. Small spacing is declarative: runtime must enforce its own minimum pixel step/budget. Any active Wet Mix scalar or recursive rendering selects the mixer model, including charge/dilution-only presets, so wet parameters execute rather than remaining inert on stamp. Load/pickup/strength mappings are explicitly approximate. Dry presets retain stamp. Dual components have independent spacing/scatter/count/dynamics/grain and optical Wet Mix coverage in the common renderer. Separate secondary canvas-colour pickup and final retrospective mixer-tail recomposition remain approximations. Azimuth, mapped tilt/speed/pressure dynamics execute from recorded input. Remaining unmapped scalar fields are reported individually, not silently presented as supported. Factory bundled images are never substituted when absent.

## Portable export import

Krita `.kpp` and `.bundle` are also accepted: Pixel Brush, Color Smudge approximation, erasers, circle/rect tips, embedded or bundled GBR/PNG masks and PAT/PNG grain, pressure/tilt/speed/direction curves, scatter and one independent masking brush. Animated GIH tips, SVG/text generators and specialized paint engines are reported as unsupported; missing resources are not replaced with thumbnail pixels. XML and archive limits apply before resource decoding.

The CLI also accepts `.grafetto-brushes.json`: `{library, assets: {"asset:<sha256>": "<base64 raw>"}}`. This keeps exact descriptor IDs. Envelope/counts/paths/dimensions/asset-reference/SHA256/decoded-size limits are checked before writes (360 MiB encoded, 256 MiB raw). Runtime **must still run the shared `isBrushLibrary` semantic guard** before serving/importing the resulting catalog; Python does not duplicate all TypeScript descriptor constraints. Extra payloads, nested dual components, duplicate IDs and corrupt raw bytes fail closed.

ZIP expansion, nesting, record lengths, dimensions, channel counts and RLE rows are bounded. The CLI is also invoked by the bounded server worker for uploads; runtime catalog validation remains mandatory before installation.

Format references used for independent implementation: [ag-psd ABR reader](https://github.com/Agamnentzar/ag-psd/blob/master/src/abr.ts) (MIT), [Adobe shared descriptor structures](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/), [BrushBox byte-level research](https://github.com/Stef4678/brushbox/blob/main/docs/abr-format-spec.md). No GPL implementation was copied. Tests build synthetic inputs and contain no commercial source pixels.

## QA

`QA_OUTPUT=/private/evidence QA_URL=http://127.0.0.1:5386 npx tsx e2e/brushImportQA.ts`
uses the existing browser harness against a separately running stack with the real
owner-supplied catalog. It checks picker selection, cold peer resources, two
formats, undo/redo and reload. It is not part of CI: source packs are private.
CPU/GPU differences are measured on decoded pixels, not PNG byte hashes.
`e2e/brushImportDevice.cjs` is a separate hardware witness with its own browser
which closes in finally. It reuses an installed Playwright via NODE_PATH.

The pre-release renderer was unified by explicit owner decision: old built-in tokens use the current set. See ADR017 consolidation and [research notes](RESEARCH.md) for verified facts, approximation boundaries and the deferred vendor-reference comparison.

Krita importer rendering version4 adds single/multiple sensor transfer curves through the shared runtime, up to four supported controls per target. Unsupported sensor types and non-product combination modes are reported; curve interpolation and sensor normalization require vendor calibration.


Procreate rendering5 separates Bleed/Wet Edges coverage from Blur/Pull colour
transport. Unknown MixSoftening and modulated transfer are reported explicitly;
Grade changes grain contrast rather than exhaustion. Rotated footprints are not
clipped to one radius, and mixer imprints beyond512px keep full world coverage at
bounded pickup resolution. See RESEARCH.md for approximation and migration limits.

The revision number is a compatibility label, not the sole identity: the complete descriptor and source settings are hashed, so changed settings already receive a new content ID. ABR importer version4 reads published Mixer/Smudge tool keys `wetness` and `Prs ` (strength), retaining older aliases as fallbacks. Load/mix reservoir flags remain approximate; no `dryness` interpretation is guessed.

Krita Color Smudge honours `PressureColorRate` and `PressureSmudgeRate`: unchecked/missing options map to load 0 and pickup 1; enabled options without saved Value default to 1. This correction changes the content-derived descriptor ID even with descriptor version 4, because identity covers the complete final mixer parameters and source hash. Existing ID/version resources remain immutable.

### Официальный штатный набор Krita

Воспроизводимая загрузка фиксированной версии Krita 5.3.4.1 (общий исходный
release tag `v6.0.4.1`, commit `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`):

```sh
python krita_stock.py --cache /path/to/private/source-cache --output /path/to/catalog
```

`krita-stock-sources.json` фиксирует размер, SHA256 и Git blob SHA1 каждого
официального файла. Повреждённый существующий cache отклоняется; скрипт его не
перезаписывает. Текущий default: Krita4 bundle, RGBA bundle и 16 loose KPP;
`--include-legacy` дополнительно включает Krita3 отдельным source group в отчёте.
Точные ID-дубликаты исключаются с записью в `stock-report.json`. Все skipped
сохраняются с причиной; импорт не означает идентичность движку Krita.

Лицензии ресурсов следует отличать от GPL приложения: `meta.xml` Krita4 и
Krita3 bundle указывает CC-0. Авторы Krita4: Deevad (David Revoy), производные
кистей Ramon Miranda, Razvanc, Radian, Wolthera, Storm, Scottyp и других.
Krita3: Timothée Giet, Ramon Miranda, David Revoy и другие. RGBA: Ramon Miranda;
точная строка лицензии «Same as default brushes in Krita». Для loose KPP нет
индивидуального license field: общий `krita/data/README` описывает CC-BY-3.0
старых GBR/GIH/VBR и credit David Revoy / Blender Foundation / Ramon Miranda,
но не устанавливает однозначно лицензию каждого нового watercolor preset.
Не маркировать все loose ресурсы CC0 без дополнительного подтверждения.
Сырые bundle, KPP и изображения в Git не включать.

Формат embedded pattern подтверждён официальными
`plugins/paintops/libpaintop/KisEmbeddedTextureData.cpp` и
`libs/image/kis_properties_configuration.cc` закреплённого commit: XML
`type="bytearray"` добавляет внешний base64 слой; затем embedded pattern
декодируется как base64 ресурс при отсутствии linked pattern. Период текстуры
берётся из исходной ширины, а не размера квадратного GPU cache. Неквадратные
текстуры и vendor texture application сохраняют предупреждение приближения.

Gaussian circle auto tips use a sampled normalized erf profile rather than a
linear hardness ramp. This improves the radial distribution, while remaining
approximate: a static GPU bitmap cannot reproduce Krita's regenerated subpixel
mask and size-dependent antialiasing. Gaussian rectangles, curve generators,
spikes and random density retain explicit compatibility warnings. Krita adaptive
spacing retains its coefficient; anisotropic metrics and spacing sensors remain
subject to the renderer compatibility warning.

The stock runner resolves shared static raster resources across the selected
installed bundles, including references from loose KPP and RGBA presets.
Conflicting resources with the same basename are rejected by the resource
reader; animated GIH and SVG are still skipped instead of selecting a frame or
substituting a circle.

GIH current-stock image pipes retain all equal-sized frames and the one-dimensional
random/incremental selection mode. Random selection uses Grafetto deterministic
per-dab randomness, not the vendor RNG. Other dimension/selection modes and unequal
frame dimensions fail explicitly. Exact EOF after fewer complete GBR frames is
accepted as Krita does (official fairy-dust declares4, contains1), with an explicit
compatibility warning; partial frames are rejected. RGBA pipe pixels currently
contribute alpha only, with an unsupported-colour warning. All native static and
pipe raster tips include square `maskBounds` matching exact POT padding, including
half-texel offsets for odd dimensions; Gaussian256 masks already fill the cache.

Before publishing a stock catalog, build the current shared package
(`pnpm --filter @grafetto/shared build`). The stock CLI then runs
`node validate_catalog.mjs /path/to/catalog/manifest.json /path/to/catalog/validation.json`
and fails if the whole library or any recursive component fails the real shared
TypeScript guard. The report records manifest and guard SHA256. Python tests
alone do not establish that the server can accept the catalog.

Krita curves extend their first/last value outside defined knots, as specified
by `libs/image/kis_cubic_curve.cpp`117–125. The converter explicitly adds missing
boundary knots without changing native internal control points. This does not
remove the separate cubic-versus-linear interpolation limitation. A tight POT
with an odd short side is padded to the next POT to keep the centered square
crop inside texture bounds without shifting native mask pixels.

The stock runner additionally rasterizes the single official
`leaves-scattered.svg` using the already installed Node sharp/librsvg. This is
**offline stock only**: the helper accepts exactly20404 bytes with SHA256
`9ccd89dfbbd74096b858374700629b94413855276c8075db3f8cbef72e9baa5a` before
rendering. No arbitrary SVG upload support is enabled. The input is audited,
fixed and integrity-checked independently of the bundle. Subprocess limits:
20s timeout,96MiB JS heap, one libvips worker,1M input pixels,4MB PNG output.
Krita's SVG path renders to a white1000px canvas before mask conversion
(`libs/brush/kis_svg_brush.cpp`30–59); this is reproduced, with an explicit
Qt-versus-librsvg antialiasing approximation warning. No new dependency is
installed. General untrusted SVG needs a separate bounded safe renderer and
continues to fail explicitly.

Krita importer rendering version5 identifies the new stock conversion: animated
frames, native mask UV bounds, adaptive spacing and source default metadata.
All presets are re-identified, including brushes whose raster settings did not
change, so installing the catalog never rewrites historical version4 metadata.
Old manifests and replay resources remain immutable.

Krita rendering version6 compiles original natural-cubic knots (including corner
flags) into bounded256-sample double lookup curves. The shared scalar evaluator
uses constant-time uniform interpolation with the declared sample snapping rule;
legacy sparse curves retain their former arithmetic. Synthetic endpoint knots
are not included in the spline solve. Unsupported sensor-combination modes remain
explicit warnings. Version5 and older catalog IDs are never rewritten.

Stock manifests use compact JSON without numeric rounding: version6 LUTs plus
historical metadata can otherwise exceed the server2MiB file envelope through
whitespace alone. The CLI validation reports file bytes and rejects catalogs
over that existing quota; it never drops historical presets to fit.

Krita rendering version7 resolves image-brush application from native/legacy
flags. Plain ALPHAMASK PNGs use inverse integer Qt gray multiplied by alpha,
even when an opaque alpha channel exists; grayscale GBR retains its positive
opacity convention. GIH applies this rule to every image frame. LIGHTNESSMAP,
IMAGESTAMP and GRADIENTMAP material remains explicitly unsupported, retaining
the previous approximation; custom image-mask brightness/contrast adjustments
also report unsupported. No lightness/RGB shader is implied by this fix.

Version7 Color Smudge additionally retains initialLoad=effectiveColorRate and
SmudgeRateSmearAlpha (legacy absent defaulttrue). Dulling/smearing algorithms
remain approximate. Rebuild/validate/install a NEW version7 catalog separately;
version6 metadata/assets and the comparison baseline must remain untouched.

Krita version8 selects `mixer.source: previousCanvas` only for legacy engine,
SMEARING mode0, effective ColorRate0. Absent engine/mode use native false/0
respectively. Dulling/new-engine/foreground paint keeps approximate carried
pigment. SmudgeRate sensor curves remain unsupported and are reported when
active. This creates new immutable IDs; older catalogs must not be rewritten.
Offline `krita_texture.py` remains independent and is not applied by import.

Krita version9 retains enabled SmudgeRate curves as `mixer.pickupDynamics`,
using the common bounded (maximum4) product sensor controls and native LUTs.
Disabled options or UseCurve=false emit no dynamics; non-product combinations
and unknown/excess sensors retain explicit unsupported reports. Version8
curve limitations above describe historical resources, which remain immutable.

Krita version10 compiles multiply/subtract texture tone offline, preserving
native rounded rectangular pattern grid in top-left POT padding, fixed/random
phase flags and product strength sensors. Native Qt smooth scale is approximated
with PIL bilinear; scaled grids above2048 are explicitly reported/downsampled
with native world period retained (periods above8192 rejected). Other texture
application modes retain explicitly unsupported legacy grain approximation.
New application modifies dab alpha BEFORE flow/opacity, not a pressure threshold.
Historical descriptors remain unchanged. Exact integer channel rounding and GPU
sampling still require native comparison; no pixel equivalence is claimed.

Krita version11 compiles enabled single-additive ascension Rotation sensors to
raw `tiltDirection`, including native neutral zero-tilt orientation. The native
sensor curve precedes angle strength; mapped response is .5+s*(.5-C(u)). Other
rotation sensors, mixed combinations, disabled curves and out-of-range strength
remain explicitly unsupported. Correct inverse-gray masks remain unchanged;
old opaque mask rectangles had hidden missing rotation on narrow flat tips.

Krita version12 converts native internal angles to the common clockwise screen
convention: base angle is negated (both auto and image tips), and compiled
single-additive response is .5+s*(C(u)-.5). Version11 matched the internal
scalar but missed native raster handedness; asymmetric nonzero-tilt witnesses
now verify physical leg directions. Version11 descriptors remain immutable.

Krita version13 retains stamp LIGHTNESSMAP tips as source-alpha `tip.mask` and
adjusted straight-gray `tip.material` CAS planes. Animated grayFrames are paired
by index with existing alpha animation, including repeated alpha IDs. Native
adjustments/migration compile offline; strength defaults1 when unchecked.
Active lightness-strength curves remain explicitly unsupported (constant kept).
The renderer must premultiply gray before filtering, unpremultiply the sampled
gray, apply native RGB shift/gamut lightness mapping, and premultiply final RGB
once. RGB/gradient applications and mixer lightness still use explicit unsupported
fallback; paired planes alone do not promise native filtering/rounding identity.
Version13 is shared with the separate legacy pure-dulling sampling migration;
older descriptors are immutable, and no catalog is automatically installed.
