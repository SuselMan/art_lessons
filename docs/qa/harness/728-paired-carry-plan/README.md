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
