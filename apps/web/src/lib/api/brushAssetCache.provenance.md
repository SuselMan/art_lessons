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

## Exact-size body assembly

Network and optional CacheStorage reads share one expected-size streaming body helper. ExpectedBytes comes from the existing validated asset side² (2..2048), never Content-Length. Exactly one owned output is allocated; chunks are copied directly only after remaining-space checks and actual EOF is required. Oversize/truncation/read failure cancels the reader and attempts releaseLock before awaiting cancellation; original failure survives cleanup errors. Optional cache failures returnnull and normal network/SHA/install remain authoritative. The existing optional one-writer-before-snapshot unit is unchanged.

This is not unified raw residency/accounting or a process heap/OOM fix. Browser/CacheStorage may allocate the current chunk externally; WebCrypto snapshot, pixel install copy, optional disk snapshot, rawMap lifetime and existing scoped pending work remain unchanged. No new callerAbort/current interface, queue/store/cache or cap. Actual cold/original capability checks remain the same; successful body assembly alone is not asset readiness or drawing authority.

RAM gates: actual old API semantic RED2/2 (oversized cache returns5 bytes instead ofnull; old network invokes arrayBuffer before length rejection). Final55tests/2suitesPASS includes prior optional writer tests, actual cache partial/trailing fallback and existing fetch timeout body cleanup. Strict actualapp options +explicitNode testambient4roots/278inputs/0diagnostics. V3 differs from executedV2 only erased test ArrayBuffer generic; transpiled output identical. Oxlint exact4RAM TS files0errors/0warnings; no actualsource writes. This is not browser/device/OOM/native performance proof.
