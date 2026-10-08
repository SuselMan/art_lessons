# OFF preview composite sampler map

Read-only `728-solvent-init` shaders.ts; canonicalprogram untouched. Allpositions are source lines, not hardwarecalltrace.

| Function/path | Source | Literal material fetches | Manual4tap equivalent |
|---|---|---:|---:|
| wcInkAvg |1087–1101|13 P|52 P|
| wcTransportField |1202–1206|4 P|16 P|
| central unsmoothed ink |1589|1 P|4 P|
| central depth |1600|1 C|4 C|
| thinPrior localDepth |1628–1631|4 C|16 C|
| debug rawInk |2222|1 P|4 P|
| marker branch (unrelated) |2602|1 P|leave literal|

Spread wcRingAvg reads **coverage**, notP/C; keep readonlyFULLcoverage/NEAREST literal. Paper/noise/original/masks likewise unchanged. wcFlux (`1240`) calls wcTransportField on neighbourUV; main migration (`1980–2009`) calls12flux+onecentre:52P fetch beforemanual,208P aftermanual, plus52P wcInkAvg ifsmoothing. This is dynamicupperpath count, not allpixels/allprofiles cost. Migration0 skips the52original/208manual path. thinPrior>0 controls extra4C/16C. Main central sampling branch is either13P smoothing or1P unsmoothed, notboth. Debug conditional addsrawInk. No speedclaim.

Shared wrapper proposal: `previewReadP(uv)`/`previewReadC(uv)` bothuse **same** `previewFootprint(uv,u_previewSize)` math/texelcentres/weights. Calls that onlyneedP should fetch4P, **not8P+C**; genericpaired8fetchroutine unnecessaryfor wcInkAvg/P-onlymigration. At sameUV pairreconstructionmust produce identicalfootprint; source sampler binding identifiescompletedfront P/C. Bilinearbeforeexisting2xscale/averaging/depthprior/ratio; do not interpolate resulting RGB/tau.

Replace precisely listedP/Ctexturecalls in clonedOFFpreviewprogram. Leave allu_inkLoad readsmarker branch2602 literal unlessprogram is hard-specializedcompositeonly. Constantcompilerdeadbranchnotguaranteed; use deterministicreplacementanchors/counts/hash and rejectunexpectedsource drift. Expectedwatercolourscope19P+5Cstaticsites, wholeDABhas20P+5C includingmarker. Numericexpressions/fullsourcepaper unaffected. Uniformu_previewSize128² alwaysset forOFFprogram; canonicaloriginalprogram neverreceivesnewuniform/options. Within thinPrior eachoffset±2/u_resolution mustpasswrapper too. wcTransportFieldradiusUV and inkAvgall13offsets mustpasswrapper, otherwise sampledfootprintdepends onsubpath.

Runtime overhead/source risk: totalDABsource measuredinpacket below; fourfetchhelper+wrapper adds source and actualcompilerinlining may multiplyinstructions. ParentpreviousAdrenocompilerSIGSEGVwas complexshader size; no claim that this newfragmentcompilessafelythere. Guard freshdeviceallocation/uniquesaltcompile/programlinkvalidation/contextloss; **Samsung not used by this audit**. Prefer preview-onlyhardcompositeprogram ifactualsize/latencyneeds, but that is a separate semantic-specializationreview; don'tpruneproductionbranchesblindly.

Required negative fixture: scanner confirms no leftoverlistedliteralP/Ccalls inpreviewwatercolourscope; canonicalsourcehasunchangedSHA; shaderpasspairfront/epochexact; callconstant/affine/edgeinputs; localDepth/wcInkAvg migration path controlledON/OFF separately; actualshaderERRORS andfinitepixels. Sourcebyte/fetchcountsalonecannotboundGPUtime/drivercompilerresources.

Measured literalDAB UTF8bytes=137374, staticP=20, staticC=5. Source delta for implementedwrapper must be recorded by GPUagent actualbuilder, not estimated here.
