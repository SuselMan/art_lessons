# #744: optional CPU Undo cache versus queued physical repair

Isolated candidate fromb05ae710. Integration runtime untouched, default diagnostic flag remainsOFF.

Two32px MockGL regressions exercise real public paths: a confirmed foreign WC operation overtakes a pending own stroke, leaving `_unsettledLayers`; an accepted foreign Undo inside `suspendDisplay` leaves `_pendingRebuilds`. In both, the prior physical source can still have a solved goal although it is not the accepted journal's canonical material. The baseline incorrectly captures it on the nextDOWN (`undoCaptures0→1`). Exact journal identity does not prove physical material was repaired.

The narrow fix refuses optional capture and restore for that target while unsettled, pending or running replay exists. It does not clear repair queues, blockDOWN, affect other layers or change any physics/protocol. Existing replay remains the fallback.

Validation: baseline2admission failures; afterfix17tests/2filesPASS, web TypeScriptPASS, scoped lint no new warnings. Existing15fastUndo/negative cases still pass. This is an admission-invariant regression, not GPU pixel-corruption proof. A cancelled foreign-tail exploratory scenario repaired itself before the intended precondition, so it is not presented as a failing counterexample. Actual native extra-computation stacks remain separately required.
