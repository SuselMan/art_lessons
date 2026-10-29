# Same-storage copyTo: actual Samsung byte gate

Production source **4a85d391b** changes only the copy storage operation from
`copyTexImage2D` to `copyTexSubImage2D`, with distinct-buffer, same-context,
same-dimension and encoding guards before GL work, and framebuffer unbinding in
finally. This receipt tests actual WebGL1 copies, not a CPU simulation.

On 2026-10-30 Samsung SM-T970 / Adreno 650 / Chrome 155, the current class was
bundled alongside the frozen class from **1abd3bb02**, in the same context.
Five dimensions (1x1, 3x5, 8x4, 17x16, 32x32) cover odd, even, POT and NPOT.
Each runs PM-valid nonuniform bytes (RGB <= alpha) and arbitrary straight bytes
including hidden RGB; each current destination is copied five times. All ten
current/old raw-byte comparisons are **exact, wrong bytes 0**; source bytes remain
unchanged. No rounding tolerance is used. This local buffer operation has no world
origin, so negative world placement is outside this unit.

Warm copies issue no texImage2D, copyTexImage2D, texture creation or framebuffer
creation. Destination minification filter returns to its base filter after copy;
POT PM mip chains regenerate once after invalidation, while NPOT and straight
buffers do not generate illegal mip chains. Self-copy, wrong dimensions, encoding
mismatch and foreign-context metadata reject without instrumented GL calls.
An injected copyTexSubImage2D exception leaves framebuffer binding null. This is
copyTo's existing postcondition, not a promise to restore arbitrary caller state.
GL errors [], remaining owned textures/framebuffers 0. Own child/context and ADB
forward were removed; original three tabs and parent foreground restored.

Private reproducible files under
`temp/device-runs/krita-stroke-20261024/fixes-v52/`:
`run-copy-buffer.mts`, `copy-buffer-body.js`, `copy-buffer-prepared.json`,
`copy-buffer-device-result.json`, `copy-buffer-device-cleanup.json`,
`copy-buffer-final-targets.json`, `copy-buffer-run.log`.

- Current buffer source SHA256:
  `4ce5c3c218a1625a7c70fa7869f126a2d10350f35aedb32c2fe4c5b0abf1bd4f`
- Same-context current/old bundle SHA256:
  `d2156159f059a9dce207bc86975483affc3e59bf0ddc3cf1f4566ea957dac46d`
- Final proof body SHA256:
  `2eb6d41ae647de8a4c73f2b4fcd7dce22cace67b5c3e26fb1016a71ebc7fdba2`

This finite device receipt does not claim complete application, browser, device,
canonical journal or native Krita compatibility. It introduces no renderer hook,
room activation or additional runtime. No temporary bundle directory was created.
