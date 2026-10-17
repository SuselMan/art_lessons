# Contrast cross-GPU: bounded RCA

Intel UHD D3D11 and Samsung Adreno, exact same defaultX 2048×512 four input SHA. Each GPU's native-reference/paged stages and final P/C/coverage match exactly in every run. Normal DITHER ON unless explicitly marked; disabling DITHER on both had no effect. This is synchronous standalone correctness, not foreground Room performance.

| Candidate | Background channels/max | Selection channels/max | True Contrast reference P / C channels | Final P / C channels | Final max P/C |
|---|---:|---:|---:|---:|---:|
| Frozen dfe baseline | 76/1 | 140/3 | 3636 / 5927 | 40226 / 126456 | 18/30 |
| Integer BG93e | 0/0 | 4/1 | 80 / 1355 | 39050 / 123976 | 18/30 |
| Integer BG93e + all Contrast highp samplers | 0/0 | 4/1 | 80 / 1171 | 39050 / 123950 | 18/30 |

Integer BG candidate is exact to CPU rational background on both devices for all65536 channels, including36 exact half ties. Baseline BG76 differing channels include25 exact ties and51 non-ties; e.g W2295/V81 gives25.5, Intel25/Samsung26. Another W1710/V81 gives19.49698189, Intel19/Samsung20. Both candidate GPUs report FRAGMENT HIGH_FLOAT precision23/range127; source P/C NEAREST, background LINEAR, selection/keep NEAREST, low256×64, minCells47, actual approved parameters identical.

After integer BG, selection and keep still differ at one pixel(245,31), Intel137 versus Samsung136 in all four channels. Highp sampler declarations do not remove it. True Contrast reference C also differs across1093 pixels despite the low-grid selection disagreement involving one pixel. Full determinism is NOT achieved; integer BG/highp candidates are not an approved-art preservation claim.

Nine-array reports contain exact RGBA8 histograms/coordinates. `referenceP/C` exports are FINAL monolithic outputs; `contrastReferenceP/C` are actual immediate Contrast outputs. Original transformed Contrast module SHA must match across devices. Getter patched SHA differs only because browser import origins differ; both patched hashes were exactly reconstructed using identical getter/source and recorded origins. Source-label aliases of the first integer candidate are retained and explicitly qualified, never rewritten.

No source/application edits by this QA agent. Runtime candidate edits belong to root. Raw gzip remains in registered private caches for follow-up RCA; tracked proofs contain only compact metrics. Own Intel Chrome/profile/forward retained under explicit KEEP, no active QA page after each run; Samsung resources belong to its sole operator.
