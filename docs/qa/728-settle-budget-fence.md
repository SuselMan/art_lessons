# #728 — Queue-only completion clock prototype

Base eb99d8b1, same physical engine as current3005 plus later reviewed changes. Cross-device-determinism/Operation Log principle: material command order, dabs, transport and canonical result do not change; only budget clock synchronization is opt-in. `_wcSettleBudgetFence=false` preserves gl.finish with no allocation. When true, only WatercolorSettleQueue.ctx.syncGpu uses engine-owned reusable1×1 RGBA8 FBO/readPixels4B; drawing `_runSlice` and canonical FIFO retain prior finish paths.

One lazy texture/FBO per engine, not per unit. Previous framebuffer, active texture/binding and PACK_ALIGNMENT restored. Context loss forgets invalid handles without deletes, restoration recreates on demand; actual destroy cancels settle/spill/rebuild ownership before releasing helper. No snapshot/pigment texture is sampled or read by this fence.

Eight CPU tests: disabled zeroalloc/finish behavior, real Queue versus drawing separation, actual Engine cancel/loss/restore/destroy and helper buffer/pack/state/ownership. These are CPU lifecycle proofs, not driver completion or smoothness proof. Hardware same immutable meaningful fields/fullRGBA and native tail/newtouch remain pending. Earlier all/drawing scoped fences had negative/limited results; do not enable this flag by analogy.

`backlogSize` remains legacy `_opQueue.length`: its sole consumer immediately increases Queue perTick. Replacing with canonical requests would alter throughput policy and is outside this diagnostic scope; no such change made.
