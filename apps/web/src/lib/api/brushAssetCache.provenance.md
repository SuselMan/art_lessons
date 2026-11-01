# Optional brush asset disk writer

The existing `grafetto-brush-assets-v1` CacheStorage cache remains optional. The
caller in `brushLibrary.ts` intentionally does not await its write. One module
scalar admits at most one accepted writer before `data.slice()`: concurrent
requests resolve without copying or queuing work. The accepted writer still
captures its input immediately, so later caller mutation cannot change its
snapshot. Copy/open/put/enumeration/eviction failures remain optional and the
same terminal `finally` releases admission.

`Cache.put` replaces an existing entry; the writer no longer deletes that exact
CAS entry before attempting the replacement. A failed `put` therefore does not
first remove a usable backing entry. Successful writes retain the existing
192 MiB disk byte-limit eviction. This is insertion/replacement order, not a
claim that reads or replacements refresh an LRU.

Tests first reproduced four failures in the old implementation: copies during
held open/put, deletion before failed replacement, and synchronous copy failure.
Controlled CacheStorage promises verify busy calls do not become a delayed
queue, snapshot independence, next admission after failure, old entry survival,
missing-browser-global behavior, and unchanged disk-limit eviction.

This bounds the extra accepted writer snapshot to one active operation. It does
not account or fix the global imported raw-pixel Map, WebCrypto copies, active
response bodies, engine CPU/GPU memory, or browser-internal CacheStorage heap.
Skipped optional writes do not guarantee offline availability; normal verified
network loading remains the existing fallback. No cache name, disk limit,
source authority, engine, server, or public API changed. No device/performance
or OOM claim follows from these HOST tests.
