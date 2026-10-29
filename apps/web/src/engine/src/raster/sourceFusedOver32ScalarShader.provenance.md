# Installed fused scalar Over, diagnostic pixel profile

`SOURCE_FUSED_OVER32_SCALAR_GLSL` exports `sourceCompositeFusedOver32Scalar(sourceRGBA8,destinationRGBA8,values,hasMask,opacityParts)`. `prepareSourceFusedOver32ScalarControls` validates local controls and narrows opacity once to F32 before producing BOTH flat numeric `(opacity,maskByte)` and lossless finite components. This is local diagnostic upload metadata, not a network field. Inputs are straight RGBA8 integer channels. Mask absent and mask0 are distinct. Native source alpha already includes its brush mask; the optional mask here is the external selection. There are no active hooks, factories, descriptors, material, room or wire changes.

This is an explicit **scalar point** graph. It does not infer SIMD packets from pixel coordinates, GPU tile64, texture row widths or destination alignment. Future vector admission must preserve actual packet all-lane branches and native paint-device partition semantics; no such equivalence is claimed here. AlphaDarken remains outside this unit.

## Reuse and operation graph

The implementation composes the existing exact finite FMA component primitive and existing closed Over FRECPE helper. Normal numeric/component conversion uses bounded power-of-two scaling, not log/exp or raw U32 float carriers. Ordinary alpha is the installed fused `f(S*f(255-D))*inv255+D`; blend uses single FRECPE and a separate F32 multiply. RGB uses exact fused `blend*(source-destination)+destination`. Native RNE byte packing keeps low8 bits (explicit mod256), rather than relying on framebuffer clamp. Old scalar/portable/noFMA declarations are unchanged.

## Rejected numeric subnormal path

Actual Samsung normal/zero decomposition passed10527 inputs bit-exact, while all seven explicit positive/negative subnormal boundary probes flushed to signed zero. The failed receipt is retained: this is NOT a general subnormal-preserving numeric wrapper. In8232 exact-vs-every-F32/FMA-flushed CPU diagnostic cases,98 different RGBA outputs were found, all Over hiddenRGB at destinationA0. Native positive tiny source alpha copies sourceRGB with roundedA0; flushed S0 early-returns destination. Hidden RGB is canonical data, so simply zeroing tiny opacity is incorrect.

## Exact tiny branch

The partition opacity<2^-100 is an exact power-of-two domain split, not an error tolerance. It is selected from caller-captured components, which survive GPU numeric subnormal flushing. Compute source alpha with exact component FMA-as-multiply in the native order `f(sourceA*opacity)` followed, if selected, by `f(S*f(mask*inv255))`. The component zero/nonzero decision is exact, including sourceA0/mask0 and underflow-to-zero. If S=0 return destination. If S>0 and destinationA0, copy sourceRGB/A0. Otherwise return destination.

For this branch S<255*2^-100<2^-92. With integer D>=1, alpha's added term is smaller than2^-92 and cannot change rounded integer D. The closed FRECPE(D) estimate is bounded above by2; consequently |blend*(sourceRGB-destinationRGB)|<2^-83, far below an integer rounding midpoint. Destination bytes remain unchanged. For D0 the rounded alpha is0, but hiddenRGB requires the exact zero/nonzero distinction above. Signed zero S follows the native S==0 branch.

The exhaustive sourceA256×selection256 table across10 selected opacity boundaries (including minimum/maximum subnormal, minimum normal and both sides of2^-100) checks655360 exact component multiplication outcomes against separate IEEE F32 multiplication, zero differences. This is mathematical model conformance, not an instruction oracle. Separately,200 deterministic input-only tiny cases were executed through the original installed ARM64 kernel under Unicorn FPCR0 with no arithmetic hooks; wrapper/direct outputs agree. `tiny.native.json` retains those independent observed bytes and inputs, and unit tests check both hiddenRGB outcomes. This is original-machine-code emulation, not physical execution or active GUI dispatch.

## Ordinary numeric domain

For opacity>=2^-100, any nonzero selected source alpha is at least2^-108 because sourceA>=1 and f(mask*inv255)>=2^-8. Any nonzero blend is at least2^-117, since alpha<256 and the closed FRECPE estimate is bounded below by2^-9. Over's nonzero intermediate multiply/divisor paths are therefore normal. RGB fused cancellation with nonzero destination integer requires blend>=1/255>2^-8; then its exact cancellation quantum is at least2^-31. If destinationRGB0, nonzero output is at least2^-117. Thus no subnormal numeric operand/result is needed on the ordinary finite FMA path. Zero branches remain explicit. These bounds explain the split; they do not redefine native outputs with tolerances.

## Actual GPU gate and performance limits

Final primitive SHA is in `fixtures/sourceFusedOver32Scalar/proof.native.json`. Actual Samsung Adreno650/WebGL1 passes522 scalar point cases exactly:256 baseline,24 fused rounding witnesses,42 alpha-boundary controls and200 tiny cases (the last200 additionally checked against original machine-code outputs before GPU). GL errors0. Cold complete9213-byte fragment compilation took2.5618s. A uniform-input overwrite workload of8 logical64×64 draws reported approximately0.1ms after warmup, with exact corner readback; driver uniform/overdraw optimizations and coarse timing mean this is **not shaded-pixel throughput or responsiveness proof**. A real varying-texture compositor workload and many-call register/instruction costs remain unmeasured. No production activation follows this diagnostic result.

The private harness and proof producers remain under `temp/device-runs/krita-stroke-20261024/fixes-v52` with hashes in the receipt. Every own child/context/GL object and forward19236 was closed, original three tabs preserved and parent3631 restored. No new runtime, SDK or dependency was created. Parent-retained Unicorn is outside this cleanup scope.
