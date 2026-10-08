# Bounded enumerative + SMT experiment: Q8 fit max reduction

This is an executed search, not a handwritten optimization branded superopt.
No production shader/default changes. Source: Canonical fieldOps.ts fit()/carry()
(the return `fit(max(out4,vec4f(0)))` in modes15/16).

The parent measured real Surface carry passes: 32 iterations,100×200 scissor on
1536 field, original two passes14.024704ms GPU in one forward trial. This identifies
a real workload containing fit; it does NOT attribute14ms to four max instructions.
Fit fraction within carry is unknown and probably small. No model simplification
or floating addition/division reassociation is allowed here.

## Search and proof

Grammar: all binary max trees containing each of five leaves (1,r,g,b,a) exactly
once; commutative partitions canonicalized.105 candidates generated exhaustively.
SMT Z3 5.1.0 checked every candidate:105 UNSAT inequality queries,0 unknown,
0 counterexamples. Additional literal fpMax Float32 bit-result checks for baseline,
balanced candidate and chain: all3 UNSAT.

Domain: finite nonnegative f32 leaf values; constant1 unchanged. Unsigned IEEE
bit ordering is numeric ordering on this domain, so max only selects original
bits. Constant1 makes signed-zero ties irrelevant to denominator. NaN/nonfinite
input behavior is outside this contract; this is not an unconditional shader
substitution proof. Channel sums, division and Q8 stores are kept in original
order. Official [Z3 fpMax API](https://z3prover.github.io/api/html/z3.z3.html)
provides the independent FP32 check; bounded grammar/results are reproducible
in search.py/search-result.json.

Result: existing baseline already has4max operations and critical depth3.
All trees need4binary nodes for5distinct leaves; depth cannot be less than
ceil(log2(5))=3.45 searched trees match this frontier. **No lower-cost expression
was found in this grammar.** This is a negative optimization result, not global
optimality over machine instructions, SIMD reductions, compiler IR or all programs.

## Kernel gate and benchmark

`window.runFitSuperopt({width:256,height:256,loops:32,repeats:16,reverse:false})`
compares baseline, automatically enumerated alternate balanced tree, and an
enumerated depth4 control. Reverse ordering repeats the check. Same input,
unchanged recurrence additions/divisions and Q8 writes. Each loop evaluates fit;
this artificially raises local kernel share and must not be called carry speed.
GPU timestamps supported conditionally; compile, warmup and readback excluded
from timed dispatch span. No WebGL/Room or full watercolor path is executed.

SwiftShader32×40 loops16/repeats4 forward/reverse: all outputs exact,errors0.
GPU timing baseline .577/.755ms; balanced .679/.765ms; chain .492/.709ms.
These software measurements are small/noisy, do not establish a hardware win,
and are recorded honestly in software-summary.json. Parent-controlled actual Surface hardware benchmark completed; see hardware-summary.json.

Amdahl: if measured local gain S applied to fraction f of full watercolor,
whole speedup=1/((1−f)+f/S). Neither hardware S nor measured f is established.
The searched op-count/depth model gives S=1, hence expected gain0 in that model.
Do not infer any whole speedup from synthetic repeated-fit timing.

Reproduce search with z3-solver installed outside Git, then:
`PYTHONPATH=temp/superopt-deps python3 docs/qa/harness/728-fit-superopt/search.py docs/qa/harness/728-fit-superopt/search-result.json`.
Software gate: `node docs/qa/harness/728-fit-superopt/check.mjs`.
Static index/run.js are self-contained for parent trusted QA hosting.

## Hardware closure: no demonstrated positive gain

Actual Surface Chrome154;256²,32fit loops,16dispatches, timestamps available.
Forward GPU spans (baseline/balanced/chain):2.359296/3.2768/7.733248ms.
Reverse:all3reported2.359296ms. All six Q8 outputs share SHA256
`aeb56ef0d5fe595bb1fa15bebbf1995cb6e3ca300ae5c3b575873bb95deaa9d2`,
byte differences0/errors0. Root executed the hardware measurement; this agent
only reviewed and compacted its raw report.

No positive win was demonstrated. One forward/reverse sample, loop-amplified
synthetic workload, exact repeated timestamp values and compile/warm state
prevent a statistical equal-cost or regression conclusion. Compiler wall times
are reported separately, not mistaken for shader execution. Search optimum is
only within its grammar/cost model, not a strict whole-runtime lower bound.
Expected whole gain remains zero for planning because there is no supported
improvement to promote; this is NOT proof that all future GPU optimization has
zero benefit. Experiment closed negative; production/default unchanged. No
additional GPU loops were run to hunt for a favorable sample.
