# Record headroom: composite/deposition audit

Read-only source audit, s=0.25. No GPU verification, no source changes.

## Exact change of units

Let encoded deposit E=s*M and optical record C=s*(D/4,m). All four channels must scale together. Coverage is a separate geometry/contact record and remains unchanged. Decode mass/depth at the watercolor composite boundary by 1/s. Then D/m, water/m, pigment/m are unchanged, and physical density, .004 thresholds, WC_DEPTH_THIN=.12 (both threshold and prior amplitude), WC_MIGRATE_FULL=.74, saturation uniform and densityK=.54 keep their existing units. WC_DEPTH_SCALE=4 remains unchanged: it packs optical RGB relative to mass alpha, not overall mass units.

Necessary watercolor-only composite reads: wcInkAvg return; wcTransportField averaged a; direct ink fallback; direct depth; rawInk debug. Averaging and scaling commute. Do not decode marker u_inkLoad branch or coverage/image-alpha thresholds. Debug rawInk .002 threshold stays physical after decoding; rawCov .002 remains geometric.

If decoding is omitted, all physical mass constants must scale s: .004→.001, thin=.12→.03, prior amplitude s, full/saturateInk s, densityK s; moved mass and denominator eps must also be encoded. A partial change gives different colors and mobility, not a unit conversion.

## Deposition before RGBA8

RIBBON_FRAG deposit RGB is cov*v_inkWater/Wet/absStrength*mottle, alpha is amount=(cov*v_ink*mottle)*tip. Scaling amount alone misses RGB. Scale the complete deposit vec4 and complete depth vec4, only in ink/depth branches. Leave coverage vec4 untouched. Existing tip asymmetry between RGB and alpha is not corrected by this diagnostic.

DAB_FRAG depth: vec4(amount*u_inkStrength*u_tau/4, amount*u_inkStrength). Deposit: vec4(amount*u_inkWater,amount*u_paperWet,amount*u_inkStrength,amount). Scale both complete vectors. Shared shader source deposition also serves other tools, so watercolor gate/profile isolation is required; globally scaling mode7 breaks marker records.

No explicit min(amount,1) or clamp(amount,0,1) found in final ribbon/nib deposition expressions. cov/depth are bounded contact geometry; bristle/contact and normalized pigment/water parameters are intentional brush/contact inputs. RibbonStrokePainter film dose has no final CPU cap; markerRibbon stores ink and ink*water/wet/strength without mass min1. Thus observed channel B=255 is consistent with RGBA8 final-write clipping; this audit cannot prove its full causal history without source draw probe.

## What 3–6 runtime patches can and cannot do

Possible as a diagnostic: two large exact shader deposition snippets plus watercolor helper/read snippets (about five composite read sites), paired with candidate agent's physical-field unit audit. Existing shared mode7 tool routing prevents a safe unconditional two-line production change; use an existing watercolor-only discriminator if proven, otherwise a new profile/uniform boundary is needed. No new offscreen texture is required merely for fixed-scale headroom.

RGBA8 physical ceiling rises from1 to4 while quantization worsens from1/255 to4/255. MAX(s*a,s*b)=s*MAX(a,b), and ADD sums commute with scale before clipping, but MAX is still not cumulative deposition: no unit conversion restores overlapping contributions discarded by MAX. Fresh rendering is mandatory: scaling a previously clipped texture cannot recover missing mass. New headroom can still clip at mass4 or optical channel D/4>4. Stronger dynamic range plus old low-mass resolution needs a different record format or multi-range/offscreen representation.

Source ratio identity is exact only in real arithmetic and before clipping. RGBA8 cannot preserve every old low-tone code under s=.25; thinPrior helps hue fallback but does not recover sub-code mass. Color alpha must be scaled with its RGB; pigment deposit alpha/R/G/B must be scaled together. Independent channel clipping already corrupts ratios, so decoding may reveal legitimately different color where the original was clipped.

## Promotion/cache boundary

The fresh-engine diagnostic is safe only when every physical/depth record is produced with the same new scale. Restored live-wash buffers, cached physical fields, and checkpoints containing such fields cannot be consumed as new-encoding records. Pixel-only raster checkpoints retain their image meaning, but bypass clean re-rendering and cannot validate new-source parity. Mixing old/new clients gives different replay pixels even if operation dabs are unchanged. Before promotion, enumerate persistent snapshot payloads: invalidate/replay physical records with an encoding-version or cache epoch, rebuild active washes from operations, and force all participating clients onto a compatible renderer. This is cache-format correctness, distinct from retaining old engine versions for rooms. No invalidation is implemented by this audit.
