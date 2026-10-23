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
before the operation log can accept them. Forks copy references before publishing the DB
copy. No deletion/GC can remove historical assets; snapshots do not release references.

`GRAFETTO_BRUSH_LIBRARY_DIR` remains an explicit operator-only QA deployment option;
leave unset in production. Without persistent storage imports return 503. The optional
operator library is visible to that instance's users and must only be used behind its
private QA access protection.

One conversion worker, four queued uploads, one pending job per owner, 512 MiB streamed input,
120 s wall time, 110 s CPU, 1 GiB address space, 512 MiB file size; Linux `prlimit` is
required. Set `GRAFETTO_BRUSH_IMPORT_PYTHON` to the Python/Pillow executable. Converter
output is validated before installation (2 MiB manifest, 256 MiB textures); an owner's
combined assets cannot exceed 256 MiB or the shared library count limits. Input/output
temporary files are removed on completion. Per-owner job metadata is limited to 32 jobs,
256 globally, expiring after 24 hours; the global disk budget defaults to 4 GiB
(`GRAFETTO_BRUSH_STORAGE_QUOTA_BYTES`), checked before uploads and CAS installation. Persisted queued/running jobs from an older
process report interrupted, never pretend they are still running.

Catalog writes take an exclusive PID directory lock, fsync and atomic rename. Lock
contention fails closed; a lock is recovered only when its owner PID no longer exists
(or a missing-PID startup lock is older than 30 seconds). All path identities are hashed; symlinks are rejected and asset
reads recheck SHA-256. Export streams a portable JSON `{library, assets}` bundle, assets
being base64 bytes keyed by asset ID. Export is exact archival data, not a vendor file.
