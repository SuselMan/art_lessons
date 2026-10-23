---
layer: tooling
summary: импорт внешних кистей
---

# Offline brush import

Offline conversion of Procreate `.brush` / `.brushset` and Photoshop ABR 6.1/6.2 into Grafetto's shared `BrushDescriptor` contract. Python's standard library reads archives, keyed plist objects, Photoshop Action Descriptors and VMAL channels. Pillow decodes/resamples images; no external converter or vendor engine runs.

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
- `brushes: [{descriptor, name, source, warnings}]`: shared `BrushDescriptor`, UTF-8 display name, source basename, explicit approximation warnings.
- `assets: [{id, size, file}]`: `id = "asset:" + SHA256(raw)`, `file = SHA256(raw) + ".bin"`. Exactly `size * size` bytes, one unsigned 8-bit luminance channel, **white = coverage**. `size` is a power of two up to 2048. `descriptor.tip.mask` and optional `descriptor.texture.id` refer to asset IDs. Duplicate raw pixels share a single asset. The SHA covers pixel bytes, whose length determines size.
- `skipped: [{name, reasons}]`: brushes without embedded shape/grain or supported sampled tip. Missing built-in Procreate resources are never silently substituted.

Tips are centered in a transparent POT square, retaining original pixels until dimensions exceed 2048. Larger tips are proportionally resampled, with a warning. Grain is resampled to square POT; non-square grain may change aspect, reported as a warning. Alpha multiplies image luminance. ABR samples already encode positive coverage and are not inverted heuristically.

Imported descriptors have `id: imported-<24 hexadecimal digits>`, version 1, `model: stamp`; the ID hashes source settings, all final rendering fields (including shape/grain content hashes), and the importer schema/version. Source file paths are not persisted. Preset identity/settings are immutable at runtime. A future importer which changes rendering must bump its import version/identity rule; it must not overwrite referenced resources.

## Fidelity and supported subset

ABR: section lengths/padding, variable-length sample IDs, VMAL channels, raw and PackBits 8-bit rasters, Action Descriptor scalar/object/list values, preset-to-sample matching, names, spacing, fixed angle, tip roundness/flips, tool opacity/flow, basic pressure-size/opacity curves. Descriptor dynamics are approximations; unsupported descriptor value types fail explicitly. Procedural tips and non-8-bit samples are unsupported. Texture patterns, dual brush, color, tilt and Photoshop blending are not reproduced. Version 6.1 is covered structurally but the real supplied sample is 6.2.

Procreate: embedded Shape/Grain images, NSKeyedArchiver references and curve points, names, spacing, maximum opacity, basic pressure-size/opacity response, shape rotation/azimuth, shape/size/opacity jitter and grain depth. Flow/pressure/texture/scatter mapping is approximate. Wet Mix, tilt, taper, grain movement, dual secondary brush, exact rendering/blending and bundled factory assets are not reproduced. These are stamped approximations of imported brushes, not a Procreate watercolor simulation.

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
