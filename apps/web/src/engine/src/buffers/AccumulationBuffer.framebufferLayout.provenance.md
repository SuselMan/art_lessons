# Cold straight-framebuffer layout evidence (2026-10-31)

Every new straight RGBA8 buffer now checks framebuffer completeness AND actual
COLOR_ATTACHMENT0 identity before publishing its handles/storage lease. The
legacy PM allocation path retains its previous one-status-check/context behavior.
A failed status/attachment/query unwinds the unpublished allocation via the
existing constructor transaction, with no layout metadata published.

verifiedFramebufferLayout returns one frozen per-buffer {gl,texture,framebuffer,
width,height} object only while actual handles/geometry and migrated lease owner
remain current. Destruction, handle drift or storage-generation forget revokes
that getter. Repeated reads do not query the driver or allocate another layout.
This is internal allocation evidence, never wire/author/room permission. Resource
owners must forbid in-place reattachment during a borrow; ordinary JS identity
cannot detect arbitrary hostile raw GL mutations. Foreign mutable targets keep
hardware guards. A separate batch consumer must validate certificate and owner
before/after acquisition and each binding.

MockGL now exposes its real tracked framebuffer attachment through the standard
WebGL query/enum, rather than faking an always-correct result. Five new cases
include three fault variants;30 focused buffer/storage/admission tests PASS and
198 existing pass/executor/prepass/layer/presentation regressions PASS. Scoped
oxlint/diffcheck PASS. Combined webapp+SW75065 PASS includes the paired batch consumer; that
consumer's actual-device proof is separate. No GPU math, source
profile, engine activation, runtime process or disposable build changed here.
