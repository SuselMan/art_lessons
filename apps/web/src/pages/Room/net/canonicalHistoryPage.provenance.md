# Captured canonical history reader (2026-10-31)

The existing HTTP history and snapshot dependency walk now prepare the whole
closed capability page before loading presets or touching layer/pixel/log sinks.
Authority comes only from a supplied captured room-state scope and its current
local generation callback. A bounded immutable copy of the receiver allowset
admits old/new recorded profiles independently of the author profile. The same
copy rule applies to confirmedStream. Ambiguous singleton+list policy rejects.

Prepared operation/read atoms stay together through an explicit canonical sink;
legacy callers keep their array callbacks and original callback argument counts.
Malformed, unattached, expired or unscoped procedural pages fail closed and are
never converted to successful empty/end-of-history results. Snapshot authority
failure is nonretriable before layer creation. Preset/blob awaits recheck lifetime.

Verification: history/snapshot/confirmed scoped suite55 PASS; previous ordinary
confirmed/snapshot/history regressions62 PASS. Web application+SW typecheck and
scoped oxlint recorded in fixes-v52/history-page-* and history-pool-lint.log.
These are lifecycle/authority tests, not WebGL pixel or real editor activation
proofs. Room engine source reader/renderer activation remains separately gated;
no service, browser, dependency copy, push or deploy was created by this unit.
