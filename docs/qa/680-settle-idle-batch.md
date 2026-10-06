# #680: isolated idle settle batching candidate

Base8c4bc5c2. Default OFF, manually set `engine._settleQueue.idleBatch=true` only for a benchmark. No model/shader/operation data change. No GPU measurements yet; do not integrate or present as a performance fix.

The queue batches only known local contact callbacks while idle/on-time. Drawing and late-frame behavior stay unchanged. Hard total16draw equivalents/2^21pixel equivalents per tick,12ms budget checked after GPU completion; this initial version synchronizes after each local callback conservatively. Unknown/fullfield callbacks keep one-entry frame boundaries. Upload callbacks remain unknown.

A contact exchange estimates5draw equivalents (2brush draws,2copies,presentation allowance) over its actual canonical scissor including one-cell halo. Its throttled presentation may reconstruct whole tiles/acquire buffers: whenever150ms presentation is due within20ms, cost becomes unknown. Cold upload, absenttexture and unsetbounds are not treated as cheap. Every operator/presentation callback remains in original chronology, including same pre-contact P/C sources and paired copy-back.

CPU gates: fulltypecheck and lint:fix pass(existingwarnings),16targeted queue/plan tests pass, map:check/map:rules pass(noerrors). Tests cover defaultoff/unknown boundary, drawing, draw/pixel caps, completedGPU clock, cancel/replacement and chronological operators. No new GPU buffers/programs; one smallcost getter percontact. ActualGL cost/PNG parity remain unverified.

Required Vega AB: same recorded operations OFF/ON canonical PNG + P/C/V bytes exact; native80 active/burst/singlepurewater/waterpig phase rAF, solverduration, per-callback syncedGPU upperbound, no GL/UI errors. Existing nativebaseline active45Hz vsidle60Hz and nextstroke133–167ms spikes retained. New timing must measure GPU completion; CPUcomplete11–15ms only measured submission. Samsung cold behavior/realGPU safety required before normal use. No current release changes.
