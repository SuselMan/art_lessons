# B1: original primary image bank binding

The SAME coordinator genuine recorded/local routes can now consume a closed
primary image V2 context. Recorded inputs still originate in the actual room
preparer and retain original per-input delivery/lifetime/namespace/prefix laws.
Local source selection still uses the exact internal original-BEGIN lease; its
snapshot is normalized at new-entry source resolution. Engine image authoring,
resource loading and rotation/capacity admission remain closed for later B2.

CanonicalMaskSourceBank.assertSourceBinding performs one cold check per new
Entry: exact original receiver, shared GL/cache/CPU, an actual metadata charge,
ready sources, exact normalized asset/crop and complete unique native pyramid
levels with matching baseScale/native dimensions/stored bytes. The shared
source decoder binds image recipe asset/brushScale/angle; the existing executor
and transformed prepass validate actual cache resources on use. No source math,
renderer, cache, GL inspector or additional resource allowance was introduced.

The SAME Entry retains only borrowed bank reference plus its existing reset
generation. assertCurrentOwners repeats only scalar receiver/owner/generation/
metadata checks, never preparedResources/isReady/new arrays/pyramid generation.
The bank keeps immutable original owner references and frozen minimal input
copies (assetSide/readOriginalCoverage). Previous inputs were already shallow
copies, so this is an explicit immutability/reduced-retention invariant, not a
claim of an existing caller-mutation bug. Bytes and reader closure remain the
trusted caller's responsibility; B2 must provide verified ROOM CAS/lifetime.

After callback-capable candidate admission, bank generation and original image
read are checked again before Entry publication. Failed unpublished executors
are canceled; previous accepted Entries survive unrelated new-entry failures.
Coordinator cancellation releases its own work/metadata and leaves the borrowed
bank intact. Layer owner must reset bank on retirement/context loss/replacement.
Stale owner/generation prevents writes; caller cancellation performs resident
cleanup, matching the existing original-lifetime contract.

Tests-first: original code refused the genuine image context and lacked the bank
binding methods (two RED tests). Final 192 tests across four suites pass with
maxWorkers=2, including 18 new image cases. Actual retained Basic6 descriptor,
verified A8 CAS and SAME compiler/author/adapter/encoder produce V2 163frames and
40draws; original room-state preparer delivers those frames through the real
coordinator and existing prepared bank. One cold binding for the entire gesture
is asserted. Internal local lease then original promotion uses the same bank;
it is not a claim of engine/image BEGIN activation.

Negative cases cover foreign GL/cache/CPU, copied receiver, missing metadata
charge, wrong/missing/duplicate levels, crop/native dimensions/baseScale/bytes,
reset/reprepare stale generation without writes, late generation/lifetime
reentry before publication, missing bank, and preserving a completed first
original gesture when the next supplies a foreign bank. Final caller cleanup
returns reserved CPU accounting to zero. This is recordingGL host validation,
not a physical GPU pixel or heap-memory measurement. Offline native GUI byte
proof and later actual engine/device validation remain independent gates.

Type gate status at this commit: first combined app check caught one coordinator
profile-union annotation error (fixed by normalizing the typed original snapshot
profile then explicitly matching coordinator policy; no cast). Two concurrent UI
work-in-progress type errors also blocked that run. Final app/SW joint check is
pending the UI owner's freeze; this document does not claim a final type pass.
Own final 18-test run and lint/diff checks pass after the profile fix.
