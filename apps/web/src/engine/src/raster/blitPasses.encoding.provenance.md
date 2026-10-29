# Straight source resampling into premultiplied presentation

The existing `BlitPasses.transform` and `areaTransform` programs share
`TILE_BILINEAR`. They now set `u_sourceStraight` from the source buffer's immutable
pixel encoding on EVERY draw, including the PM control after a straight source.
A straight source tap is premultiplied before the four-tap bilinear interpolation.
Outside-tile taps remain zero so additive stitching still sums one filter kernel.
Mask coverage is applied to that premultiplied sample exactly where it was before.
The premultiplied branch retains the original sample/interpolation expressions.

This is display/export resampling, not Krita canonical brush compositing or a
straight destination writer. Output remains premultiplied; hidden RGB is discarded
only in the derived output. Canonical straight source pixels are never rewritten.
Existing straight room activation remains closed. The common LayerCompositor's
hardware mip/coarse/display paths still require their explicit presentation
adapter; this change does not claim the whole display path is ready. Owned-buffer
display branches now reject raw straight sources instead of silently using PM
blending, and coarse downsampling rejects straight inputs/outputs before GL or
mipmap work. A derived PM raster can still use the existing presentation route.

No new shader program, VBO, texture, framebuffer, cache, quota or runtime is added.
The source is still point sampled only during the pass. A draw exception now
restores its sampling mode and closes the pass's blend/FBO lifetime in finally.
These passes retain their existing successful GL-state contract; they are not
full caller-state journals and do not add per-draw getParameter queries.

Host tests cover straight-to-PM flag selection/reset, no uploads, both resampling
entry points, and cleanup after a draw failure. Existing tiled-transform seam
contract tests and shader regression tests pass. MockGL does not numerically
execute the new bilinear conversion, so these results do not prove GPU pixels.
A separate actual Samsung production-BlitPasses gate is required, including
nonuniform hidden-RGB/half-texel cases and PM byte comparison against the original
shader. No actual GPU or cross-device claim is made by this source change alone.
