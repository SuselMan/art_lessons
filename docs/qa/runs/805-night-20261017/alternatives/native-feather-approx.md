# Одноктавный feather: QA approximation

`alternatives/native-feather-approx.cjs` exports `transformFrontFeatherPair(nativeSource,prefixSource)`; build must transform and publish BOTH modules together, gated by QA_FRONT_ONE_OCTAVE. Native argument is shaders.ts (or its exported shader string); prefix argument is WatercolorFrontPaths.ts (or GLSL containing unitEdge). A missing/duplicated/drifted original call or reapplication throws before a pair is returned. No runtime/default enabling.

Only two call-site names change wcFbm→wcNoise. World coordinate expression, paper height sampling, feather gain4, thresholds .5/.64, min-plus relief, packing, loop/order and all other source bytes stay unchanged. wcFbm's shared definition remains TWO octaves (.63/.37); approximation keeps its first spatial scale at full amplitude. Consequently threshold occupancy and finger detail can change: this is not byte equivalence, portable-math proof, or a demonstrated speed/quality win. Prefix base edges and native relaxations must use the same approximation.

CPU: `node --test docs/qa/prototypes/805-algorithm-search/alternatives/native-feather-approx.test.cjs` — 3 tests pass against actual current modules; exact inverse substitution recovers every original byte. Tests exercise extracted shader template/unitEdge, repeat/duplicate/drift/type rejection and pair failure. No GLSL compilation or GPU execution implied.

Required device gate: deterministic repeats, pigment/water-zero control, identical trusted gestures and side-by-side native wave/edge PNGs versus original feather. Then timing without observer reads. Existing v9 correlated-paper candidate remains unchanged. No GPU, process, dependency or temporary build resources created.
