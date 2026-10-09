# First-owner GL seed and field clears — source cost passport

Source audited after `50cbad98`. No hardware timings were added. The successful Surface A proof remains source `406d06d4`.

| Stage | Exact bytes / work | Current owner and ordering | Safe optimization boundary |
|---|---:|---|---|
| `AccumulationBuffer.readPixels` | 1024 × 1024 × 4 = 4,194,304 bytes (4 MiB), synchronous GL readback | Reads only the existing layer tile FBO; returns GL bottom-up rows | Cannot replace with WebGPU texture copy across API/device ownership |
| `canonicalTopRowsToGlRows` | New 4 MiB CPU array; reads 4 MiB and writes 4 MiB | Exact vertical row reversal, including RGB at alpha zero | Reuse an owned CPU buffer; retain immutable bytes until upload consumption |
| `backend.upload` | 4 MiB logical upload via `queue.writeTexture` outside an encoder | New native target field; row-zero-at-world-top contract | No shader sampling or alpha/color conversion allowed |
| `backend.whenIdle` seed promise | Queue completion wall, not GPU duration | Stored by executor constructor; `seedReady` awaited by synchronization | It is not a synchronous first-source await; removing it changes snapshot/export safety |
| Native target → scratch original | One 4 MiB same-device texture copy | Source snapshot for exact original preservation | Already GPU `copyTextureToTexture`; no CPU round trip |
| Coverage / pigment / color initial clears | Three full 4 MiB field clears when required | New or pooled scratch; each must be zero before first read | Already render-pass `loadOp: clear` for full fields; partial rectangles use exact compute bounds |
| Film base snapshots | Full same-device ink/color texture copies | Immutable base captured at material gesture boundary | Already GPU copies; cannot simply alias a texture which later mutates |

The CPU seed explicitly allocates **8 MiB** of JS byte arrays (readback + reversed rows), processes 8 MiB in the flip, and uploads 4 MiB. These are logical bytes, not peak RSS or measured driver allocations. The GPU target is another 4 MiB texture; paper/noise and additional source/settle fields are separate. Current evidence does not attribute a measured wall time to these individual operations.

`PaintTarget.contentRect === null` describes no tracked visible content, but it is not an exact RGBA-zero certificate: the bridge preserves nonzero RGB at alpha zero. It therefore cannot authorize dropping the seed. A fresh constructor/full-clear provenance with a write epoch could provide a stronger certificate; restore/import/undo/transform must invalidate it.

## Which copies can replace the readback

1. **Same-device, already authoritative native tile:** copy an immutable retained native target into a newly owned target, with identical extent/format/row convention. This can preserve exact bytes and independent destination ownership. Required guards: matching layer/tile identity and GL write epoch since native publication; source lease remains alive through queue completion; no texture alias; stale device/generation rejected. Current runtime lacks the GL write-epoch certificate, so this is a plan rather than an implemented shortcut.
2. **Certified new zero tile:** exact native clear/zero initialization replaces readback + flip + upload only after a complete all-RGBA-zero provenance proof. Visible-content bounds alone are insufficient. Reused pooled fields still require a clear.
3. **Arbitrary existing GL tile:** the GL→CPU→WebGPU bridge remains the byte-authoritative path. WebGLTexture cannot be supplied to WebGPU `copyTextureToTexture`. Copying a canvas/ImageBitmap is a different transport: the whole displayed canvas is not the isolated layer FBO, and alpha/color-space/row conversions need independent byte parity including hidden RGB. No exact fast path is established by the current source.

## Next controlled steps

- Add read-only markers around readback, row reversal, upload enqueue, and seed queue completion; record generation, tile dimensions, logical bytes and source ownership. CPU spans and queue wall must remain separate, without added GPU fences.
- Reuse one owned 4 MiB readback buffer and one owned 4 MiB row buffer per initializer; test immutability and release/rebuild paths. This targets allocation/GC, not the GL readback barrier.
- Prototype the same-device retained seed copy only after an explicit GL write-epoch/lease contract exists. Test native→native, native→pencil→native, eraser, transforms, undo/redo, layer switch, restored checkpoint and retired generation. Compare all decoded RGBA bytes, including asymmetric row fixtures and hidden RGB.
- Keep field clears and immutable film copies until read/write dependency proofs justify a reduction. Grouping commands into the existing owner encoder can reduce submissions; it cannot eliminate required memory initialization or change base snapshots into mutable aliases.

Same-packed A OFF/ON material parity remains required before presenting a quality-preserving optimization. No speedup is claimed by this source audit.
