# Actual preview: поле растёт, Q8 теряет дозу, экран слабее поля

ONE Surface actualRoom water400→pigment70, EARLY_PREVIEW ON. Raw `temp/device-runs/owner-water-dab-radial-surface.json`. 6MiB readback perturb scheduling; latency not measured. Source8 content immutability is not asserted here.

| Owner2 stage | P.B/P.A sum | max | nonzero | radial second moment (texel²) | pending alpha sum/nonzero |
|---|---:|---:|---:|---:|---:|
| initialize |1419|98|23|2.742|47469 /1537|
|16|1203|22|174|14.793|141669 /8640|
|64|769|10|174|18.134|112486 /8640|
|111 retire|769|10|174|18.134|112486 /8640|

P and C alpha match. P support bbox grows5×5→15×15 preview cells; material pending bbox44×44→108×108 world pixels. Sum decreases45.8%;64→111 is stagnant for these summaries. Preview is not conservative physics; repeated RGBA8 quantization is an observed limitation.

Source coverage really inherits broad water:172713 nonzero pixels, bbox205,335–790,717. Transport domain2709 cells, water2709 cells, immutable summaries across snapshots. P outside source alpha (and3worldpx halo) is0 at all stages. Thus source-coverage clipping is NOT supported for this actual case. Halo test is a diagnostic predictor, not shader's ring/rethreshold exact mask. Pending3 pixels outside raw support does not establish a clipping defect.

Dry/meaningfulUndo/Redo target exact `f956489d0196e65dfaf1af28a56e84b71fabaf6aec3cfc67c384be0d53dfd430`, GL0/lostfalse. This NEW tape is not compared to original baseline; prior original endpoint controls apply to their own tapes only.

Pre2157/min855/post1927MiB, own page closed, Surface RELEASE. Next target is visible held.before weighting/handoff: actual material already expands more than prior screenshot. No generic RGB blur or canonical change follows from this evidence.
