# Mini Worker prototype (#802)

Worker (default) and main-thread modes run the same engine, native target and local controller. Only the local controller removes the default60ms launch delay and runs the ordered solver to completion in one step. Live728/747/798 files are unchanged.

The transferred OffscreenCanvas stays in the worker: input/settings use messages; frames are not read back/transferred. The canvas adapter retains PointerInput, event-time differences and device budget parity. The hidden live-mode DOM contour overlay is omitted in both modes. PNG exports the current visible canvas.

Build with the existing compatible esbuild, no installation:

```sh
QA_OUTPUT=/registered/disposable/build node docs/qa/prototypes/mini-worker/build.cjs
node --test docs/qa/prototypes/mini-worker/canvas-adapter.test.cjs
```

Serve that build and existing `/paper/` assets. QA uses `QA_OUTPUT`, `QA_CDP`, `QA_ACCESS_FILE` with `node docs/qa/prototypes/mini-worker/qa-android.cjs`; its download click guard applies only to the owned prototype PNG. No private gate URL is committed.

The UI reports JS goal/IPC latency, not isolated GPU execution. GPU remains shared; a synchronous worker solve can delay the next input message. The Samsung pair proves functionality and a responsive counter during one solve, not worst-case input latency or pixel equivalence. This is a live-only1024 diagnostic, not a production Room replacement.
