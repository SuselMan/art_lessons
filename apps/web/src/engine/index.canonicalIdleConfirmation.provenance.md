# Idle canonical confirmation display

The existing original local-author path may finish an idle coordinator turn after a matching recorded receipt without publishing new pixels. `_stepCanonicalLayer` now invalidates the split cache and requests display only when a presentation has actually been published and its completed revision differs, or the actual checkpoint-ready cycle retires and changes the presentation source from derived to stable. It still removes the drained job and resets the existing author scheduler; all original authority checks and pending/dirty/rebuild processing remain.

Tests first: genuine prepared native Basic2 local open wash, actual pointer source author/adapter/envelopes, original matching confirmations: unchanged presentation revision but one redundant display (RED;16 prior author tests PASS). GREEN adds two actual local washes with reversed original recorded ordering, and END/stable handoff; existing actual typed-close test also asserts display. No fake coordinator or data-only original delivery.

A second genuine original control-only frame with no publication reproduced a blank idle display (RED1/prior17 PASS); the publishedPresentationReady guard closes it. The prior cold-target cancel regression now expects no artificial dirty mark from matching confirmation while retaining actual completion/zero-leak checks.

Scoped85tests/5suites PASS, maxWorkers2/testTimeout30000: canonicalAuthor18, canonicalLayerOwner18, canonicalOpenBaseline7, canonicalCancel11, coordinator.recorded31. Scoped oxlint0errors and diffcheck PASS. Application TypeScript remains pending the coordinated shared slot; no new SW source changed. No device/runtime resources were opened; this is host scheduling behavior, not hardware latency evidence.
