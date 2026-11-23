import type { QaBackgroundWork } from './qaBackgroundWork.js'

// Unset in normal Grafetto. A QA boot path may install this before accepting
// requests, after DB identity/lease verification. No collector is installed.
let tracker: QaBackgroundWork | undefined

export function setQaBackgroundTracker(value: QaBackgroundWork | undefined): void {
  tracker = value
}

export function runQaTrackedBackground<T>(run: () => Promise<T>): Promise<T> {
  return tracker ? tracker.start(run) : run()
}

/** Some legacy jobs intentionally swallow their own error; retain that API
 * while making the QA retention collector fail closed after any such failure. */
export function noteQaBackgroundFailure(): void {
  tracker?.noteFailure()
}
