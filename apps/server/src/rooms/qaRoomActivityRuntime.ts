import type { QaActivityGate } from './qaActivityGate.js'
import type { QaRoomActivity } from './qaRoomActivity.js'

/** QA opt-in only. Install before opening the server, after verifying identity
 * and exclusive database access. This module never starts a collector. */
let runtime: { gate: QaActivityGate; activity: QaRoomActivity } | undefined

export function setQaRoomActivityRuntime(value: typeof runtime): void { runtime = value }

export function qaRoomActivityForGate(gate: QaActivityGate | undefined): QaRoomActivity | undefined {
  if (!runtime) return undefined
  if (runtime.gate !== gate) throw new Error('QA room activity requires its matching gate')
  return runtime.activity
}

/** Called synchronously when the last participant leaves a lesson, regardless
 * of whether it was a disconnect, a room switch, or an administrative kick. */
export function noteQaLastDeparture(lessonId: string): void {
  if (!runtime) return
  const { gate, activity } = runtime
  const release = gate.tryEnter()
  if (!release) {
    // Unexpected producer during collection is unsafe. Future collections
    // must remain disabled; the current collector needs separate fencing.
    activity.invalidate()
    return
  }
  void activity.closed(lessonId).catch(error => {
    console.error('QA room activity departure write failed', error)
  }).finally(release)
}
