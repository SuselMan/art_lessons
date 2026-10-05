# #680: actual settle domain composite — causal QA

Source branch agents/680-composite-domain, base release142cc729. Candidate d413980b (default-off proof), final1e49aa99 (unconditional final+progressive). Publicaccepted5301/c199gallery unchanged; production publication is root's separate action.

## Technical change

WatercolorSettlePlan already writes existing fields over padded/clipped/capped domain x0/y0/x1/y1. It now returns that current-job metadata as compositeDomain, unioned with source bounds to retain original stroke pixels when field cap applies. No new pad, no source/solver operator, no shader or pigment/water parameter changes. History storage union is not used.

PencilEngine uses that same domain for final resident-target resolution, final quad/damage marking, and progressive pending composite. Actual solver domain is bounded by resident targets supplied to this job; revealCopies are owned for those existing targets. Domains outside those tiles cannot have been written by this job. No new full-history scratch import/texture allocation.

## Causal frozen-material off/on on actual sheet3 №4

Identical packed operations x-GtWsMU7h,p_kZxjdEcl,9zCyVB-YfN appended into clean samewash on Vega5318. This reproduces latest slot4 water+pigment geometry, not every earlier wash/history on the full board. Captured bounded world ROI[920,1080,1240,1340] across two resident tiles; all postsolver coverage/P/C/V/inkDry/colorDry field hashes exactly equal off/on. Missing foreignSolvent is expected because these exact three gestures share a wash.

Old target bounds[967.640,1121.090,1153.299,1237.242], rasterquad floor−1/ceil+1 gives top1120/bottom1239/rightlimit1155. Actual current-job domain[743,1024,1378,1462]. Before compositing, **3302 inkDry pixels outside old quad** (248+3054 across two tiles), alpha/strengthsum8517, with matching optical colorDry support. Final canonical PNG changes exactly3302pixels, all outside the old quad; inside0changed. Raw RGBA maxdifference127 (includes low-alpha RGB), not a statement about visible luminance. No core blur/darkness tuning.

Matched image `temp/clip/out/compare.png`: leftold/rightfixed. Bottom and right rectangular cuts disappear into the existing material fringe. Top remains relatively straight and the old pale ring remains: not claiming all four visual problems fixed. Those boundaries need separate material/operator diagnosis.

Negative tiny control: large clearwater dab→small pigment dab, same accepted material tuple. No dry material outside old quad; off/on PNG exact0pixels/max0. All captured fields exact; four off/on scenes GL0/context intact. This guards against inventing paint by widening an empty domain.

## Final unconditional live/native lifecycle

Fresh native water120round→pigment24round normal100:15, pressure0.7. Progressive draws7captured frames use exact job domain ([0,0,470,470] then[0,0,457,437]), not source AABB. Dry request then undo/redo and full rebuild: GL[0,0,0,0,0], context intact, undo/redo accepted; native canonicalPNG==redoPNG==fullrebuildPNG **exact**. This is short standalone engine QA, not multi-peer UI/performance proof. Samsung cold actual-device check still belongs to root before release.

CPU WatercolorSettlePlan+index.watercolor tests93/93PASS, maxWorkers1/testTimeout15000. Actual `npm run typecheck --workspace @grafetto/web` PASS. New unit test proves returned current-job domain ignores a prior large lifetime storage union and leaves input source geometry unchanged.

## Artifacts and runtime

Isolated home5318 frozen source1e49aa99, automatic production accepted defaults, no review env flags or console tuple override. Bounded source/quad records `temp/clip/out/{actual,tiny}-{false,true}.json`, original/fixed PNGs/summary. Native `temp/clip/live/report.json`, before/after/rebuiltPNG. Harnesses `temp/clip/ab.mjs`,live.mjs; both close owned Chrome in finally. No hardware browser remains; GPU slot released to root.

Full board re-render, additional tiles/foreignreservoir, multi-peer and memory/performance remain release QA. Oldc199baseline should stay in gallery for comparison. No blanket halo/falloff padding and no A/B/H/R/conductivity candidates are part of this fix.
