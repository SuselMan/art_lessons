export function assertResumeReadiness(state,expectedSeq=5){
 if(!state||!state.owner||!state.contentReady||!state.snapshotReady||state.incomplete||!state.ready||(!state.coveredExpectedSeq||state.coveredNextSeq))throw Error('Authoritative restored material readiness required');
}
export function actualMaterialReady(){const s=window.__roomMaterialReady?.();return !!(s?.owner&&s.contentReady&&s.snapshotReady&&!s.incomplete&&s.ready)}
