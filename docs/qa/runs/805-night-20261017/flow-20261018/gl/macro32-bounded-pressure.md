# Macro32: bounded pressure component for enlarged DT (CPU READY)

NEW approximate candidate, two registry definitions exported by macro32-bounded-pressure.ts: `wgsl-macro-bounded-pressure-dt` and `wgsl-macro-bounded-pressure-dt-fine`. Only pressure term differs from physicalDtSource30/31 at t2/t4. Curl, effective pigment exchange, absorption, capacities, donor color packets, actual coherent field/upload, fast initializer and respective PACK/fine operators stay unchanged. At t1 source is literally physicalDtSource(gain,1). No old shared module changed.

## Actual head and integer bound

Head is **w + 6paper − floor((absCap−s)/4)**, not just water height. Under valid current state W0..65535, paper0..255, S0..absCap<=24512, absolute delta `dh<=73193` is a loose safe bound. Pressure q0 rounds `.35*dh*(1275−2maxPaper)/1275`, then existing donor/recipient clamps and mean-water conductance<=1 produce `0<=q1<=floor(dh/2)`. This includes dh0/1. For integer dh=2m or2m+1 the half-bound follows directly from round(.35dh); conductance rounding cannot exceed q0.

For t2 use `R(q)=floor((2*q*(dh−q)+floor(dh/2))/dh)`, t4 uses R(R(q)); dh0 returns0. This is frozen linear two-cell pressure relaxation, not an exact integration of evolving terrain/saturation/absorption/split neighbors. For q<=floor(dh/2), numerator is monotone in q, and evaluating the maximum q=floor(dh/2) proves R(q)<=floor(dh/2), including odd dh (the next integer numerator is missed by at least1). Thus pressure-only transfer cannot reverse head difference; final donor/recipient caps only reduce transfer. Half-up integer division is explicit, no floating precision. Round error per R is <=0.5 water code relative to that local rational expression; repeated composition is separately rounded, no claim exact real-exponential trajectory.

u32 intermediates: 2q<=dh<=73193; numerator <=floor(dh²/2)+floor(dh/2) =2,678,644,220 (<2^32). No widened64bit arithmetic required by WGSL. CPU test independently evaluates100k cases with BigInt and checks each intermediate bound. Existing q0 numerator dh*35*1275 also remains below2^32; pressure q1*mean<=65535². No invalid value masking/clamping is added to encode an impossible state.

## Concrete defect addressed, limited claim

Rate0, paper0, S0, absCap8192, W=[16384,0], gain3: original t1 q2150, t4 linear8600 crosses equal-head transfer8192. After original absorption t4 head difference−797, while four t1 steps retain+4812. Macro32 bounds the **pressure-only pre-absorption** transfer. Curl is intentional directional advection and may reverse total head; absorption changes W and S/head after transfer. No whole-operator monotonicity, absence of banding, TVD, or image improvement claimed.

Actual coarse phase order is H-even, V-even, H-odd, V-odd (`axis=phase%2`, `offset=phase/2`), not the fine pair's H-even,H-odd,V-even,V-odd. Noncommutativity remains; t4 has16 coarse four-phase cycles vs t1's64. Pressure correction cannot prove removal of axis/parity artifacts caused by curl/splitting/clamps. Fine4 can cosmetically soften but does not establish coarse accuracy.

## Gates

CPU4PASS:100k independent BigInt rational comparisons and valid random pressure-cell no-inversion/water/cap tests; concrete old overshoot witness; strict source reverse-transform proves all nonpressure code identical, balanced brackets and drift/reapplication rejection; actual Lite/Fine pipeline injection+pairSHA, t1 allshaders/uploads/field/dispatch equality with30/31, no retained buffers on destroy. Transitive strict/noUnused tsc0. Mock compilation is not GPU WGSL validation.

Durable macro32-gpu-cases.json has8 t4 requests: Lite/Fine4 × mini-wave, dynamic-two-strokes, through-pool, nativepooldrop; e8/c64/gain3, fine base64/gain1, both fine layouts compact. Existing matched30/31 t4 records are controls; use only same config/source/input/timing boundary, or rerun controls when not available. Actual images, full carrier repeat, all ledgers and device pair remain required; no GPU run or speed/art claim by this agent. Root owns registry/configKeys/build, with coarse keys same30 and fine keys same31.
