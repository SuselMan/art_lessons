# DEV material quantum cap candidate (OFF)

Default remains8 original material steps per FIFO frame. Explicit DEV setter
accepts finite exact8/16/32, captures that cap when each material request is
admitted, and retains the existing4 ms CPU budget. It does not reorder a source,
job step, finish, publication or operation. Source and material publication
Promises retain their original barriers; cancellation, device loss and errors
close the same job exactly once. No new GPU APIs, Promise handlers or waits.

The existing interactive controller accepts QA_NATIVE_MATERIAL_QUANTUM_CAP=16
or32 only in its exact A15/existing3 mode. It checks actual adapter selection
before input and preserves the selection in compact evidence. Unspecified mode
is8. There is no production query switch or automatic device adaptation.

CPU tests compare full40-step material bytes and event order at default8,
explicit8,16,32. Groups are8×5,16/16/8 and32/8 with the same final values. Separate
clock test proves the4 ms budget still stops early. Held publication cannot be
passed by the next source even at32. All choices preserve original step/finish/
publish failures, cancellation/loss, and the admitted request's immutable cap.

Risk: more steps per frame can submit more GPU commands before the compositor
gets time, increasing queue pressure, memory residency and the final queue-ACK
wait. CPU4 ms does not bound GPU duration. The previously observed407.7 ms
material pacing interval may shrink while260.9 ms publication wait grows; this
is not yet an end-to-end improvement. This candidate does not fix source blocked
behind genuinely expensive previous work and does not introduce a preview.

Next hardware, only after allocation: start with16 rather than32, same exact
source/browser14/recipe/paper and freshRAM admission, abort500, bounded120/150.
Observe actual first/next latency, rAF and remaining steps/publication phases.
Same packed input final-material proof remains required: fresh live re-input
can change wet cadence and cannot establish byte equality by itself. Do not
combine this cap with other changes or publish it as a default optimization.

## Two separate hardware decisions

ONE cap16 usefulness probe is already runnable through the existing interactive
controller: add QA_NATIVE_MATERIAL_QUANTUM_CAP=16 to the admitted A15/existing3
interactive command. Current source1088d595 contains the adapter change, therefore
all source/manifests/browser14 checks must be generated from that current source.
Fresh1700 admission, passive at most30 seconds, abort500, child120/outer150,
owned one-context cleanup and bounded artifact promotion remain mandatory. There
is no hardware allocation implied by this command. The cap16 run is not paired
against f24 cap8, so timing differences alone are not causal gain or material
parity. Keep exact selected/actual cap and original FIFO/UP/rAF markers.

Only if that bounded probe is useful, request a distinct same-packed proof:
create one fresh reference at cap8 from the UPDATED adapter source, with source
A15/existing3 ON and full/raw OFF. Preserve exact packed2 input and endpoint before
cleanup. Historical f24/0f references have different source/browser fingerprints;
they cannot be silently reused by changing their HEAD or relaxing source checks.
Then replay that immutable input in fresh cap8 and cap16 owners, both from the
same updated source, same paper/material roles/recipe and A15 flags. Compare
complete decoded material/meaningful purple endpoint, GL0/loss/errors, recorded
ops/seed/history, selected pipeline hits and actual cap values. Existing pair
source-A mode switches A15 OFF/ON; it is not this cap8/16 cohort. A narrow mode
extension will be needed, with distinct strict guards, only after usefulness.
Do not regenerate pointer gestures in the two replay arms or fold startup into
input latency. Fixed order/cache still cannot support a causal speedup claim.
