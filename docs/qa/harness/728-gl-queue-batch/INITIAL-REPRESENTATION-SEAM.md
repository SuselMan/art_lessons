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
