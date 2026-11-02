# Original interrupted-close receipt — RAM only

Base: e4f0326444915bcc5a298638f7657f903ae6e37f, the actual committed accepted-source capture unit. Coordinator/test input SHAs equal its reviewed outputs. Executor is an unchanged Git dependency; no source API or grant is added. Earlier pending-base V3 artifacts and all failed receipts remain preserved separately.

## Scope and ownership

Only the buildupReplay7 owner opt-in uses the new close transaction. Historical wash admission follows its existing wrapper/body. There is no renderer, source permission, queue frame, fake END, snapshot group, readiness activation or close operation appended to the frame journal.

An accepted close owns the SAME issued original input, frozen verifier seal and SAME preclose RecordedPrefix. Entry.recorded receives a distinct frozen sealed-prefix copy; receipt.prefix deliberately remains the original unsealed prefix. Busy is claimed before the first external assertion. Original delivery/lifetime/layers and the accepted source view are asserted before a final pure entry/prefix/source/generation/sequence CAS. Receipt, sealed-prefix, lastSequence and metadata-only revision hint then publish without callbacks between assignments.

The closed normalized operation has seven bounded UTF-16 texts, each at most 256 code units. SAME existing CPU reserves 1024 fixed + 7*256*2 = 4608 logical bytes before persistent seal/receipt/sealed-prefix allocation. No read/capability payload is accepted on a close. This is existing logical accounting, not literal JavaScript heap accounting. No budget is increased.

Entry.replayPins delays base and close metadata retirement. Release ownership is detached/idempotent before callbacks; both releases are attempted. Rollback cleanup failure is fatal for buildup and the primary exception, including thrown undefined, is preserved.

## Exact limits

The pin test uses the existing frame-only ReplaySnapshot.values and Entry metadata lifecycle. It does not expose a captured close tuple/group or prove latest-control readiness. An earlier OPEN snapshot never gains close authority from a later Entry.sealed flag. Exact captured-entry groups and publication remain separate work.

The real bank.reset negative keeps original scope and prepared mask/composite epochs current while invalidating the accepted source view. Such a close is refused before receipt/prefix/sequence publication and its staging CPU returns to baseline. No resource rebinding or new grant occurs.

## Recorded gates

- Initial original-close API baseline: 1 FAIL / 46 skipped, because old code accepted the valid close but retained no SAME input.
- Pre-source V1 touched suite: 47/1 PASS. Its strict run found one optional callback inference error. V2 added only the explicit optional release type; identical emitted JavaScript is recorded.
- Source-composed V4: 140/6 PASS, strict 2 roots / 127 inputs / 0 diagnostics. The earlier expected 191/8 count was mistaken: this RAM config deliberately includes softNative plus Coordinator suites, without the two index suites ROOT runs after apply.
- V4 source-current regression baseline: 1 FAIL / 140 skipped. The real revoked-root/unchanged-capacity preconditions passed, but old V4 still accepted the close.
- Final V5: 141/6 PASS; strict actual app options, 2 roots / 127 pinned Git+RAM inputs / 0 diagnostics. All gate processes are reaped and frozen before/after input hashes match.

Finalization changes this provenance only; executable Coordinator and test bytes equal the V5 gated map. No lint0 claim: actual lint and wider coherent controls belong to ROOT after review/apply. Actual repository source remains untouched by this unit. No device, browser, runtime, dependencies or disposable resources were created.

ROOT actual worktree validation: 192 tests / 8 suites PASS; full web strict check 1194 roots / 1351 consumed application inputs / 0 diagnostics, all consumed hashes rechecked. oxlint --fix exit0 with executable bytes unchanged and three existing warnings in touched files; architecture check/rules exit0 with 32 dependency warnings. No source policy/index/rendering/readiness expansion or hardware/online buildup claim. Captured-close snapshot groups and coherent stable handoff remain separate work.
