# Full canonical planner paired-carry diagnostic

Production defaults stay OFF. Optional SettlePlanPasses.carryPair receives exactly
one existing adjacent mode16→15 pair with explicit oldP/oldC and distinct output
identities. It returns false by default; absent/false adapters use the ORIGINAL
two calls. Native diagnostic returns true only after encoding the same Q8 pair.
No buffering of unmatched calls, no change to solver op list/cadence/presentation,
no grouped submission, no upload/copy/material-film changes. Owner mismatch,
alias and malformed resources throw normally; retained uniforms share the
existing owner quantum and cancellation/disposal follows the original job.

Runner flags diagnosticPairedCarry and diagnosticHardwareLinearInputs default
false. Paired carry is compatible with serial or progressive scheduler; grouped
must remain disabled for this experiment. CPU tests compare expanded logical
pass/copy/upload/ownership traces on full/half fields; absent/OFF unchanged,
paired mode retains explicit OLD inputs. Single-colour branch has no independent
Color carry and must never request pairing. Ten planner/cleanup tests pass.

Build: node docs/qa/harness/728-paired-carry-plan/build.mjs [out] [paperAssets]
Serve temp/paired-carry-plan. API:
runPairedCarryAB({size:100,hardwareLinear:true,pairedFirst:false,progressive:false})
or size400 with allowLarge:true. Accepts tape:packedOperations to reuse a known
actual captured input. Default author produces ONE packed same-wash tape with
contacting second colour: otherwise a single-colour test cannot exercise pairing.
Both arms replay that exact tape unchanged; OFF versus ON only differs in pair
selection. Hardware sampler flag is identical. Grouped submissions forced OFF.

Gate captures all10 field roles, layer and every allocated material/original/base/
film/solvent role, wholeRGBA byte diffs+hash+dimensions/nonzero. It fails if no
pairedCarryCalls occurred, any role/checkpoint differs, validation/loss occurs,
or ownership counts change. Optional captureSolvent:true available only with
synchronous serial settle; it perturbs timing. Progressive final-role parity is
supported but intermediate history is not claimed. CPU/replay/submit/wait counters
exclude final readbacks/hashes; actual source/live/prepare/settle phases separate.

Strict harness/app typecheck and source lint pass. Full1536 software run deliberately
not performed; root controls actual hardware gates. No Room or speed claim.

400 regression localization (options OFF by default):

* `controlRepeat:true` runs OFF/OFF on the SAME tape. This establishes native
  serial repeatability separately and does not claim paired equivalence.
* `oraclePairIndex:0` (zero-based, up to128) selects ONE actual paired call in the
  ON run. The current real GPU inputs are snapshot-copied at that exact command
  boundary. Distinct shadow outputs first copy the prior output bytes so outside
  scissor matches; paired executes, then ORIGINAL16→15 executes on those SAME OLD
  inputs into shadows, then both results are copied to immutable readback buffers.
  Mapping/hashing happens after runner.drain. Returns dimensions/filter/identity/
  uniforms and bounded input/output hashes plus P/C byte differences. No synthetic
  fixture or delayed re-read of mutable inputs. Oracle mismatch fails exact gate.
  Stage snapshots limited128MiB and2048 extents. Destructor/exception cleanup
  retires shadows through owner scope and releases snapshots. Diagnostic copies
  and shadow passes perturb timing and can perturb driver behavior, so performance
  results from this run must not be used. Default serial remains the baseline.

Example: `runPairedCarryAB({size:400,allowLarge:true,tape,hardwareLinear:true,
controlRepeat:true})`, then SAME tape with `controlRepeat:false,oraclePairIndex:0`.
If the selected pair is not exercised the harness throws, rather than false-pass.
Whole final roles remain checked even when a local pair oracle passes.

Baseline400 per-operation localization: `runPairedCarryAB({size:400,allowLarge:true,
tape,hardwareLinear:true,controlRepeat:true,perOperationStages:true})`. Requires
serial OFF/OFF, no oracle/progressive/solvent capture combination, at most8ops.
Captures layer/colorBase/solventLoad/pressure just before settle (queue snapshots
freeze real source bytes) and after drain/finish for EACH packed operation. Only
SHA256/dimensions/nonzero are retained for comparison; source readbacks total
≤40MiB, released per operation; no large per-op baseline pixel arrays retained.
CPU source/plan/pass/upload payload fingerprints are FNV diagnostic hashes of
normalized parameters/typed-byte payloads, not a cryptographic byte-parity proof.
Plan arguments are also returned (bounded4 prepare calls perop), field filter and
allocation identities normalized. firstDivergence reports operation/stage and BOTH
CPU and GPU-role differences. This readback intervention perturbs scheduling and
may mask/expose driver nondeterminism; timings must not be interpreted as normal.
Default flags and input tape remain unchanged. A hash change localizes a role;
this bounded stage gate deliberately does not report unsupported maxbyte counts.

First-operation solvent localization: add `firstOpSolventStages:true` to the serial OFF/OFF `perOperationStages:true` gate with the original packed tape. At operation 1 only, capture solventBase, strokeSolvent and coverage alongside solventLoad/layer/colorBase/working pressure. All captured roles include top-down nonzero pixel bbox and nonzero byte count outside the union of actual production GL reveal rectangles for that operation. The union preserves original source commands; no extra pre-source capture/clear is inserted. A null reveal means every nonzero byte is outside. Readback perturbation remains explicit and bounded below 40 MiB per stage. This separates base initialization/copy, film raster and final solvent landing; coverage helps identify common source geometry changes.
