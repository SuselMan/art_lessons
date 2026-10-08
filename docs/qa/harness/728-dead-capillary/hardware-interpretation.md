# Surface interpretation and next bounded candidate

Root supplied hardware observations, not executed by this agent:
8 iterations byteexact/errors0. Forward GPU OFF1.90/ON2.42ms; reversed
ON.85/OFF2.36ms. These contradictory orders are insufficient evidence of an
improvement. Whole wall intervals7.2/5.3 then3.1/6.2ms include host/wait overhead
and are not substitute GPU execution measurements. Default stays OFF.

Next measurement:32iterations; alternate ABBA or reversed repetitions with each
candidate warm before every measured run, same textures/scissor/work. Report
median GPUspan/iteration and interquartile range, not fastest run. Timestamp span
includes between-pass scheduling but excludes readback/queryresolve. Eliminated
source reads can already have been folded by the compiler, so zero improvement
is plausible and should end this candidate rather than motivate numerical edits.

A potentially larger exact candidate is paired carry mode16/mode15, whose actual
production order is CanonicalWatercolorSettlePlan.ts739–740:
Cnew=F(Cold,Pold,cost), Pnew=G(Pold,cost). Color is dispatched first specifically
so it reads old pigment. Neither output is consumed by the other's calculation.
A native two-storage-output kernel can compute both from shared old fields,
store both RGBA8 outputs, and share cost/weights/pigment donor fetches. This
reduces dispatch/pass count without deleting the intermediate Q8 step between
iterations. It is not fusion across iterations or physical model tuning.

Necessary conditions: identical rect/filter/path/scalars; distinctPold/Pnew and
Cold/Cnew resources; no external observable command between the pair; same
floating expression evaluation order; old shader branches retained exactly;
shared precomputation only if sample/scalar expressions literally match. Native
storage output limits must permit2attachments. Hardware sampler diagnostic must
be preserved; replacing it with manual interpolation would confound the gate.

Required proof: every carry iteration P/C same-input byteexact on native OFF/ON,
then whole tape allroles/final layer exact with validation/loss zero. Performance
compare real paired work, including original two passes, using GPU queries and
submission/encoding counters. No implementation or claimed gain in this report.
