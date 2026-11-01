# Canonical primary texture paired consumer

Engine/coordinator explicitly consume normalized material 3 while legacy Any material
aliases remain 1/2. Recorded READ3 does not depend on the author option. Authoring
requires a captured `primaryTextureSource: pressure-identity-subtract-v3` service
option; absence leaves author admission OFF. BEGIN receives the prepared descriptor
SHA, and the returned normalized snapshot must match the exact source, full asset
roles, texture pin, composition, descriptor and room lifetime before local admission.

GenericSC owners prepare the existing pass's extra textured alphaDarken program up
front and charge its existing 8192-byte program allowance. Other raster profiles keep
their old operation sets. Only executor primary deposition receives the texture;
wash restoration, preview, stable and outer composition retain plain RGBA sources.

All canonical image cold preparation, material 2 and 3, uses the SAME empty
root-residency bank / prepareRoot / publication pipeline. Tip-only native image
requirements reach the prepass. Material 3 adds the original raw L8 pattern job to
that same root and the full companion/lease group. Neither a second source bank nor
an independent texture cache, native-image pattern pyramid or larger budget exists.
The full cold owner retains its published root until owner retirement. Indexed,
original suffix and local preparation hand off actual root leases to the SAME
coordinator; executor retains its child and validates exact tip/pattern provenance.

The default prepass source map also has explicit root lifetime owners. Before
staging source/capacity updates, a candidate root is published into candidate-only
ownership and a child retained when its jobs add bindings (or replace the source
map). There is no yield or exposed owner publication between this and map commit.
Additive updates and all capacity resizes preserve old canonical bindings and their
roots; idle replacement retires old default roots only after map commit. Immutable
existing job metadata supports deduplication: a repeated group adds no owner child.
An additive owner child is kept only when its immutable existing job metadata
adds a previously unowned key; repeated identical assets/phase changes do not
accumulate children. Root metadata/residency remain charged by the existing bank, and the enclosing
publication uses its existing bounded staging reservations. Failures release only
candidate ownership, leaving old maps/roots intact; postcommit cleanup faults keep
the published union. Owner cancellation/context loss/destruction attempts every
child/root release before resetting the existing bank/cache. No provider snapshot
or forever reader registry is added.

The full nonindexed resource-preparation API permits speculative preparation of
another genuine original before append. SAME input reuses its pending root;
DIFFERENT preparation retires the previous pending root only after successful
replacement map publication. A failed preparation preserves the old pending
root/map. The normal caller prepares the actual input immediately before append;
the prepareA→prepareB→prepareA→appendA regression uses A's SAME unchanged genuine
read/delivery, finishes the original history, and checks bounded default roots and
zero CPU reservation after destroy. Indexed history retains its strict one pending
root/input contract. Neither path adds a queue, grants or accepted journal entries
merely by preparing resources.

Tests use genuine shared snapshot/attachment/read preparation and actual engine,
coordinator, bank, prepass and composite paths with the existing MockGL fixture.
They cover closed/open CMAT3 cold history plus original continuation, strengths
0/128/255 routed through the actual pass and plain outer sources, explicit author
OFF/ON with local material3 emission and matching descriptor SHA, and legacy image/
auto growth, shared cancellation, cursor preservation, queue pressure and cleanup
faults. Mock precision now supplies the range required by the actual prepared
variant. Updated legacy full-bank fixture assertions exercise root preparation
rather than calling the forbidden root-bank full prepare API. These are lifecycle/
source-routing tests, not independent GPU pixel or online protocol attestation.

## Identical warm selection and late cancellation

Late subscriber cancellation can occur after synchronous source-map publication.
An idle update with exactly the same immutable job key/byte group keeps its existing
default storage owner instead of retaining another root's full metadata. This is a
storage-lifetime equivalence only: native job keys encode CAS/crop/level, and the
bank rejects conflicting full job metadata or original CAS side before publishing;
raw pattern keys include the full asset tuple and explicit L8/nearest storage role.
Native prepared bindings reconstruct the complete asset tuple/index. Primary pin,
texture phase, period and strength are independently validated material semantics.

Work sharing keys include the complete normalized image pin and optional material3
context (including full texture pin and budgets). A newly retained handoff child may
reuse the old genuine root only when that complete selection key also matches the
exact job group. Otherwise execution receives the separately prepared candidate
root. The unused candidate is released only after successful map publication;
rollback releases its staging child and candidate while leaving old owners intact.
Thus a successful identical warm selection does not retain a second full root's
metadata, and repeated late cancellation preserves the fully warm byte baseline.

The first source/companion update and first retained author token have existing
one-time charges. A controlled fixture-only reserve observer isolated those charges
from root metadata; it was removed after diagnosis. Tests warm those existing owners
before asserting an exact repeated-preparation/cancellation baseline. The indexed
image test additionally covers two real local gestures and original promotions.
The new same-CAS/different-phase test prepares distinct genuine original inputs
concurrently, checks separate work keys, then uses normal reprepare/append to verify
that actual primary deposition receives only the admitted phase. No cache ceiling,
execution grant, global binding state or phase-derived texture allocation is added.

The retained selection string is the existing preparation key reference, not a
second serialization or independent catalog. Its contents are bounded by the
closed 256-asset / 256-frame source grammar (material3 has two asset roles).
Repeated frame IDs can nevertheless make it larger than a root-handle wrapper.
Before a new default entry retains that key, `2 * key.length` bytes are explicitly
reserved from the SAME BrushMipCache ceiling; the entry owns the release callback.
SAME semantic reuse preserves that reservation, rollback releases only staging
key/children, and replacement releases old key charges only after commit. Both
published-owner retirement and unpublished indexed-candidate cancellation attempt
all lease AND key releases. Bank reset alone is deliberately insufficient for this
external key reservation. Tests inject failure at that exact reservation before
map publication, then verify unchanged old source/root/CPU and a successful retry;
actual indexed image cancellation/context-loss after root/key publication returns
to the original CPU baseline without an accepted cut. No budget limit is raised.
