# Actual GPU method intervals

Serve these files beside the shared `engine-webgl2-standalone` bundle from the WebGL2 prototype. Open `index.html?engine=../engine-webgl2-standalone/run.js`. No Room/server required. Run zigzag and puddle, flat and fine paper, on actual hardware. Export JSON. The shared source map resolves captured sampled call stacks to actual caller source; preserve its provenance.json and run.js.map alongside run.js.

The page first runs an uninstrumented baseline, then identical tape with every eighth outer brushPass/waterFrontStep/diffuseStep/fieldOp sampled. Final whole layer RGBA, exported RGBA, journal, undo and redo are compared. This is final-layer parity, not every intermediate suspension buffer. Query results become available asynchronously. Pending limit32; timeout15s; disjoint/lost/throw results rejected; every query deleted. There is no finish/readPixels timing fallback. Missing extension is explicitly unavailable. CPU submission and GPU elapsed are separate numbers.

GPU intervals include scheduled work between query markers, not isolated shader cycles or browser presentation. Sampled calls cannot be summed as full frame total or used to infer pen latency. Sampling introduces overhead: compare paintMs with baseline, run multiple repetitions, increase everyNth if needed. Caller attribution is captured runtime JS stack in the engine bundle, not a complete production call graph. WebGL1 and WebGL2 extension APIs are supported; hardware verification remains required.

Node unit tests cover outer-only queries, return/throw identity, asynchronous completion, disjoint discard, timeout, cap and extension absence. They do not certify GPU performance or browser compatibility.
