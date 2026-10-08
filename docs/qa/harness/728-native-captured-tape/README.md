# Captured native UI tape → production WebGL

Build from worktree root:

```
node docs/qa/harness/728-native-captured-tape/build.mjs temp/native-captured-tape /absolute/path/to/production/baked/paper
```

Load index.html on a trusted hardware origin. Pass the saved original Operation array to `await window.runCapturedTape(tape)`; optionally `{stages:'prediffuse'}` as second argument. Capture the returned JSON locally, then:

```
node docs/qa/harness/728-native-captured-tape/save.mjs result.json temp/native-captured-images
```

Outputs nativeLayer.png, productionGlLayer.png and diff.png (maximum per-pixel channel difference ×8 in red, black means exact); metrics.json contains original tape SHA256, raw-byte hashes and differences. Layer PNGs unpremultiply actual material RGBA for normal PNG alpha rendering; comparison metrics use unchanged raw premultiplied bytes.

No source input, ID, wet profile or timestamp rewriting. Both native owners replay original packed operations; production PencilEngine replays the same operations and baked Fine paper. Captured layer ID is used verbatim. Sequential owners preserve existing full1536 fields and source policies. Nonempty single watercolor layer/wash only; unsupported control operations are explicit errors. No additional model tuning.

This gate compares settled material layers. It does not claim parity of the live wet-paper presentation: if the rectangle is present only in the wet display, matching final layers narrows the next investigation to the presentation owner rather than proving the screenshot correct. Root controls actual Surface execution; this module does not connect to any device.
