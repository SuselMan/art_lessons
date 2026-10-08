# Surface: concrete first-source CPU call-order traces

Actual Surface Chrome154, hosted00faf4e8, same original400 tape. Exclusive
serial device use, three OFF/OFF arms: plain, first-source split, early prime
submit. No stages, early GPU copies, compute clears or extra completion waits.
Each arm used two fresh owners; owned tabs closed afterwards.

All six CPU-instrumented owners matched the known clean layer3b2a6e53…c626e;
all final-role comparisons passed, validation/errors0/lostfalse. **This includes
PLAIN**, which previously failed uninstrumented. CPU-only tracing perturbs timing
and cannot be treated as proof of corrected baseline stability or a fix.

Concrete observations from recorded calls:

- Plain trace341 events: first coverage uniform queue.writeBuffer at event27;
  solvent allocations/clear/copy follow at events28–33 in the SAME source encoder.
  Original/cov/ink/film preparation occurs earlier in that encoder.
- Split trace345 events: all initial scratch preparation precedes the separate
  init submission(event32); first source uniform write occurs at event37.
- Prime trace347 events: same preparation and init submission(event32), then
  CPU prime.end/replay.begin markers; first uniform write at event39.
- Split and prime resource/GPU call order, including local IDs, is LITERALLY
  identical after removing only prime.begin/end and replay.begin CPU markers.
- All106 writeBuffer payload sizes/FNV hashes match in order across all arms.
  FNV is a diagnostic fingerprint, not a cryptographic upload parity proof.
- Each arm's two owner traces match exactly, with no2048-event truncation.

Thus the observed uninstrumented split-versus-prime stability difference is
not explained by a different GPU call order in these traces. CPU preparation
before replay versus before first source, elapsed CPU time or hidden driver
batching remain hypotheses. No missing clear, resource alias or driver cause
has been demonstrated by this comparison. Defaults remain OFF.

Adjacent compact JSON records the three results; full untracked raw traces:

- temp/device-runs/native-order-plain400-surface-1791429277756.json
- temp/device-runs/native-order-split400-surface-1791429300766.json
- temp/device-runs/native-order-prime400-surface-1791429320652.json

Private hosted addresses, upload bytes and credentials are excluded.
