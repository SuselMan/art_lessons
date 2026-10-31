# Browser arithmetic in the existing composite pass

Explicit `alphaDarkenBrowserFloat` and `overBrowserFloat` operation keys require
`browser-highp-rgba8-v1` controls. The same pass, state capsule, target/source
lifetimes, bounded scratch, resource budgets and program cache are used. Native
operation keys, GLSL exports and control profiles are unchanged.

The browser operations reuse existing ordinary `SOURCE_ALPHA_DARKEN32_GLSL` and
portable-policy-zero `SOURCE_OVER32_SCALAR_GLSL`. No software FMA or reciprocal
instruction emulation is injected. The existing RNE byte packing, Alpha Darken
creamy/hard laws, mask selection and straight RGBA8 format remain. GPU highp may
contract expressions: this is a browser arithmetic contract, not native ARM
bit identity. No shader is copied or globally replaced.

Tests-first: two browser tests failed at operation admission, while 25 existing
pass tests passed. After implementation, 31 tests in the existing pass and HSY
suites passed. The added checks cover ordinary kernel selection, distinct warm
program ownership, no new warm uploads, mask/variant/portable-over uniforms,
full GL state restoration, rejection of mismatched native controls and
unprepared native keys, and CPU reservation release. Host mocks do not prove
shader byte output or responsiveness on hardware. Logs: fixes-v52/
`browser-composite-{red,green,lint}.log` in the retained device-run directory.

This component does not activate server policy, construct a whole-profile
engine or choose a profile from a received frame. CPU source preparation,
executor/coordinator profile selection, actual device compilation, output and
pointer latency remain separate integration gates.
