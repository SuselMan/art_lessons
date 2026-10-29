# WebGL1 Qt-wordsize64 straight store

Explicit isolated source-law profile, not an installed application's dispatch
claim or active renderer. The mathematical factor resource uses the existing
`rgba64UnpremultiplyFactor` CPU owner, not a second unpremultiply algorithm or
host-specific reciprocal table. Two256×256 RGBA8 NEAREST/CLAMP textures store
six factor bytes per alpha16 (remaining channels zero), total524288 bytes.
Build once at profile preparation and charge them to the existing GPU budget.

The authored shader multiplies c16 by fa48 using8-bit convolution, adds2^31,
extracts the16-bit straight word, applies the existing Qt16-to-8 law and final
UINT8_MULT(inverse-gray,alpha). All convolution intermediates fit17bits.
Requires fragment highp>=23 and valid PM input c<=alpha. Packed-gray input and
output are explicit. There are no WebGL2-only operations, CPU pixel uploads per
dab, hardware-reciprocal data, renderer hooks or automatic profile selection.

Actual Samsung WebGL1 GPU receipt: all524288 cases (all65536 alpha words,
eight valid channel choices peralpha) matched existing CPU integer64 store and
mask exactly: colorWrong0,alphaWrong0,maskWrong0,maxDelta0,GL0,highp23.
Private receipt R51/rgba64-store-device-result.json; eight256² batches.
GLSL SHA256 d8bcca525e69f5fed5b19478e902d26e3df653931dd2d09ba93cd20b90ac9ef3.

The expected CPU store was independently checked on the same524288 cases
against unchanged Qt5.15.7 QRgba64 public-header arithmetic:2097152 channels,
zero mismatches. See rgba64Straight.provenance.md for native source/hash and
actual-host/Android distinction. The GPU check proves the chosen integer64
numerical law, not whole-image geometry, source decoding, installed-app function
registration, compositing, canvas storage, replay or iPad identity.
