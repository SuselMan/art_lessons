/** Coarse residual solver for the symmetric brush exchange, not a backtrace.
 * A jump of J has J² times a unit exchange's spatial second moment. Split the
 * original integrated exposure among scales, retain its second moment, and
 * finish locally so residue classes on the coarse lattice communicate.
 * This is a different material experiment, never an exact v4 optimization. */
export function multilevelContactSchedule(pulses: number, gain: number, maxJump: 0 | 4 | 8): Array<{ jump: number; count: number; gain: number; mixScale: number }> {
  if (!maxJump || pulses < 2) return [{ jump: 1, count: pulses, gain, mixScale: 1 }]
  // Short chronological contacts dominate normal input. One real nonlocal
  // exchange replaces their 2..7 local pulses, rather than bypassing transport.
  // Pick J² >= count to preserve the original CFL/capacity bound as well.
  if (pulses < 8) {
    const jump = maxJump === 8 || pulses > 4 ? 4 : 2
    const mixScale = pulses / (jump * jump)
    return [{ jump, count: 1, gain: gain * mixScale, mixScale }]
  }
  const hierarchy = maxJump === 8 ? [[8, .60], [4, .25], [2, .10], [1, .05]] : [[4, .65], [2, .25], [1, .10]]
  return hierarchy.map(([jump, weight]) => {
    const count = Math.max(1, Math.ceil(pulses * weight / (jump * jump)))
    const mixScale = pulses * weight / (count * jump * jump)
    return { jump, count, gain: gain * mixScale, mixScale }
  })
}
