> Исторический прототип v1: больше не используется активными А/Б на Мини. После замечаний Ильи15:50 цель перенесена на существующие операторы v4 в `native-target.ts`; см. отчёт728-mini-puddle-native-v2-2026-10-15.md.

# Whole-puddle target (diagnostic)

Base `38cae73f`; standalone WebGL1 target, never calls per-stroke settle. Default32 iterations at256² for1024². Every reset captures the current unified raw P/C/coverage into fixed storage, replacing the previous epoch. No stroke list, texture allocation per reset, CPU readback, wall clock or history replay.

```ts
const target = createPuddleTarget(gl, 1024, {
  coarseSize: 256, iterations: 32,
  paperTexture: enginePaperTexture, paperScale: 1024, strength: 1.25,
})
target.cancel()
target.reset({p: rawP, c: rawC, coverage: rawCoverage}, ++epoch)
// Per frame; budget counts actual drawArrays calls:
target.step(6)
const {p,c,coverage} = target.buffers()
// state.epoch / state.iterations / state.done
// After an explicit Dry completes:
target.dry() // clears standing water B only, keeps silhouette A and P/C
// On disposal:
target.destroy()
```

`step(1)` is supported: six budgeted passes make one iteration (paired C/P, water, paired material reconstruction, coverage reconstruction). Output P/C references switch together only after the iteration completes. Intermediate fields are valid immediately after reset and after every complete iteration; the last complete pair remains published during partial work. Caller should read `buffers()` again, as its p/c members swap. Reset itself is an immediate capture/restrict stage, not charged to `step` budget. Cancel retires pending work synchronously; the last output remains accessible until reset/destroy.

Coarse evolution couples concentration equalisation, flow toward shallower water, and downhill paper relief. Water expands across low paper barriers for12 iterations then slowly attenuates; it does not advance on dry unconnected islands. Every third early material step spans two coarse cells and checks the intermediate water gate; remaining and late steps are local. Common donor/capacity weights move pigment and optical absorption C together, never RGB. Integer edge transfers are conservative on the coarse lattice. Upper bound per donor edge≤.22 preserves nonnegative four-neighbour material; shared capacity guards all P/C channels.

Reconstruction adds only the coarse material delta to the original full-resolution Γ/v4 brush. All high-frequency input detail survives the identity case. It uses the previous material `clamp(base+delta)` convention; fine reconstruction clipping and restriction quantisation mean exact final full-resolution mass conservation is not claimed. This is an artistic alternative, not v4 parity. Water expansion is a finite capillary approximation, not a mass-conservative solvent solver. No external paper texture means deterministic procedural channels; pass the actual paper map for the common target.

Storage: nine full-resolution RGBA8 buffers (raw snapshots3, published3, unpublished P/C2, dry-coverage temporary1), eight coarse RGBA8 buffers (paired ping-pong6, initialP/C2). About38MiB at1024/256; reused across all epochs. Three shader programs, one quad. `destroy()` is idempotent. No services or browser owned by this prototype.

Checks: `npx vitest run --config docs/qa/prototypes/mini-puddle/vitest.config.ts`; standalone strict TypeScript command documented in the parent report. MockGL checks lifecycle, fixed allocations, pass budgeting, epoch reset, no readback and atomic P/C publication; real shader compilation/artistic result require the shared hardware harness.
