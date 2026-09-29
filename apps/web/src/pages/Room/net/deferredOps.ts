import type { Operation } from '@grafetto/shared'

/** (#169) Applies every deferred meta-op (an undo/redo/revoke whose target had
 *  not arrived yet) whose target is now known, in the order they originally
 *  arrived, and hands back the ones still waiting.
 *
 *  `isKnown` is asked afresh for each operation, after the ones before it were
 *  applied — so an operation whose target is an earlier entry of this same
 *  queue goes in the same pass rather than waiting for the next backfill page.
 *  An operation with no target at all never becomes ready: nothing would ever
 *  have deferred it. */
export function drainDeferredOps(
  queue: readonly Operation[],
  isKnown: (opId: string) => boolean,
  apply: (op: Operation) => void,
): { stillDeferred: Operation[]; appliedAny: boolean } {
  const stillDeferred: Operation[] = []
  let appliedAny = false
  for (const op of queue) {
    const targetId = 'targetOpId' in op ? op.targetOpId : undefined
    if (targetId !== undefined && isKnown(targetId)) {
      apply(op)
      appliedAny = true
    } else {
      stillDeferred.push(op)
    }
  }
  return { stillDeferred, appliedAny }
}
