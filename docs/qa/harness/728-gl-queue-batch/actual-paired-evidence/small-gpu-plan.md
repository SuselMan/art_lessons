# Small positive paired GPU candidate (review, no hardware execution yet)

Default OFF, isolated diagnostic GL context only. No canonical/engine imports or changes. Existing captured owner2 source P/C, pressure/path/wet/oldP hashes are fetched and verified; packed commands SHA checked. Original capture lifecycle FAIL remains explicitly recorded.

128² five RGBA32F textures: P/C ping-pong + common donor fractions. Exactly 1,310,720 resident texture bytes (1.25 MiB), plus small shader/quad objects and browser context overhead (not included). Requires OES_texture_float, WEBGL_color_buffer_float, highp precision≥23, and all five FBOs complete. Unsupported -> FAIL, never Q8 fallback.

Source Q8 /255 is rounded to Float32 for upload; t0 compares GPU readback against this exact Float32 encoding, not rational Float64 and not the original full Grafetto pixels. First actual captured stride1 remains hop8 world pixels. Shared donor fractions quantized to Float32, must have outgoing sum≤1−1e−6 and no boundary exit. No clamp, normalization or residual subtraction.

Two draws use same OLD fields. Each channel: old_i*(1−sum donor_i) + four old_neighbor*opposite donor_neighbor. Four-neighbor gather reads 10 vec4 textures per pixel per P/C draw. Rough lower traffic 5 MiB reads + .5 MiB writes per step, not measured or a speed claim.

Runnable `runActualPositivePairedGpu(gl,{enabled:true})`: exact t0, one-step CPU comparison with rounded input/fractions, positivity/finite/changed/mass gates, known-idle finally disposal. No live user UI yet. A future bounded animation may replay at most24 steps with these same frozen fractions, explicitly different from evolving pressure/front/path; no canonical endpoint or 2-second duration proof. This gate first establishes moment transport correctness before adding a local optical diagnostic display or engine integration.

CPU tests only: OFF/no GL calls, budget/support rejection, source Float32 encoding, finite/margin/boundary rejection. Shader has 2 samplers and no loops, derivatives, dynamic indexing, paper or material branch. Actual Float32 support/compilation and runtime equality remain untested until an allocated device run.
