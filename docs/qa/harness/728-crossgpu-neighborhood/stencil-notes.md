# Residual fringe994,1231: capture footprint

This is the inherited crossGPU alpha50→126 fringe at waterseq64/pigmentseq65,
not target61's closed pale ring. Clean density-gate fix is already enabled.
Current existing 5×5 center capture alone cannot establish equal inputs to a
stride32/64 diffuse step: its eight donor samples can lie far outside that ROI.

`stencil.mjs` uses actual pass arguments x0/y0/S/w/h/radius/knight, exactly
matching diffuseStep uniforms: q=max(1,round(radius/S)); axes/diagonals or
knight(2,1) directions in production order. Center GLcell for world pixel(x,y)
is floor((x+.5-x0)/S), h−1−floor((y+.5-y0)/S). A tap outsidefield is dry and
must not be captured as clamp-to-edge material. Nine centers plus optional
5×5 neighborhoods total<=225 RGBA pixels per source, clipped/deduplicated.
Capture ink, coverage, solvent if actually bound, and paper-height provenance
at ALL actual donors before interpreting a first output divergence.

PaperUV=(cell+.5+[x0/S,−(y0/S+h)])/[paperW/S,paperH/S]*paperScale.
2048² LA texel footprint uses floor(UV*2048−.5) and REPEAT wrapping; retain
four height bytes plus bilinear fractions. CPU bilinear is intended sampling,
not actual GPU interpolation. Sampler parameters remain actual passive proof.
No numeric actualfield origin may be guessed from A2size alone.

External texImage2D/texSubImage2D provenance should capture existing upload
arguments width/height/format/type, texture identity, target, actual typed view
byteOffset/byteLength and exact-viewSHA BEFORE slot release. Do not hash entire
backing buffers or dereference ArrayBuffer after worker transfer. Image-source
uploads must record explicit source kind/size and remain unknown if bytes are
not owned; never claim upload equality from dimensions alone. Source record
must bind to actual current texture/program/operator, not mutable latestjob.
The added helper describes views without copies or GPU queries; installing an
upload observer and shader-height output probe remains a separate GPU gate.
