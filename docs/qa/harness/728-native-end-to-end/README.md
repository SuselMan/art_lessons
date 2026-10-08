# Native runner → canonical log → production GL

Standalone diagnostic, without Room, server, fake ACK, input mocks or alternate physics.
Both paths execute real GPU source/settle/composite passes. Native uses actual
CanonicalWatercolorGesture/DabSystem and its authoritative packed operations;
legacy PencilEngine replays those original IDs, wet profile and stroke seed.
Native per-event batch boundaries and legacy packed-operation boundaries deliberately
remain visible to the comparison. A mismatch is a finding, never hidden by tolerance.

```
node docs/qa/harness/728-native-end-to-end/build.mjs temp/native-end-to-end /absolute/path/to/baked/paper
node docs/qa/harness/728-native-end-to-end/check.mjs temp/native-end-to-end 100
node docs/qa/harness/728-native-end-to-end/check.mjs temp/native-end-to-end 400
```

Build copies the production Fine manifest and raw gzip assets. Missing assets are
fatal at runtime; flat paper is NOT an acceptable substitution. The check script
uses real WebGPU + WebGL SwiftShader and writes latest-100.json or latest-400.json.
Secure localhost is used. On trusted hardware import run.js then call
`window.runEndToEnd({size:100})`; 400 requires `{size:400,allowLarge:true}`.

100: zigzag. 400: water stroke then pigment over the same retained wet wash.
All points fit the single bounded1024 tile. Canonical1536 settle fields are not
reduced. GPU owners run sequentially and are destroyed before the next backend
allocates resources. 400 has a conservative512MiB soft estimate and rejects a
reported system memory below4GiB; unknown deviceMemory is reported, not fabricated
VRAM. This is not a memory safety guarantee. Do not run400 concurrently with any
other software GPU job. GL stage timeout is10minutes by default.

Final material RGBA is read once per backend. GL tile rows are reversed from
bottom-up to WebGPU top-down before stitching into the1024 page. Report includes
whole-layer hashes, changed byte count, maximum/mean absolute byte difference,
nonempty checks, paper/tape hashes, original tape, elapsed wall times and errors.
There is no per-frame full field dump, no all-transient-field parity assertion.
Elapsed times include CPU submission, queue wait and orchestration; they are not
GPU timer measurements. Software output differences do not establish hardware
exactness or performance. No Room concurrency, undo/redo or animation claim.

Third-owner isolation: after native author disposal, a fresh native runner replays
the same original packed tape with end timestamps preserved. It must not emit new
operation IDs or mutate the tape. Report adds `authorVsNativeReplay`,
`nativeReplayVsLegacy`, `nativeReplaySha256`, `replayPreservedTape`, nonempty
and elapsed time. Existing `wholeLayer` remains author-versus-GL. If author/replay
differs, input delivery/batch boundaries already differ before comparing GPU
backends; if they match but packed-native/GL differs, investigate raster/settle
backend parity. Both can differ, so neither implication is a complete proof of
a single faulty method. All three GPU owners remain strictly sequential.
