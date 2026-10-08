OFF-default constructor option omitDeadCapillary replaces capillary() only with1.
Original finiteQ8 expression returns mix(1,1,t)=1 after nine unnecessary reads.
This preserves numerical recurrence; compiler may already eliminate those reads,
so measured speedup is unknown. Production pipeline stays unchanged by default.

Build/check: node docs/qa/harness/728-dead-capillary/build.mjs and check.mjs.
Serve temp/dead-capillary; API runDeadCapillary({width:1536,height:1536,
iterations:8,scissor:[600,650,100,200],newFirst:false}). Repeat reversed order.
Both kernels receive SAME frozen Q8 inputs in actual mode15. Warmup/reset excluded,
one submission contains iterations passes, optional timestamp-query spans first
compute start→lastcomputeend; CPU/submit/wait separate. Resolve/readback outside
timing, finalwholeRGBA bytegate. Scope isolated carry, no Room/speed/crash claim.
Software32×40 changed252positivebytes, OFF/ONdifferent0, validation/errors0;
all30positiveGL/native mode cases exact plus meaningful negative control. AppTS
and changedsource lint gates required. Root alone owns hardware testing.
