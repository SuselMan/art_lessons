# Native progressive settle gate

OFF by default: `progressiveSettle: true` uses the existing planner preview callback and 150 ms throttle, then composites actual current pigment/color/coverage against captured original. `onSettlePreview` is a synchronous opportunity to submit paper presentation. `yieldSettleFrame` defaults to rAF between ordered solver quanta. No fade or alternate physical operator is used.

Grouped and progressive options are incompatible. Input stays blocked through drain. Active-gesture chunk boundaries use synchronous fallback, preserving immediate CPU film/delivery state. Replay also requires drain. Finish precedes final composite and dispose runs in finally.

Software WebGPU gate: one20px native round stroke, production CPU input/dose and solver kernels. The QA-only field owner uses requested extents rounded64 instead of production1536minimum; this compact test proves scheduler/presentation isolation, not production-size quality/performance. Same-input serial/progressive final bytes: diff0/max0, hash2f971e15. Eight distinct current-composite snapshots, no GPU validation errors, input blocked during settle. Exact result in software-result.json. CPU7tests, TypeScript and lint pass.

Build: `npx vite build --config docs/qa/native-progressive/vite.config.mjs` from the worktree root. Output: `temp/progressive-dist/docs/qa/native-progressive/index.html`.

Run compiled HTML on a trusted origin and call `window.gate()`. Fixture returns final-byte comparison, intermediate hashes and validation errors. Use `window.gate(true)` for production1536 hardware testing; the QA fieldFor override is then disabled. Never change the runner field owner for a test.
