Cached marker candidate is prepared on VPS, not copied to house runtime yet.
Wait for /root GPU slot; no Samsung/5290/production changes.
Current branch HEAD65221b79 plus uncommitted candidate in WatercolorPasses,
WatercolorSettlePlan, shaders, tests, and report.

After slot:
1. rsync three runtime .ts files preserving relative paths and render.mjs,
   check_gpu_marker.py to own house mirror680-spiral-spread only.
2. Run SPIRAL_BASELINE_ONLY=1 SPIRAL_MARKER_AB=1 DISPLAY=:0 node22
   temp/spiral/render.mjs temp/spiral/marker-resweep.
3. rsync output back; analyze.py; check_gpu_marker.py. Verify initial
   pre-front/pre-carry/cost byte equality pairwise; blob PNG same.
4. If candidate valid, run rebuild.mjs original cases (candidate enabled)
   temp/spiral/marker-rebuild and verify both same=true/GL0.
5. Report/review results; leave own5292 alive, Chrome closed; no push.

Latest CPU tests22 total, typecheck/lint/map pass. Extra poolbuffers max18MiB,
9MiB live duringcarry; resource cleanup normal/cancel/contextrestore audited.
Standalone markerGLSL1163bytes, common carrytemplate growth181bytes.
CPU estimate13.88M markerfetch for spiral,5.45M blob (logical, not GPUtimes).
GPU runtime5292 currently59b1f704 (no marker candidate).
