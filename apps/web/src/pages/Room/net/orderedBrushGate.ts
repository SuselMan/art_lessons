/** Incoming room events share one dispatch order while imported masks download.
 * Built-in-only events stay synchronous. A failed or cancelled gate never resumes. */
const MAX_QUEUED_EVENTS = 512
type Apply = () => unknown
type Presets = (string | undefined)[] | (() => (string | undefined)[])
type Resources = () => Promise<void> | null
type Item = { presets: Presets; apply: Apply; isCurrent?: () => boolean; resources?: Resources }

export function createOrderedBrushGate(
  prepare: (presets: (string | undefined)[]) => Promise<void> | null,
  onError: (error: unknown) => void,
): { dispatch: (presets: Presets, apply: Apply, isCurrent?: () => boolean, prepareResources?: Resources) => void; cancel: () => void } {
  const queue: Item[] = []
  let active = true
  let waiting = false
  let draining = false
  const fail = (error: unknown) => {
    if (!active) return
    active = false
    queue.length = 0
    onError(error)
  }
  const current = (event: Item) => !event.isCurrent || event.isCurrent()
  const applyEvent = (apply: Apply): void => {
    try {
      const pending = apply()
      if (pending) void Promise.resolve(pending).catch(fail)
    } catch (error) { fail(error) }
  }
  const finish = (event: Item): void => {
    queue.shift()
    if (active && current(event)) applyEvent(event.apply)
  }
  const reject = (event: Item, error: unknown): void => {
    waiting = false
    if (!active) return
    try {
      if (!current(event)) { queue.shift(); drain(); return }
    } catch (currentError) { fail(currentError); return }
    fail(error)
  }
  const resources = (event: Item): void => {
    if (!current(event)) { queue.shift(); return }
    const pending = event.resources?.()
    if (!pending) { finish(event); return }
    waiting = true
    void pending.then(() => {
      waiting = false
      if (!active) return
      try { finish(event); drain() } catch (error) { fail(error) }
    }, error => reject(event, error))
  }
  const drain = (): void => {
    if (!active || waiting || draining) return
    draining = true
    try {
      while (active && !waiting && queue.length > 0) {
        const event = queue[0]
        try {
          if (!current(event)) { queue.shift(); continue }
          const pending = prepare(typeof event.presets === 'function' ? event.presets() : event.presets)
          if (pending) {
            waiting = true
            void pending.then(() => {
              waiting = false
              if (!active) return
              try { resources(event); drain() } catch (error) { reject(event, error) }
            }, error => reject(event, error))
          } else resources(event)
        } catch (error) { reject(event, error) }
      }
    } finally { draining = false }
  }
  return {
    dispatch: (presets, apply, isCurrent, prepareResources) => {
      if (!active) return
      if (queue.length >= MAX_QUEUED_EVENTS) { fail(new Error('Brush event queue overflow')); return }
      queue.push({ presets, apply, isCurrent, resources: prepareResources })
      drain()
    },
    cancel: () => { active = false; queue.length = 0 },
  }
}
