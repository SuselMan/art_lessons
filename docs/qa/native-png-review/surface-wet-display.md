# Surface: shared-input wet presentation, 2026-10-08

Root supplied real Surface run `native-captured-wet-surface-1791423144738.json` and `captured-wet-images`. No device was driven by this analysis. Original edge-positioned tape is unchanged.

For both post-operation snapshots, actual stock GL PAPER_COMPOSE and native paper renderer agree byte-for-byte on the same immutable material, CPU wet overlay and baked Fine paper: dry changed0/max0; wet changed0/max0; WebGPU errors[] and GLerror0. The first wet display changes33429 bytes/max14 from dry; the second41389/max23, identically in both renderers. This isolates presentation algebra/orientation for this128×128 identity-camera crop; it does not establish physical field parity.

The straight horizontal transition exists in material alpha and solver coverage before presentation. WorldY529 material alpha has56 nonzero pixels, Y530 has67, Y531 has123 and Y532 has128 within cropX448..576. CoverageA atY529 has56 nonzero pixels/sum14280; Y53067/sum16945; Y531128/sum29381; Y532128/sum31934. CoverageB simultaneously rises from13544 atY529 to21010 atY531 and29485 atY532. Thus the broad support begins at the existing waterline upper boundary, while the isolated blob occupies fewer columns above it. Both dry and wet paper PNGs retain this change; wet shading is not its sole source.

Original waterline centreY575.715576 and maximum dab diameter90.1313 imply nib topY530.6499. Pigment tapY512 is63.7156 above the centre, rather than centred in the puddle. The measured shared coverage transition atY531 matches this geometry. This narrows investigation to contact/coverage/transport across that edge, without proving which physical pass is responsible or whether an artist should accept the boundary.

PNG conversion remains valid: raw material premultiplied bytes are unpremultiplied once for alpha PNG export; paper outputs are opaque actual display bytes. Hidden RGB in transparent pixels is not the visible hard edge.

Limits: snapshots are after serial settle; no full camera/page/sharp-resample parity, moving reveal/morph, pointer latency, two independent wetness models, other papers or hardware claim. Centre-pointer fixture is a separate control using actual PointerInput/DabSystem and recorded operations, to remove ambiguous tap placement; original evidence remains primary.
