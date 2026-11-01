# Primary canvas texture: pure foundation

This leaf does not activate texture rendering, CMAT3, a new snapshot/profile,
server grant, shader, allocator or public index export. It is independent of a
built-in stock CAS. Callers still prove original descriptor origin, CAS contents,
authority, policy and resource lifetime. No legacy fallback is provided.

The closed pin accepts ordinary local Object.prototype or null-prototype records,
including frozen ones. Every required field is own data; extra/symbol/accessor
fields and custom prototypes are refused without reading accessor values.
Descriptor/prototype operations are not a security sandbox against Proxy traps.
The trusted asset is captured the same way. Its exact CAS and top-left rectangle
must match the pin; square padding outside that rectangle is permitted. Dimensions
are1..4096, area<=1048576; period must equal the matching dimension in this unit.
Offsets are reduced integer cell offsets. Metadata signed zero is refused.

The only law is nonsoft subtract-u8-v1. Strength uses the actual binary64 product
strength*255 followed by nearest integer, exact half ties to even, without epsilon.
It does not claim rounding an infinite-precision real product, vendor pixel
identity or shader equivalence. Both scalar signed zeros produce positive U8 zero;
no input object is mutated. The subtract helper takes already quantized U8 S and
returns max(0,M-T-(255-S)). S=0 is not a texture-disabled mode.

Canvas cells use a top-left world-pixel coordinate on each axis independently.
Coordinates must be safe integers; reduce world modulo dimension before adding
the reduced offset. This avoids overflow at +/-MAX_SAFE_INTEGER. No Y flip,
subpixel interpolation, random phase, implicit wrapping of invalid offsets or
texture sampler state is invented here.

Tests use a separate binary64-bit/rational rounding oracle, exhaustive U8 corner
domains, true half ties/adjacent values, and BigInt modulo reference at large and
negative coordinates. They also verify padding/rectangle/CAS rejection and that
getters are not invoked. These are CPU contracts, not GPU/device proof.

Cost/budget helpers are deliberately deferred: the executor has not established
an authoritative texture work estimate. This foundation allocates no resources.
