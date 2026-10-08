# Diagnostic paired carry

No production caller/default changes. CanonicalPairedCarry is a separate opt-in
prototype for one original mode16(color) + mode15(pigment) pair. Both read OLD
P/C, cost/path/solvent; both write distinct RGBA8 outputs. Every original carry
expression and operation order inside each evaluation is retained. Color's A/C
texture roles are remapped to shared oldC/oldP, including their filter bits.
The sampling diagnostic is retained: hardware LINEAR option selects identical
clamp sampler behavior in both baseline and paired kernels. Explicit full bind
layout prevents elimination of unused fixed/noise bindings changing the API.
No iteration fusion, model edit, source change or grouped submission feature.

```sh
node docs/qa/harness/728-paired-carry/build.mjs
node docs/qa/harness/728-paired-carry/check.mjs
```

Serve temp/paired-carry. runPairedCarryGate({hardwareLinear:false|true,
iterations:12}) compares OLD two-pass vs NEW one-pass P/C bytes after EACH
iteration, feeding both resulting Q8 fields into the next iteration. Covers
varying strides, full/odd scissor and LINEAR cost input. Software both sampler
arms48retained captures total exact, meaningful transport932P/872Cbytes first
iteration, errors/validation0. Host smoke includes small timestamp gate.

runPairedCarryTiming({width:1536,height:1536,iterations:32,
scissor:[600,650,100,200],newFirst:false,hardwareLinear:true}) compares the same
fixed inputs, same carry step work, baseline64compute passes vs paired32. Warmup,
reset, queryresolve and whole-output readback excluded. GPU span first compute
start→lastcomputeend with optional timestamp-query; CPU/submit/wait separate.
Repeat newFirst:true and alternating orders. Both P/C outputs must byte-match.
Timing workload uses no feedback to preserve an identical per-pass input in both
arms; the separate gate proves actual ping-pong recurrence. No Room or hardware
speed claim. Root alone owns device testing.

Source prototype intentionally repeats carry evaluations, permitting compiler
common-subexpression elimination but not manually reassociating donor sums.
First benefit to measure is dispatch/pass count and possible shared sampling;
register pressure could increase instead. A whole-tape adapter config is a next
step AFTER hardware isolated byte/performance gates, not implemented here.
