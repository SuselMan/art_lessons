# Engine initialization retirement (2026-10-31)

The existing _initGL now holds a constructor-local reverse-order cleanup list.
Each independent existing owner is registered before its initialization; direct
engine programs, shared VBOs and accumulation buffers are retained as local names
until successful return. Partial initialization failure attempts every registered
owner and preserves the triggering exception. No context reset, second long-lived
GPU owner or new rendering path is introduced. The returned rollback is used only
if the remainder of that same constructor fails; normal lifetime uses destroy.

Constructor failure also deactivates/destroys paper and removes its subscriptions
and an initialized pointer owner. A failed constructor does not call the public
complete-engine destructor. Existing straight-room/canonical-renderer guards and
Infinity storage policy remain unchanged.

Tests first reproduced five leaks (program#5/#20, buffer#4, texture#3 and paper
initialization). Those now pass. A sixth case injects failure at final scheduling:
all installed subscriptions are removed, successful programs retire once, foreign
program/texture names remain borrowed and migrated storage counters return to0.
Existing lifecycle/context restore regressions pass (14 cases); combined web
app+SW typecheck PASS. Scoped oxlint has only pre-existing index.ts warnings.

This establishes the outer initialization transaction, not complete cleanup under
arbitrary nested destructor/driver faults. Independent children must also unwind
partial construction and attempt all their own names; that work remains separate.
No finite whole-GPU policy or real-device failure recovery is claimed. No runtime
service, browser or disposable build was created by this unit.
