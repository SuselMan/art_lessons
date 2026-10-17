# Local hydraulic pairs + bounded fine residual

Standalone `macro3-index.ts` exports `macro3-local-hydraulic-residual`; frozen macro1/macro2 and old registry untouched. Config1:128quanta,mobile.8; config2:256quanta,mobile1. Bothdt.35,localdiffusion.25,terrain.1. Whole field128² (8pxphysicalcell), LOCAL alternatingx/y/parity pairs only, no displaced brush copies.3coarse draws perquantum +ONE1024fine reconstruction =385/769draws;13coarseRGBA8 +2fineRGBA8 ≈8.8125MiB. Eightfine samplers (WebGL1minimum8). Many draw calls can costCPU; no claim768draws is fast before measurement.

## What physically changes / what does not

Water pressure proxy is integer W16 + gain·paperByte. Each adjacent pair exchanges water toward smaller head with damped coefficient/permeability, donor≤80% and receivercapacity4. Pigment follows accepted water fraction; additional local symmetric pigment diffusion accounts for mixing in equilibrium water. All channels use the same accepted alpha transfer and a proportional donor color. No arbitrary noise velocity, no evaporation-driven edge sink, no postmultiplied rim. Flatuniformwet/paper has zero directedwaterflow; only pigmentdiffusion spreads it. Directed head motion is distinct from capillary-layer shape evolution: wetdomain is fixed, not expanded. Initial fixed share is our only deposition; this is NOT full shallow-water CFD/Curtis simulation.

Primary context: [Curtis etal1997](https://grail.cs.washington.edu/wp-content/uploads/2015/08/curtis-1997-cgw.pdf),§4.3–4.6 separates water flow, conservative pigment redistribution, deposition and capillary wetting. It associates edge accumulation with a drying-driven pressure sink, not generic flatwet flow. [VanLaerhoven etal2004](https://www.cs.ucf.edu/courses/cap6105/fall09/readings/watercolor_sim.pdf) separates shallow/pigment/absorbed-water layers and uses bounded water updates; its distributed CPU performance is not evidence for this GPU prototype.

## Exact pair mechanism

Codes are16bit integers packed intoRGBA8 pairs. Water transfer and pigment transfer are computed from identical canonical donor/receiver values at both endpoints. Diffusion transfer uses sign(delta)·round(abs(delta)·rate); water-driven alpha transfer is bounded by donor alpha and receiverfree(cap−oldalpha), RGB transfer is proportional to acceptedalpha. One integer amount is subtracted at donor and added at receiver; no gather-only row normalization. Capacity bounds pigment alpha by mobileFraction. Pair splitting avoids simultaneousmulti-neighbour free-capacity circular assumptions. GPU sampler/FP consistency is still device-gated; CPU double proves the algorithm, not portable shader equality.

## Fine detail / no v13 masked-delta mass loss

Each8×8cell has raw extrema and minimum premul margins. Fine output=(1−f)raw +finalMobileMean +k_cell·(f·raw−initialMobileMean). ONE commonk∈[0,1] is chosen for allpixels/allchannels, limited by extrema so nonnegative/≤1/premul hold. Sum residual iszero in ideal arithmetic, so finecell pigment mass equals fixedrawsum+64·finalMobileMean. Highfrequency detail remains where there is material to support it; otherwise k falls instead of clipping negative detail. Initial/final packed16 mean and finalUNORM8 still cause rounding drift, measured externally.

A coarsecell is admitted only if ALL64raw water bytes>0, not its center. If any dry pixel exists, BOTH hydraulic/diffusion faces touching that cell are disabled, and fine reconstruction returns EVERYoriginalpixel in that cell literally. Partialwet material is retained, never omitted or emitted acrossbarriers. This excludes an8px boundary band conservatively and can visibly slow narrow wet paths. No interpolationfootprint mask removes donor mass.

## CPU evidence / limits

50000random hydraulicpairs: water and4pigment code sums exact, positive/capacity/premul preserved.3000bounded-residual cells (f.8 and1): mass error≤4.3e-14, outputbounds/premul, unchangedcellidentity. Actual1024input helper checks fine1pxbarriers across4grid phases. Ideal fullywet localdiffusion impulse128/256quanta gives RMS53.51/75.95px,41.6%/65.4% mobilemass≥50px. Separate diffusion0pressuretest shifts pigmentcentroid21.90px, conservingcodes: genuine directional transport, not just color blur. These small CPU experiments do not guarantee imagequality or50px travel on allcapturedwetnessfields.

Negative: spatially-varying semi-Lagrangian gather can map all3outputs toonesource, multiplyingmass1→3; checking only backtrace endpoints can jumpdrywalls. Capacity from proposed-but-rejected outgoing traffic is also unsafe. This prototype instead uses local disjoint pairs and accepted integer transfers.

Actual-source FakeGL allconfigs lifecycle/passledger/repeatedrun/teardown and strict/noUnusedTS checks required. FakeGL is not GLSL execution. Device gates: drybyteidentity,1pxvertical/diagonalbarriers includingpartialwetcells, zero pigment, true repeat/mass/premul, canonicaltransport/twocolormix, capturedwash/prewet images. Strongmobile1 preset intentionally removes fixed original-circle reserve; bounded residual still retains supported fine detail. Fine8pxcell steps or axisdiffusion may remain: inspect images before claiming organic flow. No GPU/process/services/dependency copies created by author.
