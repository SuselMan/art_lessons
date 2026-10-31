# Explicit GenericSC outer composition envelope

Version1 and `installed-arm64-scalar-fused-fpcr0-v1` retain their exact envelope
shape, property order and opaque material bytes; omission of trusted rasterProfile
continues to mean that historical Over-only policy. Version2 requires the explicit
trusted `installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2` pin. The received
frame cannot choose the trusted profile. Material version/tag bytes are independent
and unchanged.

The V2 whole-pipeline profile supports historical Over and four native GenericSC
U8 outer modes: multiply/lighten/colorDodge/overlay. Non-Over currently requires
wash; buildup, unknown modes, coercible objects, null/unknown profile and mismatched
version/profile fail before material preflight. The shared closed composition
predicate is also used before executor/coordinator resource admission. Decoded
composition is copied/frozen and compared with gesture authority.

Kernel evidence: R52 original installed ARM64 vtable/Qt execution d8a9315cd
(268 exact cases), Samsung actual WebGL1 pass 197a6cce1 (528 exact draws), separate
WebGL2 integer helper (264 exact cases). Those receipts distinguish constructed
ABI/emulation, source-law and actual device GPU from physical ARM GUI/factory
proof. A profile name/decoder acceptance does not grant room/descriptor execution.
Existing server/snapshot/attachment consumers retain their old policy and reject
V2 until an explicitly implemented capability migration. No room/editor writer,
new renderer, queue, outbox or shader is activated by this change.
