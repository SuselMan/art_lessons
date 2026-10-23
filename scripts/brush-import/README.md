---
layer: tooling
summary: импорт внешних кистей
---

# Offline brush import

Offline conversion of Procreate `.brush` / `.brushset` and Photoshop ABR 1/2 sampled and 6/7/9/10 into Grafetto's shared `BrushDescriptor` contract. Python's standard library reads archives, keyed plist objects, Photoshop Action Descriptors and VMAL channels. Pillow decodes/resamples images; no external converter or vendor engine runs.

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

Imported descriptors have `id: imported-<24 hexadecimal digits>`, version 1, `model: stamp`; the ID hashes source settings, all final rendering fields (including shape/grain content hashes), and the importer schema/version. Source file paths are not persisted. Preset identity/settings are immutable at runtime. A future importer which changes rendering must bump its import version/identity rule; it must not overwrite referenced resources.

## Fidelity and supported subset

Importer rendering version **2** emits optional `descriptor.behavior.version: 2` and per-brush `compatibility: [{feature,status,detail}]`. Existing IDs and historical manifests are not rewritten. `approximate` means source semantics are retained but Grafetto's formula differs or the archive transfer function is undocumented; `unsupported` identifies an active lost feature. Neither status promises Photoshop/Procreate pixel equivalence.

ABR 6/7/9/10 minor 1/2: descriptor blocks plus both the minor-1 bitmap layout and minor-2 VMAL/fixed-preamble layouts, raw/PackBits 8/16-bit samples; 16-bit converted to 8-bit coverage. Embedded grayscale/RGB `patt` records use a separate bounded VMAL reader (indexed/CMYK rejected). Computed round tips, tip transforms, shape/scatter/count dynamics, pressure/tilt/direction/fade controls, color jitter, tool options, texture and one dual component are retained. Unknown blend modes/controls, projection, pose, noise, mixer/smudge tools and foreground/background mixing produce specific compatibility notes. Legacy 1/2 sampled records are supported with bounded per-record resynchronization; computed legacy records are skipped because shape metadata is undocumented. Modern variants, patterns and legacy are synthetic-fixture tested; the owner's real reference pack is 6.2.

Procreate: signed pressure curves, source spacing down to 1e-6, shape Rotation (stroke following, distinct from pencil azimuth), random orientation per stroke, count/count jitter, moving grain settings, rendering flags, wet/burnt edges, wet-mix fields, pressure taper and one secondary archive are retained. Normalized count is approximated linearly to 1–16; numeric blend-mode enums, rendering formulas and private archive-to-handbook scales remain undocumented and explicitly approximate. Small spacing is declarative: runtime must enforce its own minimum pixel step/budget. Any active Wet Mix scalar or recursive rendering selects the mixer model, including charge/dilution-only presets, so wet parameters execute rather than remaining inert on stamp. Load/pickup/strength mappings are explicitly approximate. Dry presets retain stamp. Dual components remain mask-only approximations: independent secondary spacing/scatter/count/dynamics/moving grain/rendering/Wet Mix are not reproduced as a second stroke. Active azimuth, tilt and unmapped dynamic scalar fields are reported individually, not silently presented as supported. Factory bundled images are never substituted when absent.

## Portable export import

The CLI also accepts `.grafetto-brushes.json`: `{library, assets: {"asset:<sha256>": "<base64 raw>"}}`. This keeps exact descriptor IDs. Envelope/counts/paths/dimensions/asset-reference/SHA256/decoded-size limits are checked before writes (360 MiB encoded, 256 MiB raw). Runtime **must still run the shared `isBrushLibrary` semantic guard** before serving/importing the resulting catalog; Python does not duplicate all TypeScript descriptor constraints. Extra payloads, nested dual components, duplicate IDs and corrupt raw bytes fail closed.

ZIP expansion, nesting, record lengths, dimensions, channel counts and RLE rows are bounded. This is an offline trusted-owner tool, not an HTTP upload parser; runtime catalog validation remains mandatory.

Format references used for independent implementation: [ag-psd ABR reader](https://github.com/Agamnentzar/ag-psd/blob/master/src/abr.ts) (MIT), [Adobe shared descriptor structures](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/), [BrushBox byte-level research](https://github.com/Stef4678/brushbox/blob/main/docs/abr-format-spec.md). No GPL implementation was copied. Tests build synthetic inputs and contain no commercial source pixels.

## QA

`QA_OUTPUT=/private/evidence QA_URL=http://127.0.0.1:5386 npx tsx e2e/brushImportQA.ts`
uses the existing browser harness against a separately running stack with the real
owner-supplied catalog. It checks picker selection, cold peer resources, two
formats, undo/redo and reload. It is not part of CI: source packs are private.
CPU/GPU differences are measured on decoded pixels, not PNG byte hashes.
`e2e/brushImportDevice.cjs` is a separate hardware witness with its own browser
which closes in finally. It reuses an installed Playwright via NODE_PATH.
