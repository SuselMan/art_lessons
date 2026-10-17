# #779: bounded CPU cost of historical dependency restoration

VPS Node/tsx, CPU only; no GPU, browser, input-latency or speedup claim. Fixed module source at17d73a66, SHA256 `7d98c8d485b5356bf41142debcba4775b5b5b53c746c8f8ffde7d1c7da737efe` matched the worktree source checked after the probe. The module was frozen; the agent was working on unrelated Room files. Other ongoing changes were Room prototype files, outside these imports.

Input:20/60/120 independent same-layer A-water/B-consumer pairs, one intervening scopedDry. UndoDry, Undo allA establishes protection. Then three RedoDry/UndoDry cycles. Every candidate restored exactly20/60/120 water-only source operations. Measure only effective material resolution after each UndoDry, excluding fixture construction.

| Independent pools | Final entries | Three resolution times ms |
|---|---:|---|
|20|68|15.94,11.41,7.69|
|60|188|33.54,25.15,24.33|
|120|368|71.21,65.92,63.42|

Small bounded sample with JIT warm-up and concurrent lightweight QA traffic; not a performance limit or device comparison. The unfixed baseline drops needed water, so comparing its faster incorrect result as an equivalent speed benchmark would be misleading. No runtime changes follow from this probe. Harness: `docs/qa/harness/728-night/boundary-resolver-cost.mjs`; argument is the chosen worktree root. Disposable script in the registered root annotation fixture directory is removed with that directory at final cleanup.
