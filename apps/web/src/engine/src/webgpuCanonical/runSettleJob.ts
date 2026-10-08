/** A synchronous scope preserves the original command stream and Q8 writes.
 * Grouping is for the serial bounded runner only; no live frame scheduler. */
export interface CanonicalSettleJob {
 readonly ops: readonly (() => void)[]
 finish(): void
 dispose(): void
}
export interface CanonicalQuantumScope<C> {
 runQuantum<T>(task: (context: C) => T): T
}
export function runCanonicalSettleJob<C>(scope: CanonicalQuantumScope<C>, job: CanonicalSettleJob, composite: (context: C) => void, grouped = false): void {
 if (grouped) {
  scope.runQuantum(context => {
   try { for (const op of job.ops) op(); job.finish(); composite(context) }
   finally { job.dispose() }
  })
 } else {
  try {
   for (const op of job.ops) scope.runQuantum(() => op())
   scope.runQuantum(context => { job.finish(); composite(context) })
  } finally { scope.runQuantum(() => job.dispose()) }
 }
}
