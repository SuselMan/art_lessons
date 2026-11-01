# Raw canvas-pattern storage in the existing canonical root bank

This resource unit does not activate material3 rendering, transport, authoring,
composite shader behavior or protocol capability. A validated metadata pin is not
CAS provenance or semantic execution authority. The future material3 owner must
supply the genuine normalized original asset provider and own its root lease.

The bank job union separates `native-image` from `raw-pattern-l8`. Native jobs
retain their previous key, NativeImageResource, byte estimate and upload/pyramid
path. Raw jobs have an exact CAS+side+rectangle+role+sampler storage key and no
NativeImageResource, index, resize, pyramid or inverse-gray conversion. Phase and
per-draw strength do not belong to storage identity. The pin is captured against
the exact asset and discarded after planning; only its normalized raw asset
storage requirement is retained. Image resources/prepared metadata and image
binding APIs filter raw jobs so they cannot become native primary images.

Raw preparation reserves the borrowed original square CPU workspace BEFORE the
provider call, using the unchanged shared BrushMipCache allowance. The provider
returns trusted read-only-by-contract Uint8Array of exactly side² bytes. There is
no image-sized copy, crop, inversion or RGBA expansion. The array is passed
synchronously to upload and is not retained by the job, cache or lease. Provider
mutation after the synchronous native upload is outside the trusted-read law.
For Chalk35, the252² period occupies a256² original:65,536 borrowed workspace
bytes and262,144 conservative GPU-equivalent bytes, not a physical GPU claim.
The root's existing planning/job/membership metadata reservations remain active.

`uploadBrushTexture([original],LUMINANCE,CLAMP_TO_EDGE,true,undefined,storage)`
uses exactly one original square level, both filters NEAREST, both wrap axes
CLAMP. Omitting plane is deliberate: the rectangular uploader's existing plane
mode uses LINEAR minification. ContextStorageOwner uses its existing
brush-texture-rgba-equivalent domain and4*side² charge. No upload or managed GL
state ownership API was modified.

Preparation protects and leases the FULL active+pending key union before
putOwned. The existing required lease pins absent staging keys but alone does
not grant protected publication. The same bank pending slot, staged publication,
root references, retained child handles, release/reset/loss and unpublished
resource cleanup cover raw and image jobs together. No new texture or CPU cache,
budget increase, binding cache or GL query was introduced. When the last root
retires, readers/jobs and their provider closures are removed. Unpinned textures
may remain in the existing bounded LRU without retaining a provider or granting
new source authority. A later genuine root may reuse storage with its own proof.

Raw inputs are rejected by the legacy full constructor and beginExtension before
readers, reservations or GL callbacks. Their original image paths remain available.

Only a genuine root lease mints `patternResource`. Lookup validates its exact
asset/pin role and current root handle/generation, same gl/cache/cpu identities,
cache storage-current texture and byte charge. Its immutable typed view has an
internal unique-symbol brand AND module-private WeakMap provenance; copying its
fields/symbol does not mint a view. `assertCanonicalPatternResourceCurrent`
revalidates current handle, owner identities, texture identity and charge. The
WeakMap contains per-view owner checks, not global GL state or a handle-liveness
certificate; it does not replace normal GL restoration checks. Retiring one
handle invalidates that handle's views even if a sibling still owns storage.
The future consumer must retain a root handle through use and charge its own
retained view/request metadata just as for existing image resource snapshots.

Tests execute actual existing bank/cache/storage-owner/root preparation methods
with recordingGL (lifecycle/state mock, not a pixel rasterizer). They cover raw
original bytes and sampler state,1job/no native resource, full256 vs period252,
image API exclusion, exact owner/asset/currentness and copied-view rejection,
phase-distinct roots sharing one upload, independent retained handles and cached
reuse after reader release, CPU refusal before provider/allocation, provider
cancel/reset, upload failure/retry and cancellation during native upload, bad raw
layout, accessor metadata without execution, image+pattern protected publication,
and loss/reset invalidation with CPU cleanup. Legacy bank/residency/extension/
required-level/image-input and required-cache-lease tests remain included.
Source-only tests do not prove shader integer math, cross-GPU pixels, visual
Krita equivalence, performance or device behavior. Protected foreign shader,
engine activation, shared/dist and protocol are outside this change.

Source gates (2026-11-01):87 tests in7 suites PASS, maxWorkers1, including all
six bank suites and required-cache-lease tests. Targeted actual app-options type
check against shared SOURCE (bank and all six bank test roots) PASS; scoped
oxlint0 errors/0 warnings and git diff-check PASS. Two initial TS fixture/brand
literal issues were corrected; no production failure was hidden. Legacy test
changes are only explicit native-image union narrowing at four accesses. No
runtime/dependency copy, browser/device job, service or background process was
created by this unit; no temporary process remains. No commit yet.

Executor integration adds an optional expectedRoot argument to the existing view
assertion. The private view record remembers its genuine minting root handle;
a forwarded view from a wrapper or sibling cannot certify SAME-handle identity.
The original two-argument currentness behavior is unchanged. This is storage-only
provenance, no semantic execution grant or GL liveness witness/global state cache.
