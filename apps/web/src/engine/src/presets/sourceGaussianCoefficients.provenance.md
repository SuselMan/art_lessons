# Gaussian constructor / setScale coefficient reference

This isolated CPU function is source-informed by Krita's GPL-2.0-or-later
`kis_gauss_circle_mask_generator.cpp` and `kis_antialiasing_fade_maker.h` at
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`. It is not a clean-room claim or
an activated importer, descriptor, author, renderer, or sampler profile.

The installed image library SHA256 is
`24d3f19d43650100bce51e8e941d66e3999eadee94e64e9f59dfe6c9ef86396d`.
Original constructor `0x53cae4` contains a binary64 fused `fade*6761-10000`;
its subsequent multiply and denominator remain separately rounded. Original
`setScale` at `0x53d670` recalculates ycoef, distfactor and the fade-maker
fields, including both Bionic erf calls even when antialiasing is disabled.
The shared exact binary64 FMA and sourceGaussianBionicErf implementations are
reused. There is no preset lookup or fitted coefficient table.

Inputs are raw generator diameter/ratio/fades and consumed generator scaleX/Y.
Stored brush scale is not an extra factor here. Gaussian's base softness setter
does not modify these coefficients. The finite positive closed domain rejects
zero dimensions, invalid fade/ratio ranges, nonfinite intermediates and a radius
whose fade-start subtraction loses its positive interval. It does not admit the
native NaN/infinity behavior of degenerate settings.

All eight fields match all104 independently captured original constructor and
setScale calls bit/value exactly. Arguments are retained in
`fixtures/sourceGaussianResolvedMask/coefficient-inputs.native.json`, aligned
with the already frozen direct-output fixture. The oracle executes original
installed instructions under Unicorn FPCR0, with allocation/applicator interfaces
but zero arithmetic hooks. This is not physical ARM execution or GUI factory
selection evidence. Whole104 masks remain covered by the separate resolved-mask
fixture; changing this constructor alone does not enable generic Gaussian paint.

An additional input-only64-case corpus exercises fade endpoints and near endpoints,
fractional/tiny/anisotropic scales and diameters. All512 original output fields
match exactly. The original constructor/setScale execution took0.754s; allocation
and explicit applicator interfaces were reused without arithmetic interception.
See coefficient-edges.native.json and its proof for frozen input/library/runner
hashes. No new dependency, binary resource, or stored ELF was created.
