# #781: M70 accepted-order repair must not wait for legacy wash joining

Native Samsung transport-loss reproduction (runtime82313a4c) leaves an accepted Bseq1 before already-painted optimistic Aseq2. App WebSocket was genuinely CLOSED during trusted native A UP, with one pending operation. Both accepted IDs are present in complete API history.

Readonly/public-engine CPU baseline identifies the100000ms WASH_JOIN_MS hold in _settleLayers. M70 still keeps a _wash reference for its controller-owned scratch; this legacy join hold delays an owed accepted-order repair despite having a complete journal. A fresh native baseline captured actualunsettled=true, no jobs/pending-rebuild/opqueue, goalReady=true; canonical differs in11651channels/max28. Without forced mutation, after96261ms more the natural queued repair converges exactly. Later dependentB, AUndo/Redo and fresh-context rejoin also converge. Thus this is a long visible transient ordering defect, not permanent loss or an isolated clockfix regression.

Candidate bypasses only the legacy delay when wash identity is M70 for that layer and the controller has real resident or parked material. It does not clear/close/destroy the wash, mutate water provenance, or force unrelated layers to replay. Existing recorded-journal rebuilding preserves M70 water and its order. Legacy wash delay remains unchanged.

CPU baseline expected replay B→A but saw only B during the immediate catchup; it fails before the patch. Two focused cases pass after it: actual _noteOvertaken observes unsettled=true, accepted replay proceeds B→A, unsettled clears; untouched other-layer water remains material; legacy counterpart remains unsettled and does not rebuild early.

Cacheguard regression originally depended on the now-fixed M70 delay to hold the dirty source. It now uses a real suspendDisplay batch to keep actual physical repair pending, preserving its original capture-admission guarantee without seeding flags. Focused4files17testsPASS; webtypecheck and scopedlintPASS. Integration source remains frozen pending root review and native post-fix proof.
