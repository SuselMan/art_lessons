# Export temporary ownership

Exporter keeps a call-local set of its composite, finishing and downsample
buffers. It retires a buffer from that set before deleting it, attempts all
remaining cleanup after an exception, and preserves the first error.
Allocation of finishing/downsample targets runs inside the protected call.
An unpublished composite is cleaned when clear or layer drawing fails.
Temporary buffers are retired before encoding starts or awaits its result.
No persistent owner, cache, registry, renderer, or asynchronous GL lease was added.

Exporter.cleanup.test.ts contains 19 fault/success cases: finishing allocation,
rendering, readback, first cleanup error, unpublished layer rendering, downsample
allocation/drawing, prior-target retirement, and cleanup before encoding.
Together with existing export sampling, nested-owner and Smudge tests, and
engine initialization rollback: 62 tests passed (7 files, maxWorkers=2).
Scoped lint and diff check passed. The first combined typecheck found only
four new union-return test callback errors; these were explicitly typed as
unknown results before the final common typecheck. Fresh combined web application
and service-worker typecheck 39037 passed. After that type-only test fix, the
19 focused exporter tests passed again.

Deletion attempts and reference retirement do not prove immediate driver heap
reclamation. The rendering and encoding algorithms and output dimensions stay
unchanged. No device resources were used for this ownership unit.
