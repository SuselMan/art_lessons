# Canonical material wire2: typed source recipes, not execution admission

Wire1 stays byte-identical, with its original image-only public DTO/context aliases
and decoded object shape. A frozen aac21160a codec generated the committed v1 golden
including negative-zero render channels. The same pack/unpack/build entry points
now overload explicit ContextV2/FrameV2, using ONE framing, budget, dictionary and
binary-validation implementation. Stroke envelope1, stroke/profile pinning,
contiguous ordinals and draw/fence semantics do not change.

Wire2 uses prefix2| and CMAT version2, header24 / asset40 / recipe96 / draw32 /
fence16 bytes. Every definition is explicitly image or defaultAuto. Image uses
verified CAS metadata and the existing image transform law; auto has NO asset,
PNG crop/level or fake CAS identity. Auto fields retain original native static
source data, stored brushScale/brushAngle, SAVED raw shape scale/ratio/rotation,
subpixel phase, allocation dimensions, mirrors and explicit requested scalar-F64
or NEON64-F32 coverage profile. Runtime tiny scalar fallback is not a client claim.
No pixels, options, author DTO, RNG trace or shader state is transported.

Recipe96 layout (little endian): kind byte0 (image0/circle1/rect2), profile byte1
(image0/scalar1/NEON2), flags byte2 (mirrorH1/mirrorV2/autoAA4), image asset index
byte3 (auto must0), width/height U16 bytes4/6, eleven F64 slots bytes8..95. Image
uses the seven v1 floats then four required all-zero slots. Auto uses diameter,
generator ratio, h/v fade, stored scale/angle, shape scale/ratio/RAW rotation,
subX/subY. Reserved/profile/flag/version combinations reject. An unused source
asset table entry rejects. Role framing binds each definition to its trusted
primary/mask source, not merely any static definition that happened to pass.

## Normative zero policy and authority

ONLY defaultAuto STATIC numeric zeros normalize to +0 through the ONE
canonicalDefaultAutoStatic helper at both builder and trusted-source boundaries.
Raw static -0 in wire is a noncanonical spelling and rejects. Dynamic saved shape,
rotation, subpixels, opacity/flow retain F64 signed zero; image wire1 is unaffected.
Dictionary identity is exact F64 bits and typed source/profile, not JSON numeric
formatting. No claim is made that this static-zero policy preserves every native
internal signed-zero side effect. It is an explicit new wire policy, not hidden
Bionic identity. A future pixel-sensitive paired-zero native proof is separate.

canonicalDefaultAutoSourceBinding reuses the existing structural raw-data
capability extractor, validates the closed static class and normalizes statics.
The caller must have verified the descriptor/CAS (image) and supplied the actual
pinned descriptor SHA/id/version plus allowed execution policy. A descriptor JSON
hash is NOT evidence that its numeric -0 survived JSON serialization. SourceStamp
presence, recipe kind and a profile string never grant renderer or server access.
A client-supplied subsequent frame cannot replace the trusted static source.
Current server/room binders and local image adapters remain image-only.

The initial class is default circle/rect, spikes2/randomness0/density1/fixed
softness1, with retained antialias and h/v fade. Existing data-only capability
still says rasterReady:false. Raw static brushes and stored scale/angle are pinned
from the descriptor. Author context.scale override is not silently accepted as
native UI Size or descriptor scale. Source audit shows Auto.setUserEffectiveSize
changes generator diameter and recreates brush geometry, rather than simply using
base setScale. Future authenticated effective-diameter lowering needs its own
explicit bound policy; this unit does not add that grant. The real seven-descriptor transport test therefore
uses source-native stored scale, not the earlier diagnostic .2 override.

## Geometry and bounded cost

Allocation recomputation uses the shared sourceAutoGeometry and exact F64 FMA
single implementations. Width/height must agree before decoded DTO arrays or
any pixels/GL. Bounds remain4096/axis and1M pixels. Output is charged RGBA8
4*pixels, not the smaller A8 CPU oracle. Conservative work is pixels*(AA?36:1),
with existing source-reference16Mi work cap per definition and independent frame
64Mi aggregate cap. AA36 is a scheduling upper bound, not measured actual samples
for every large/tiny brush. It may conservatively reject a large AA recipe that
would use fewer samples; no cap is silently raised and no fallback is chosen.

Shared source math preserves sampled native fixtures, not arbitrary cross-runtime
sin/cos identity. This transport/preflight unit does not prove a raster service,
GPU coverage, renderer dispatch, performance or complete Krita compatibility.

## Checks and fail-closed consumers

Tests cover v1 frozen golden, explicit image-v2 tagging, no-asset auto, scalar/
NEON +circle/rect/AA, static normalization vs dynamic negative zero, dictionary
reuse of SAVED generation rather than current request, role binding, unknown
profile/reserved bytes/nonfinite/extent/static-spoof rejection, aggregate refusal,
JSON-opaque roundtrip, envelope freeze and structural whole/chunk framing.
Seven real imported descriptors through the actual source author at30 pressure
inputs each feed saved generation into recipe→binary→decoded frame without CAS;
this is an off-path CPU transport test, not author/renderer activation.

Image-only adapter/encoder explicitly reject ContextV2 before image assets or
program access. The existing executor rejects non-image material profile before
layer/bank/cache resolution; image transformed-mask guards remain in place. The
negative alias test sends valid v2 auto bytes to a legacy image context and proves
its custom image preflight is never invoked. No straight room is opened, no
renderer branch or author adapter is enabled by these overloads.
