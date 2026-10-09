# Exact A paired material gate

This is an offline plan, not a completed hardware pair. Current source includes
lazy module cache hits and seed cost markers. Earlier A long proof does not
validate these changes or material equivalence.

Reuse `parallel-preload-pair.mjs` and `native-replay-controller.mjs`; do not add a
second hardware controller or runtime copy. The implemented strict mode is `source-A`: fixed reference scenario `water-pigment400-long`, full
and raw dispatch warm OFF, hardware pressure ON, observed two plus pressure one
async preparations held ON in both arms. Only A15 preparation differs OFF/ON.
The legacy parallel3 mode keeps its four400/full warm recipe. Source-A explicitly
selects two operations and excludes full/raw warm; the modes cannot be mixed.

Generate one current-source packed reference, then feed the exact same packed
bytes into two fresh isolated contexts. Fix source HEAD, four critical browser
file SHAs, decoded paper SHA, shader/descriptor passports, board/layer ownership,
operation order, and export boundary. Required selected A keys are declared
before input, unchanged from the long source proof. OFF uses identical factory
code, with no A15 async preparation; ON must prove exact prepared objects consumed,
no module creation on those cache hits, and no preparation dispatch/field bytes.

Quality passes only when exported RGBA bytes (including hidden RGB), dimensions,
packed history and material endpoint match exactly. Both endpoints must be
nonempty purple, GL error zero, device alive, errors empty, and owned contexts
closed. A missing arm, RAM admission below 1700 MiB, missing recipe passport or
incomplete export means incomplete evidence, never a quality pass or failure.
Retain only bounded reference packed JSON and endpoint PNG; no full field dump.

Report startup wall, replay wall and seed phase costs separately. Fixed arm order
and driver cache prohibit a causal performance claim. No additional fences are
introduced. Keep shared backend running; stop only owned frontend, forward and
contexts, then finish the registered disposable.

## Runnable offline-gated mode

The existing pair entry now accepts `QA_PAIR_MODE=source-A`. It selects the long
reference, records two packed operations, sets full/raw warm OFF, then runs OFF
and ON with existing3 ON in both. Source A passports are required before context
creation; ON readiness uses the same reviewed preparation helper and the fixed
selected HIT subset. A dedicated assertion in the existing proof module rejects
wrong warm/mode/input/material/seed/descriptor/HIT and missing owned cleanup.
Node CPU tests pass; no hardware result exists for this mode yet.

### Invocation passport (no resources started)

From this worktree, the existing entry is:

```sh
QA_PAIR_MODE=source-A QA_PAIR_ALLOCATION=surface \
  node docs/qa/harness/728-room-native-cpu-profile/parallel-preload-pair.mjs
```

Before running, the caller supplies the existing registered disposable
`QA_PAIR_OUT`, exact current `QA_SOURCE`, source/paper/origin manifests,
`QA_RUNTIME`, `QA_ENTRY_FILE`, `QA_APP` and allocated `CDP_BASE`. The origin
manifest contains exact `sourcePipelinePassport`, fixed `sourceRequiredKeys`,
observed two shader SHAs and decoded paper SHA. This command alone is not hardware
authorization. No frozen source tree, dependencies copy or new controller is needed.

Fixed source roles: water `normal:100:0:PB29:round`, then pigment
`normal:100:100:PB29:round`; both colors `[0.2, 0, 0.6]`. Replay accepts exactly
two strokes, unchanged packed properties, through ordinary `appendOperation`
with remote source; only the fresh target layer ID is remapped. Reference PNG
is validated as an endpoint passport and never loaded as the native seed.

Each child performs a fresh 1700 MiB admission before context creation. A failed
reference or OFF arm stops the pair before the next arm. `pair-progress.json`
records partial evidence without calling it a quality failure. Child disposal ACK
is mandatory before progressing; teardown errors remain failures. The runner
does not stop the shared backend or remove registered resources on its own.

Both actual reference and replay exports now count meaningful purple pixels;
source-A requires nonzero and exactly equal counts as well as decoded RGBA SHA.
Nine additional factory/cache/seed browser raw source hashes are compared with
the full current manifest in all three contexts.
