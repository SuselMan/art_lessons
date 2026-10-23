# Native size80 baseline, 2026-10-06 UTC

Actual AMD Radeon Graphics (radeonsi renoir ACO), ANGLE OpenGL4.6; Chrome154, A2 landscape3508×2480, source manifest f99d43ea, accepted9flags exact. Synthetic native PointerInput pen/coalesced samples, not OS/photon latency; no readPixels/gl.finish during timing.

Densezigzag8legs×300ms: active p95/max22.3ms,0frames>33ms; post-Up solveridle15.42s and revealidle24.14s, post-Up max33.4ms(1frame). First submission3.1ms/display9.2ms; handlermax23.1ms. GL0, canonical transparentnonempty865samplepx.

Purewater8legs×300ms: active p95 22.3/max22.4ms,0frames>33ms; solveridle15.62s/revealidle24.33s, all post-Upframesmax22.3ms. Handlermax16.6ms, wetcellspositive/stroke1, canonicaltransparent0alpha expected, GL0.

Waterthenpigment original8legs run hit120s Node watchdog and ownedChromeclosed; no complete metrics were returned. Keep as unexplained timeout, not proven forced-down stall. Diagnostic2legs+single8legs repeat both completed GL0/nonempty.2legs pending307 complete7.3ms,8legs pending987 complete14.6ms.8legs handlermax20.8ms; pigmentphase one133.3ms rAF spike(2frames>33,1>100); all laterphase max22.3ms. Solveridle1.10s/revealidle9.82s.153nonzero recordedwetcontacts, both gestures samewash. This is not foreignwash importbenchmark or equalvolume comparison.

Further burst result pending.


Relative rate caveat: baseline rAF16.7ms ≈60Hz vs active22.2ms ≈45Hz;0frames>33ms does not mean60FPS. Active rate is25% below measured idlebaseline. Longtasks>200 none does not mean all longtasks/LoAF absent (dense LoAF58.3ms exists). Root read-only monitorOn, xrandr90Hz; no DPMS/display changes made.
