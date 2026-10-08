# Exact stencil cache rejected; dead colour snapshot candidate

No hardware/whole speed result. Existing scalar-height cache fails canonical1536 Q8 equality and remainsOFF.

## Destination-specific cache cost

To preserve `hi − height(px+offset)` exactly, prepare every offset at the SAME destination fragment, retaining multiplication/addition/subtraction order. A scalar sampled at its neighbor fragment is insufficient. Eight Float32 height differences require32bytes/cell:1536²×32=72MiB. Front also exports `hj` and uses climb, raising the minimally packed representation to40bytes/cell=90MiB; convenient threeRGBA32F textures cost48bytes/cell=108MiB. Diffuse height-only needs9heights=81MiB (RGBA packing108MiB). Packing dh reduces storage but still requires proving no compiler reassociation or changed rounding when moved to another shader. GL1 minimum8samplers also constrains an un-packed nine-R32F design. This is not a feasible first production optimization under current device memory limits.

One preparation still evaluates the original9paper samples/cell (plus front noise). Cached diffusion thereafter reads2RGBA float textures instead of up to9paper samples, but actual cache/bandwidth/ALU behavior is hardware-dependent. Different radius or king/knight stencil changes the key; front stride also changes it. Schedule cadence therefore needs multiple resident caches or repeated preparation. Logical sample-count amortization is at least2same-key steps; no GPU-time break-even has been measured. More memory does not establish a speed gain. Expected whole gain: unknown, planning0.

## Narrow proof-safe candidate

`CanonicalWatercolorSettlePlan.diagnosticSkipSinglePaintColourSnapshot` is OFF by default. For S>1 and frozen finish metadata paints.size<=1 it avoids ONLY `ca0` acquisition and `field.cb.copyTo(ca0)`.

Ownership/read proof:

- Prepare captures immutable finish metadata before determining the condition; `colour` is later defined from that same `metadata.paints.size>1` condition.
- The first ca0 reader is presentation `fromField(color,ca0,...)`. With S>1 and colour=null the color buffer is null; presentation instead rebuilds full-resolution color from landed deposit.
- The second reader is finish `fromField(col.out,ca0,...)`. With S>1 and colour=null, finish takes `rebuildColour(settledColor,settledInk)` instead.
- Thus ca0 has only acquire/copy/release uses. No solver operator reads it. Disposal releases only actually-owned snapshots, cancellation adds no synthetic release. Multicolor and S1 paths are byte-for-byte unchanged at the command-contract level.

For field area A this removes4Abytes live snapshot storage and8Abytes logical copy read+write traffic. A pool-acquire clear additionally writes4Abytes only if that owner actually clears acquired storage. At1536²:9MiB live,18MiB copy traffic, optional9MiB clear writes;1copy draw/copy operation removed. These byte counts are not claimed GPU timing or whole speedup.

## Gates and limits

33CPU tests pass:16candidate configurations across full/half × single/mixed × film/no-film × finish/abort, plus16frozen canonical chronology configurations and one two-job single→mixed wash transition. For half/single the entire trace is identical after removing only the dead snapshot's acquisition/copy/release and renumbering allocated IDs. Negative control mixed-paint retains its allocation/copy and every argument/order; defaultOFF frozen hashes remain identical. The tests explicitly verify the eliminated snapshot has no readers and dispose is idempotent.

This is a resource/command proof, NOT actual shader-pixel or material validation. Next gate must execute actual GL identical input (half-res single, multicolor already in wash, single→mixed transition, abort/rebuild), compare ALL canonical fields/material/final layer, and record acquisition/copy counters separately from readback. No surface was used for this candidate. No production promotion or default change is implied.
