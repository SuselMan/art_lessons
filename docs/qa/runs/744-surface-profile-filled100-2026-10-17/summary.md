# Original100 on native Surface: GPU query profile and filled room re-entry

Runtime81eb5d04, flagsOFF/OFF. Exact input SPEC `f73f6115c900e070ee3cf4b8d5c64f3849a531dd33d36ca56b78415b729728e4`. Actual WebGL1EXT query supported, disjointfalse,8192draws/6964queries, zero missing/unmeasured. Target0diff against independent full replay.

| Exact shader label | Draws | Query ms | Share of query sum |
|---|---:|---:|---:|
| DAB_FRAG | 793 | 296.823 | 34.93% |
| PuddlePresentation.INPUT | 99 | 165.464 | 19.47% |
| DAB_FRAG native-nib mode6 depth0 | 693 | 68.157 | 8.02% |
| RIBBON_FRAG | 2178 | 64.034 | 7.54% |
| DAB_FRAG native-nib mode7 depth0 | 1386 | 55.269 | 6.50% |
| WC_WATER_FRONT_FRAG | 28 | 32.909 | 3.87% |
| WC_FIELD_ADD_FRAG | 2119 | 29.906 | 3.52% |
| WC_FIELD_OP_FRAG | 722 | 28.964 | 3.41% |

Sum849.718ms is instrumented GPU-query elapsed, not whole-frame/wall time. Markers, submission bubbles and concurrent peer GPU context impose overhead. No speedup claim.

Filled100-stroke+Dry+Undo room re-entry passed4cases with exact canonical target. Normal fresh/reload UI ready3609/3521ms; review fresh/re-entry full-engine UI ready3650/3597ms. All carry snapshotSeq101, tailOperations102, layers2. UI timer stages and navigation wall kept separately. Actual review image1024² was latched with annotationMode/earlyHistorytrue before normal hydration. These UI-ready times are not firstpreview interactivity.

Next safe probe: count shared DAB_FRAG draws by host.render callsite/raw/next/goal destination and fullframe extent, then test hiddenOFF/ON same input for removed INPUT99/shared-composite calls with exact target/material equality. Do not change shader math, merge deposits or roundings.

All3ownedrooms deleted by exact owner API; auth removed, owncontexts closed; shared Surface tunnel retained by QA. Registered rawcache cleanup is requested separately.
