---
layer: screens
summary: песочница акварели WebGPU
issues: [728]
tags: [диагностика, акварель]
---
# WatercolorGpuPoc

Dev-only interactive WebGPU proof of concept. The page owns its private solver,
input journal, replay and optional WebGL comparison. It never joins a room or
writes operations to the server. Unsupported WebGPU is reported explicitly.
The route is only declared in development builds.
