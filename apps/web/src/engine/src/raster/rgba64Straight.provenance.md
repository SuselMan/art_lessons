# Explicit generic Qt wordsize64 straight store

`affineSpan16StraightInteger64` is an authored scalar model of the integer
unpremultiply/16-to-8 numerical law in Qt5.15.7 QRgba64, not a copied Qt body.
Source: https://github.com/qt/qtbase/blob/v5.15.7-lts-lgpl/src/gui/painting/qrgba64.h
SHA25681c22ab42fdc2fb0925f32c39215ac94963a740b5306369234a717f1c7c7916e.
`qdrawhelper.cpp:1572` uses this generic store for RGBA64 -> ARGB32;
SSE registration replaces it, NEON registration does not. The separate NEON
ARGB32PM reciprocal store must not be mistaken for this RGBA64 store.
This source audit does not prove the installed application's active dispatch.

An unchanged upstream header was compiled with only namespace/type/attribute/
processor-definition shims, wordsize8/little endian. Native output covers every
alpha0..65535 with8 valid gray channel choices each:524288 cases. The retained
fixture has1160 boundary cases. C++ input generators, shim, upstream source hash,
output hashes and source-dispatch evidence remain in fixes-v50/rgba64-*.
TS matched all2097152 native output channels. Factor computation was additionally
compared with independent BigInt division for all65534 interior alphas:0differences.
This is actual host execution of unchanged source integer arithmetic, not ARM
execution or a whole native QImage transform oracle.

All validated PM channel products remain below2^48 and are exactly represented
as Number integers. The integer quotient is safe: the numerator is below2^48;
its distance from a quotient boundary exceeds the binary64 division rounding
error. No hardware reciprocal estimates or large division tables are used.
Unlike the public Qt general color container, this API rejects invalid PM colors
(c>a), including hidden RGB under zero alpha, before output allocation.

The selected-level image transform accepts explicit `qt-wordsize64`; its decode
and interpolation profiles remain separate and explicit. Original prepared-image
level conversion still requires its proven SSE profile. No CPU detection, default
store change, canonical profile admission, renderer activation or wire change.
A composed transform regression uses the proven PM16 sampler and actual unchanged
Qt header final store; it is deliberately not labelled a whole ARM image oracle.
