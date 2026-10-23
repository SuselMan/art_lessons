# Actual composite derivative, not a new optics candidate

For a single pigment, neutral dry modulation and full coverage on white:
R_c(m)=1-vOpacity*(1-exp(-k*m))*(1-paint_c), k=(1+1.2*darkness^4)/.54.
Derivative magnitude=vOpacity*(1-paint_c)*k*exp(-k*m).
The paired source correction/headroom2 does not remove this legacy swatch floor. Tau ratio makes paint independent of mass for single pigment; thinPrior below.12 tends toward the same batch tau, so it is not the large-core flattening mechanism.

9 measured PREbrush A codes37/75/114/157 decode to masses.290/.588/.894/1.231 if B/A1. Derived slope fractions of the dilute limit are .499/.245/.118/.0525. Optical contrast compression is therefore real even without mass255 clipping. A physical quantum2/255 changes RGB codes by [2.32,1.58,.55] at p10, [1.14,.77,.27] median, [.55,.37,.13] p90, [.24,.17,.06] p99. Fine blue-channel mass fluctuations are subcode at all these levels.

This does not erase all large structure: p10→p90 predicts roughly94 red,64 green,22 blue output-code difference, while p90→p99 predicts16/11/4. If final images look uniform throughout p10→p90 areas, transfer derivative alone is insufficient: spatial arrangement, composite transport/averaging, coverage and paper modulation need checking. The percentile table is carrierA; actual B/A must be checked before calling it pigment mass. 6 derivative table uses same mass axis and its actual swatch, NOT measured6 percentiles.

Other suppression paths: u_inkSmoothPx invokes averaged ink; final settle passes0 smoothing. u_migrate can additionally recount deposit in composite from wcTransportField/wcFlux, so exact final captured uniforms matter; derivative above holds with migration disabled or holding its effective mass fixed. gran and paperMod multiply alpha; when final pigment clamp reaches1 derivative becomes0. In singlepaint dry body, tau depth quantization can modulate colour locally but is not intended mesostructure. No new source/noise/optics spec generated. Existing optics85/reference/KM experiments already targeted this floor; this audit supplies sensitivity measurements, not renamed repetitions.
