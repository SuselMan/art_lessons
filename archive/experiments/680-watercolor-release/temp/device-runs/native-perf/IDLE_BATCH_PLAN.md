# CPU preparation: cost-aware settle idle batching

No release/source edits and no GPU run. Preserve every callback, chronological order and P/C pair; presentation morph8s unchanged. Goal fewer RAF slots for small brush contact exchanges, not solver/model tuning.

Current Queue tick: drawing or late1op; idle base1+backlog capped. WatercolorSettlePlan contact loop: per-contact upload op then N exchange callbacks, N=ceil(.2*radius/S*maxExposure*sqrt2/.84), maxExposure=-ln(1-B/255). Each exchange paired2 brushPass +2copyRegion andpresent. Contacts normally smallrect(scissor ±1 canonical cell) while front/diffusion ops are fullfield and often4passes percallback. Thus callback count is poor GPUcost measure.

Reuse SliceGroups concept: initial8draw/2^18px, max16draw/2^21px,12ms wallafterGPUbarrier. Fullfield unknowncallbacks first conservative1callback and barrier. Tag only contact upload/exchange with conservative cost metadata; unknownphase no batching. Drawingkeepcurrent1op and late/backloggates. Each tagged exchange conservative5draw equivalent and5×scissorarea; copy/present actualextent audit before changing count. Upload counts bytes separately, group boundary at each upload untiltexImage2D wall profiled.

Canonical area origin/S/halo from same contact code, notapproxbrushbbox. After each completed group gl.finish (or separately verified1×1 FBO readpixels barrier) then readclock/adapt. No clock-only GPUqueue budgets. Avoidfeedback/iteration changes; s.complete callbacks maychain another job, loopmuststopifjobidentitychanges. Clear/contextloss/scratchlive lifecycle asoldadvance.

Tests/gates before integration: callbackorder/sourcePNG and canonical P/C/V hashes byteexact vsOFF; nativeactiveframephases, newDown GPUblackout, solverduration; unitcompletion/cancel/reentrantchain. Typical80 then220bounded; maximumsingleentrycost must be measured and safe onVega beforeSamsung. Allocation0/newshader0 expectation. Neverbatch fullfield4passcallback merelybecausemetadataunknown.

Required evidence still missing: actualcontactscissor distribution and percentops/contact; timings synchronized perentry/group without altering nativeframebenchmark. Native f99 snapshots showjobs~990ops and~15s idlewall; synchronousCPUcompletion11–15ms is submission cost only.133–167ms next-stroke RAF spikes may be queued GPUbacklog, not yet caused.
