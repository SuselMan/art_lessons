Pinned libmypaint1.6.1 (ISC), commit recorded in source-lock.json. Upstream
copyright/licence notices remain in every copied source and COPYING.

Build: python3 scripts/mypaint/build.py (Emscripten3.1.6). Original sources are
verified by SHA256 before compiling in an automatically removed temporary tree.
The build omits JSON-C parsing and the unused GLib wrapper; the application
validates JSON and supplies settings through the original public mapping API.
A small RNG seed setter binds native randomness to Grafetto's recorded gesture
seed. Original brush formulas and native tiled rasterizer remain unchanged.

scripts/mypaint/bridge.c adapts synchronous 64px Q15 tile requests to Grafetto.
No Qt, GLib, threads, filesystem or whole Krita runtime is linked. The WASM
module is loaded only for MyPaint presets, with its SHA256 checked before use.
