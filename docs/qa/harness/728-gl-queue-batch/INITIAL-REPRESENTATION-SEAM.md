# Initial display reconstruction: proposal, not implementation

Actual complete-cycle timeline: chromatic contrast threshold5 integral5759.5→23787 (4.13×) at firstmaterial while paired mass unchanged. This does not isolate transport: a delta after one carry includes reconstruction.

Source1024 live raster uses the whole-wash spacing88. SealedPreviewGlPort.initialize downsamples P/C via wcResample mode0 four taps (not area mean), leaving source unchanged. Direct display first copies retained full1024 visible raster. First preview material reads downsampled/manual reconstructed P/C and own70-tip spacing9.993758. The material shader also retains migration, paper/coverage, optical-depth prior and strength fallback. These are several independent representation changes.

## Next diagnostic (OFF, no runtime model change)

Before any carry, reconstruct manual128 from unchanged initial P/C using original88, own9.993758 and settled0. Compare retained full1024 visible SAME64 world ROI. Reuse already-owned pending1024 as draw target, restore retained visible immediately; preinput independent64 Q8 snapshots, read after idle. Keep original u_resolution1024/world/paper/binder. No material motion or coefficient change. Expected initial control can differ; report exact bytes/max/RGB radial contrast rather than forcing match.

A subsequent direct image-density transport proposal needs a separate contract. RGB is not an invertible pigment state: spectral colour, prior, coverage, original substrate, opacity and paper modulate it. Per-channel differential optical depth is visually interpretable only relative to fixed substrate and linear RGB: Dvisual(t)=Dvisible(0)+Dmaterial(t)−Dmaterial(0). At t0 identity is exact algebraically. It may need clipping where predicted transmittance exceeds substrate; clipping breaks optical-integral conservation. RGB differential density is presentation-only, never canonical P/C input; must disclose this approximation. Do not call it a physical mass-preserving inverse or tune pigment dose to compensate.

No new shader/Room wiring or hardware is authorized by this report alone. First obtain the untransported SAMEinput reconstruction comparison. Canonical source, settled endpoint, operation log and palette remain untouched.

## Existing material-field residual alternative

Production WC_RESAMPLE_FRAG mode1 (shaders.ts4034 onward) already uses base+bilinear(newLow−oldLow), with boundaryfade/clamp. A virtual high-resolution preview sampler could retain readonly original SOURCE1024 P/C and add combined transported128 minus immutable initial128, using identical paired weights. At t0 subtraction is zero, so original SOURCE sampling plus original recipe88 can match the retained shader representation; no RGB inversion or arbitrary darkness gain. This is a proposal, not exact proof: original source filtering/coordinates, shader migration and bilinear arithmetic must pass SAMEinput control.

Resources: two extra initial128Float32 snapshots=.5MiB/owner,1.5MiB/max3, rather than two full1024Float32 outputs=32MiB/owner. Additional four samplers (source1024 P/C +initial128 P/C) need capability≥12fragmentunits while fixed5/6/noise7 remain occupied. Unsupported devices failclosed. The residual can become negative where highres reference is zero but coarsecells contain paint; clamping destroys exact mass conservation and must be measured. This is presentation-only; authoritative P/C/source/history unchanged. No new code/flag allocation is implied.

## Executable initial comparator (OFF)

INITIAL_MATERIAL_PROBE=1 on existing float/finite/direct/early/multiscale/current-source-spacing/material-rebase packet, no FIELD_CARRY_PROBE. Explicit total19.203125MiB=20,135,936 bytes (19.125+0.078125). Five independent preinput64Q8 snapshots: retained visible; source1024/original88; manual128/original88; manual128/own9.993758; manual128/zero. Draw into existingownpending1024, no additional full target. Every control uses unchanged recipe/world/coverage/paper and paired initial P/C; before any carry. Retainedvisible restored in finally. Copy-only capture, 81,920 bytes read after scenario idle; source remains readonly. Timing is intentionally perturbed by four extra composite draws.

CPU comparator3/runtime9/session3 tests PASS. Shared pending/visible alias rejected; constructor borrowed alias not destroyed, rendering exception restores visible, disposed once. Computed passport includes comparator. No actual initial-equality result until allocated hardware. Root-specific qaReuse must survive narrow merge.

Restoration hardening: sixth64Q8snapshot stores AFTER full visible1024.copyTo(pending). Total snapshot96KiB, total19.21875MiB=20,152,320 bytes. Read-after-idle retainedROI versus restoredROI SHA/bytes must agree. This ROI measurement does not prove everyfull1024pixel; actual full1024copy path and distinctidentity validated separately. All six snapshots are independent; none is used as restoration source.

## Actual Surface initial comparator: decisive

HEAD23d858c0, raw owner-water-dab-initial-comparison-surface.json; owncontextclosed/post1986MiB/min863. Source1024/original88 equals retainedvisible EXACT (0bytes/max0); manual128/original88 changes6920bytes/max33; manual128/own9.99 changes7434/max154; manual128/zero changes6330/max155. RestoredvisibleROI EXACT. All initial controls BEFORE any carry; identical worldROI/fullrecipe/substrate and unchanged source. This isolates both lowresolution reconstruction and smoothing change as display seams. Original1024 recomposition matching retained eliminates substrate/profile mismatch as explanation in this ROI.

SameSHA retained/source-original/restored ff6f5de7aaea4c9c3da95e901e81e9e9665a21246c04a1d0c04be287c676b85f. Q8read96KiB, GL0/no loss. Internal DryUndoRedo exact ad42fe47beaa6cfe95a40ae304e4a899a262a2292a63b4cabb670bfae1d0dcba; original SAMEnewtape endpoint remainsOPEN. Saved tapeSHA 531adf53bdefc28a4f684136270dfef17f9abffddaadce8c37775b63ad853831. PNGs temp/device-runs/initial-material-{retained-visible,source-original,manual-original,manual-own,manual-zero,restored-visible}.png encode actual64RGBAreadback, rowfliponly. Noartistclaim. Next OFF residual prototype is justified; no dose/mass increase.
