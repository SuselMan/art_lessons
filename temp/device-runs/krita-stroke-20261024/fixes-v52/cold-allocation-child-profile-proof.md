# Samsung: corrected advance-only cold child profile

Six actual NEW mapped Gaussian descriptors, SAME production executor/pool/layer,
64 diagnostic capacity, source-law CPU oracle. All six surfaces exact (0 wrong
RGBA), GL0, state restored, pool owners released. Context supports VAO and ANGLE.
No UI/native-GUI, finite-total-GPU-cap, seal-validation or 4ms guarantee.

Instrumentation uses an inAdvance try/finally gate and deep copies each retained
step BEFORE observing state. Outside-advance calls are recorded separately.
RAM-only AST transforms preserve the actual constructor/class/prototype and
130 original GL call expressions/order; no additional GL calls. At most top12
steps and top32 nested child events per case. Nested timings overlap: constructor
contains cold error checks. Exact source SHA dictionary is in the JSON proof;
it captures C2 before the final empty-tail one-line correction, deliberately
not a final C2 gate. Baseline mutable observer counters remain invalid.

Largest observed step 40.9ms was paint, with two stateRestore calls totaling
21.9ms (isTexture6:16.3ms, isBuffer2:5.0ms), capture4.7ms. Another 27.4ms
step had no allocation: capture7.7ms and restore18.6ms (isTexture3:14.4ms,
isBuffer1:4.1ms). This directly identifies existing state-restore object queries
as a real expensive boundary; do not remove foreign-handle validation globally.

A 37.6ms cold step spent preparePhysical34.3ms: capture6.8ms,
constructor15.7ms including three cold error checks10.6ms, clear0.1ms,
restore11.4ms. texImage2D measured0ms; this does not establish zero GPU work,
but attributing the entire hitch to texImage2D is unsupported. Resident-only
metadata takes can avoid unnecessary capsules/turns; cold allocation and real
write/foreign-state boundaries remain guarded.

Own context/child/forward closed, original three tabs unchanged; cleanup errors
empty. No disposable builds, processes, forwards or services remain. The shared
existing dependencies were not changed. JSON proof contains bounded measurements,
input/body/source hashes, AST integrity and strict cleanup receipt.
