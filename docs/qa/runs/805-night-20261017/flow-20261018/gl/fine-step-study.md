# Bounded fine-step study: CPU proposal, not GPU/art ranking

Same saved actual Mini common input64² paper patch x480/y480 as macro23 analysis. Initial carrier uniform RGBA16=[24000,12000,4000,30000], all wet/free capacity65535; actual finePair, H-even/H-odd/V-even/V-odd phases. Nine combinations affinityBase32/64/128 × fineSteps4/8/12, gain1; largest affinity191 (<=192). One neutral fine0 reference. Exact all4 integer sums, premul and capacity pass each row. Twelve-phase output agrees byte-for-byte with the existing macro23 CPU oracle. This isolates the fine operator; it does not include spatially varying actual coarse M/D, literal dry boundaries, final reconstruction, or true-coherent coarse dynamics.

Descriptive alpha residual RMS/mean and correlation with paper high-pass, existing fixed radius2/radius4 masks. No native-fitting target or art score; negative correlation follows receiver affinity favoring low paper values and is not validation of paper physics.

| Base | Phases | RMS radius2 | Corr radius2 | RMS radius4 |
|---:|---:|---:|---:|---:|
|32|4|.05111|-.90746|.05084|
|32|8|.07821|-.93566|.07790|
|32|12|.09383|-.95398|.09371|
|64|4|.03345|-.90786|.03328|
|64|8|.05119|-.93650|.05099|
|64|12|.06143|-.95546|.06137|
|128|4|.01984|-.90456|.01976|
|128|8|.03034|-.93634|.03022|
|128|12|.03642|-.95402|.03636|

Neutral has RMS0/correlation null. Base64/fine4 gives92% of base128/fine12 RMS on this uniform witness, but weaker absolute correlation and a different spatial pattern/horizon. Base32/fine4 approximately matches base64/fine8 RMS. These are plausible image-review controls, not equivalent images and not a proof of3x end-to-end speed: only fine dispatch count is3x smaller, other stages remain. Actual reported RMS~.026 is from a different, nonuniform full-image diagnostic and cannot be compared as the same measurement.

Full optional GPU plan is27 requests (nine configs × mini-wave/sheet3slot1/sheet12slot1), `wgsl-macro-true-coherent-fine`, steps256/mobility3/eddy16/curl128/dither1/compactAux+Carrier true, repeats3, raw export. Prepared private registered cache file functional-fine-step-study-cases.json. No GPU run here. Root can first shortlist base64/fine4, base128/fine8 and base128/fine12 on the same three scenes (nine requests) before authorizing all27; this shortlist tests this hypothesis without claiming a quality winner. CPU report fine-step-study.json contains source input/patch SHA, all channel totals, two-radius descriptors and carrier hashes. Test2PASS includes nine exact-mass cases, existing oracle parity and27 unique requests.
