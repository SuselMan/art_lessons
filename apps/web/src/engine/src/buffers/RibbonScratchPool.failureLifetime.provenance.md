# Scratch pool retirement faults (2026-10-31)

Idle pool destruction/trimming now detaches ownership before attempting every
owned child. Over-ceiling release detaches its consumed entry before driver
cleanup, so an error cannot publish a retired buffer as live or retry it later.
Per-size and byte ceilings, live borrower ownership, prepared acquisitions and
lost-context forget behavior keep their existing semantics. No second allocator,
pool, ledger or background cleanup task is introduced.

Four fault tests first failed on the previous code and now pass: independent
idle destruction, trimFree beside a held acquisition, trimming two overfull size
classes despite one child failure, and consumed over-ceiling release. With
admission/ownership/encoding/presentation regressions35 tests PASS. Scoped oxlint
and diffcheck PASS. Common app+SW check is coordinated with the paired room-state
unit. These are MockGL ownership tests, not physical driver-memory measurements;
uncertain deletion/orphan accounting stays with ContextStorageOwner. No runtime
service, browser context, disposable build or dependency copy was created.
