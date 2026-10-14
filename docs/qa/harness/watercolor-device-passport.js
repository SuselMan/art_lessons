// devbridge eval <page> @docs/qa/harness/watercolor-device-passport.js
const engine = window.__engine;
if (!engine) throw new Error('Open the full Grafetto QA room first');
const gl = engine.gl;
const debug = gl.getExtension('WEBGL_debug_renderer_info');
return {
  capturedAt: new Date().toISOString(), userAgent: navigator.userAgent,
  visibility: document.visibilityState, dpr: devicePixelRatio,
  screen: [screen.width, screen.height], touchPoints: navigator.maxTouchPoints,
  gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), extensions: gl.getSupportedExtensions(),
  model: engine._watercolorModel, asyncFinish: engine._wcAsyncFinish,
  paper: window.__roomStore.getState().paper,
  operations: engine.getOperations().map(op => ({ id: op.id, type: op.type, seq: op.seq, preset: op.preset })),
  ready: !engine._locked && !engine._settle && !engine._wcCanonical.pending && !engine._rebuildJobs.size && !engine._opQueue.length,
  front: engine._watercolorPasses._frontPaths?.stats,
  scheduler: engine._wcDryWorkScheduler?.stats, glError: gl.getError(),
};
