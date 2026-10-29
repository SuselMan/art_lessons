# Installed ARM64 fused compositor diagnostic reference

Explicit profile: `installed-arm64-vector32-fused-fpcr0-v1`. Inputs and output are straight RGBA8. The implementation is an arithmetic diagnostic reference, not a renderer activation or an assertion about the active GUI factory, actual thread FPCR, or native paint-device alignment. Exact finite FMA uses the slow BigInt primitive; this is not a hot rendering backend.

The independent oracle executes original installed Krita 5.3.4.1 ARM64 library instructions under Unicorn 2.1.4 A72, FPCR=0. The library SHA and bounded function-code SHAs are recorded in each fixture. No compositor arithmetic is hooked. Direct functions and actual composite wrappers produce identical complete destination buffers, including row padding. Successful allocation/free hooks support constant-source expansion; unknown Qt/cold paths trap. No APK/library is retained. Instruction emulation was independently gated against all 155636 physical Samsung reciprocal records and 11200 host finite FMA records. Emulation is not physical ARM execution.

`extract.py` copies observed destination bytes from retained private reports; it does not call the TypeScript implementation or compute expected results. The 2688 baseline cases alone do not distinguish FMA from the previous noFMA reference. The 72 witnesses differ in 1008 bytes. The additional 137 alpha-boundary inputs were selected by a model search, **only as inputs**; their expected outputs come exclusively from a later original-machine-code execution. Input files retain raw controls, pixels, masks, strides and logical alignment residues. Authored witness expected/result fields are deliberately omitted.

The source graph is derived from pinned source plus actual installed instruction operands (private `installed-fma-graph-map` and selected disassembly). It is source-informed, not a clean-room provenance claim; no native instruction/source body is copied into this module. Krita source provenance/SPDX notices remain in the preceding sourceVector32/sourceAlphaDarken32/sourceOverPortable fixture sets.

Important graph distinctions:

- Scalar/vector Over alpha fuses `f(S*f(255-D))*inv255+D`, followed by a single FRECPE; RGB is fused. Packet fast paths remain intact.
- AlphaDarken scalar uses normalized alpha; vector uses byte alpha and its separately rounded normalization. RGB fuses the exact integer channel difference.
- Scalar average uses FDIV; vector average uses FRECPE plus two FRECPS refinements. Only the assembly-selected multiply/add sites are fused.
- Hard scalar zero alpha is fused `f(D+S)-D*S`; vector zero alpha is fused `f(S8+D8)-f(S8*D8)*inv255`. Flow and full-alpha blends follow their actual FMA sites and flow-one shortcuts.
- Strict finite FMA handles all finite operands exactly. Reciprocal zero/overflow may create nonfinite intermediates; only their IEEE value classes and final byte-pack behavior are modeled, not NaN payload/FENV identity.

The common bounded row/stride/alignment traversal is reused from sourceVector32. Its former noFMA point math and profile remain unchanged and are separately checked against all 2688 prior outputs. Logical partitions are diagnostic source predictions, not invented observed native function-call counts. No shared schema, wire, session, shader, importer or active engine hooks change.
