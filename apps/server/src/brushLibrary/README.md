---
layer: server
summary: каталог кистей
tags: [кисти, ресурсы]
---
# Brush library

Versioned immutable descriptors and SHA-256 textures live in a private filesystem CAS.
`GRAFETTO_BRUSH_STORAGE_DIR` enables persistent owner libraries and raw ABR/Procreate
uploads. Requests use the existing signed user identity, including guests. Room reads
use the same current durable content ACL as snapshots; a shared asset hash alone grants
no access. Accepted imported strokes synchronously pin their exact version and assets
before the operation log can accept them. Native keyed-random descriptors also require
a valid gesture-bound seed context before either pinning/sequence allocation or live relay;
legacy descriptors keep their historical seedless admission. Sequential XY requests additionally
require validated sourceSize/sourceScale on every packed/plain dab and endpoint sample;
malformed source inputs are refused before room pinning or history persistence. Forks copy references before publishing the DB
copy. Retention uses the shared descriptor asset collector, including radial lookup
tables and secondary brush resources; diagnostic text never creates references. Owner
installation preflights resource bytes before publishing manifests. No deletion/GC can remove historical assets; snapshots do not release references.

`GRAFETTO_BRUSH_LIBRARY_DIR` selects the instance-wide stock catalog. Production
packages only the pinned redistributable stock brushes described below; private QA
catalogs must remain behind QA access protection. Personal uploads are separate and
owner-scoped. Without persistent storage imports return 503.

One conversion worker, four queued uploads, one pending job per owner, 512 MiB streamed input,
size-dependent limits from 120 s wall/110 s CPU up to 20 min wall/1100 s CPU,
1 GiB address space, 512 MiB file size; Linux `prlimit` is
required. Set `GRAFETTO_BRUSH_IMPORT_PYTHON` to the Python/Pillow executable. Converter
output is validated before installation (32 MiB manifest, 256 MiB textures); an owner's
combined assets cannot exceed 256 MiB or the shared library count limits. Input/output
temporary files are removed on completion. Cached results are keyed by both source
bytes and the converter/helper fingerprint, so importer updates invalidate old results.
Per-owner job metadata is limited to 32 jobs,
256 globally, expiring after 24 hours; the global disk budget defaults to 4 GiB
(`GRAFETTO_BRUSH_STORAGE_QUOTA_BYTES`), checked before uploads and CAS installation. Persisted queued/running jobs from an older
process report interrupted, never pretend they are still running.

Catalog writes take an exclusive PID directory lock, fsync and atomic rename. Lock
contention fails closed; a lock is recovered only when its owner PID no longer exists
(or a missing-PID startup lock is older than 30 seconds). All path identities are hashed; symlinks are rejected and asset
reads recheck SHA-256. Export streams a portable JSON `{library, assets}` bundle, assets
being base64 bytes keyed by asset ID. Export is exact archival data, not a vendor file.


The Linux importer starts in its own process group. Shutdown, deadline and worker
exit terminate that owned group, including SVG decoder children; completion waits
for the leader's close before work-directory cleanup or the next queued job.
Caller-supplied process IDs are never accepted. Other platforms retain child-only
termination, but the upload worker itself still requires Linux prlimit.

The server runtime must package scripts/brush-import, Python3/Pillow, util-linux
(prlimit), Node and the production Sharp dependency. The server Dockerfile now
includes them. Captured SVG is a bounded subset, not arbitrary full-SVG support;
unknown/external resources, fonts, filters and use/image elements fail closed.
The private renderer uses --jitless --v8-pool-size=1 --max-old-space-size=96 under
the same inherited1GiB address-space cap. SVG emits only PNG on stdout; startup
warnings go to stderr. No extra daemon, resource quota or import concurrency.

## Production stock and previews

Production uses the pinned, public Krita stock distribution and the redistributable
Deevad 25.01, Nylnook v2 Generic, GDQuest Lite v7 and Juank Prada Manga v1.0 sets recorded in
`scripts/brush-import/stock-catalog.json`; The Docker build verifies the bundled
archive SHA-256 before including it in the image. This replaces the QA-only operator
catalog for this configured deployment. Commercial/private uploaded packs are never
part of the image. CAS and owner/room references persist in the `brush_data` volume.

The image includes a dedicated static brush-preview entry, Chromium and the bounded
importer. `GRAFETTO_BRUSH_PREVIEW_ASSET_DIR` enables browser-local interception of
whitelisted immutable renderer assets: there is no extra HTTP listener and no dependency
on QA or the public frontend. `GRAFETTO_BRUSH_PREVIEW_SEED_DIR` supplies precomputed stock
samples; new personal uploads use the same sequential worker. Old recipe keys remain
readable, while changed recipes regenerate only their own versioned previews.

Third-party source hashes, licenses and links are recorded in `scripts/brush-import/stock-catalog.json`. Deevad, Nylnook and Juank Prada are CC0; GDQuest is CC BY 4.0. Presets are converted for Grafetto, and gallery information links to the authors and original license. Source demonstration artwork is not bundled.
