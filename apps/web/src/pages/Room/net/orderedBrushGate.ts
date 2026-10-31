/** Incoming room events share one dispatch order while imported masks download.
 * Built-in-only events stay synchronous. A failed or cancelled gate never resumes. */
const MAX_QUEUED_EVENTS = 512
type Apply = () => unknown
type Presets = (string | undefined)[] | (() => (string | undefined)[])

export function createOrderedBrushGate(
  prepare: (presets: (string | undefined)[]) => Promise<void> | null,
  onError: (error: unknown) => void,
): { dispatch: (presets: Presets, apply: Apply, isCurrent?: () => boolean) => void; cancel: () => void } {
  const queue: { presets: Presets; apply: Apply; isCurrent?: () => boolean }[] = []
  let active = true
  let waiting = false
  const fail = (error: unknown) => {
    if (!active) return
    active = false
    queue.length = 0
    onError(error)
  }
  const applyEvent = (apply: Apply): void => {
    try {
      const pending = apply()
      if (pending) void Promise.resolve(pending).catch(fail)
    } catch (error) { fail(error) }
  }
  const drain = (): void => {
    if (!active || waiting) return
    while (active && queue.length > 0) {
      const event = queue[0]
      let pending: Promise<void> | null
      try {
        if (event.isCurrent && !event.isCurrent()) { queue.shift(); continue }
        pending = prepare(typeof event.presets === 'function' ? event.presets() : event.presets)
      } catch (error) { fail(error); return }
      if (pending) {
        waiting = true
        void pending.then(() => {
          waiting = false
          if (!active) return
          queue.shift()
          applyEvent(() => { if (!event.isCurrent || event.isCurrent()) return event.apply() })
          drain()
        }, fail)
        return
      }
      queue.shift()
      applyEvent(() => { if (!event.isCurrent || event.isCurrent()) return event.apply() })
    }
  }
  return {
    dispatch: (presets, apply, isCurrent) => {
      if (!active) return
      if (queue.length >= MAX_QUEUED_EVENTS) { fail(new Error('Brush event queue overflow')); return }
      queue.push({ presets, apply, isCurrent })
      drain()
    },
    cancel: () => { active = false; queue.length = 0 },
  }
}
