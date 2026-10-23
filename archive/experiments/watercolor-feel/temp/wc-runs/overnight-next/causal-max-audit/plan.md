# CURRENT MAX causal experiment — plan, not runnable spec

Parent: production source, paired-ribbon correction ONLY. No optics85, no ADD, no headroom yet. Principle: local deposition, paired displacement, next deposition on the displaced source canvas. Scope: one originally blank tile, one pigment, S=1.

## Required lifecycle changes

1. Keep painter film=true and all normal MAX/fullEveryPose code. Preserve gesture, scalar clocks, lastKept, wet indexing and seed through groups. Do not call beginStroke/newFilm between groups.
2. In index._finishRibbonStroke capture an interim boolean beside `const settledGesture = scratch.gesture`. Both releaseFilm calls must use this captured flag; setting a global around prepare then resetting before completion is insufficient. Existing complete closure otherwise frees all four film buffers.
3. Fast plan retains normal stitch into a/b/ca/cb. Actual full-RGBA zero checks of inkBase/colorBase plus original blankness are mandatory; NO forced clear of b/cb. Require entry.filmGesture===scratch.gesture, all four film buffers present, paints.size<=1, minmaxExt present.
4. After paired brush writes, copy a into inkLoad AND strokeInk, ca into inkColor AND strokeColor over the SAME active overlap. Preserve immutable zero inkBase/colorBase. Scratch colour/deposit must be copied before any subsequent shader overwrites spare textures. Do not use stale pressure/band outside the last contact scissor.
5. Interim finish may maintain composite inkDry/colorDry for visibility, but they cannot become the base for next source or the fixed record. Final normal settle reads inkBase=0, whole current strokeInk mobile, once only.
6. Manually clear consumed brushTravel for causal/ZERO, set diffusePending=true for the final pass, preserve standing union. noteFinish already unions bounds and maximum radius; storageBounds must include each active region. Finish does mutate noteDabSpacing/noteDirection: CPU scalar comparison must establish these changes do not affect next painter deposition; if they do, interim must bypass that mutation or restore exact scalar snapshots.

## Comparators and contact partition

ZERO uses identical group rendering and film copy, skips contact draws. Identity must be tested against same-group source before/after copy and separately original one-shot MAX. It is NOT assumed exact: group boundary caps/tessellation can still differ.

DEFERRED must use **the concatenation of each group's already-created contacts**, not brushDragContacts(allTravel). The latter flushes at radius*1.5 and at end-of-call, so partitions differ. Record immutable contact world rect/field/radius arrays for each group; defer uploading those same arrays in the same order until final brush stage. Causal and deferred each have identical list/hash/count, but different deposition timing. This costs CPU bytes only, no extra GPU texture. To isolate chronology from diffusion ordering, deferred also runs brush BEFORE the one final normal settle, not after its diffusion; final plan receives no duplicate contacts. A third stock-final-brush comparison can measure diffusion-order separately.

## Bounds and closure

geometry.json contains original-prefix CPU bounds: 6=79 dabs/16 groups, 9=342 dabs/32 groups. Translation only, no pressure/time/radius/angle rescale. Interim upper bounds 98x222 and316x276; full upper bounds522x646 and786x746. Existing canonical1536 buffers remain; no new allocation when S1. Guard actual active<=512 and final<=1024, one tile, canonical1536. Conservative 18 full canonical RGBA8 clear/write equivalents per group: 162MiB/group =>2.53125GiB(16),5.0625GiB(32), plus final settle. Five initial gather clears alone are smaller; they are not the whole work estimate.

Brush writes and copies are restricted to contact scissor. Its coverage footprint must lie inside cumulative finish bounds+2. Endpoint flow gate must prohibit donor/recipient transfer across contact rect: if verified this gives support closure independent of group count; otherwise pad2 is UNSAFE, and cumulative hop padding is required. Audit shader gate endpoints before runtime spec. Every GPU unit followed by gl.finish and measured <=1second; overshoot aborts before next unit. CPU estimates cannot prove timing.

## Mandatory pre-GPU proof

Actual home5288 compiled index/painter/plan anchors must be fetched and sequentially parsed. Need exact unique release captures, filmcopy identity, retained source snapshots, contact-list equality and endpoint closure. No runnable spec is emitted until these proofs exist. Existing R6 runtime patches cannot be blindly reused: film=false, b/cb forcedzero, optics85 and newFilm contradict this experiment.

## Limitations

MAX is an upper envelope, not finite inventory. Moving existing source then MAX repaint can replenish it; this is intentional source-motion model, not mass conservation proof. RGBA8 clipping remains at mass1. MAX of optical and physical records can lose composition coherence across multiple paints: forbidden here. Translated paper/noise differs from original; all controls use the same translation. Replay/live chunk invariance is not established by this blank-prefix experiment.
