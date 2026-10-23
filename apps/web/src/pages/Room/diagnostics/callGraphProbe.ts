/** Opt-in synchronous call measurements for an isolated dev room.
 * Never imported by the app: device controllers load this module explicitly.
 * Elapsed time includes driver waits. This is not sampled CPU or GPU time. */
export interface CallStats {
  id: string
  calls: number
  totalMs: number
  selfMs: number
  maxMs: number
  errors: number
  histogram: number[]
}

export interface CallGraphReport {
  schema: 'grafetto-call-graph-v1'
  durationMs: number
  nodes: CallStats[]
  edges: Array<{ from: string; to: string; calls: number; totalMs: number }>
  phases: Record<string, CallStats[]>
  coverage: string[]
  limitations: string[]
}

export function startCallGraph(root: object, options: { depth?: number; maxObjects?: number; now?: () => number } = {}) {
  const now = options.now ?? (() => performance.now())
  const started = now(), nodes = new Map<string, CallStats>()
  const edges = new Map<string, { from: string; to: string; calls: number; totalMs: number }>()
  const phases = new Map<string, Map<string, CallStats>>()
  const stack: Array<{ id: string; childrenMs: number }> = []
  const restorers: Array<() => void> = [], seen = new WeakSet<object>(), coverage: string[] = []
  let phase = 'baseline', stopped = false, objects = 0
  const fresh = (id: string): CallStats => ({ id, calls: 0, totalMs: 0, selfMs: 0, maxMs: 0, errors: 0, histogram: Array<number>(48).fill(0) })
  const add = (stats: CallStats, elapsed: number, self: number, error: boolean) => {
    stats.calls++; stats.totalMs += elapsed; stats.selfMs += self
    stats.maxMs = Math.max(stats.maxMs, elapsed); stats.errors += Number(error)
    // Bounded logarithmic histogram, in microseconds; no per-call allocations.
    const bucket = Math.min(47, Math.max(0, Math.floor(Math.log2(1 + elapsed * 1000) * 2)))
    stats.histogram[bucket]++
  }
  const visit = (target: object, path: string, depth: number) => {
    if (seen.has(target) || objects >= (options.maxObjects ?? 128)) return
    const className = Object.getPrototypeOf(target)?.constructor?.name as unknown
    if (path !== 'engine' && (typeof className !== 'string' || /^(?:Object|Array|Map|Set|WeakMap|WeakSet|HTML|WebGL|Float|Uint|Int|ArrayBuffer|Window)/.test(className))) return
    seen.add(target); objects++
    const methods = new Map<PropertyKey, PropertyDescriptor>()
    let proto: object | null = target
    while (proto && proto !== Object.prototype) {
      for (const key of Reflect.ownKeys(proto)) {
        if (key === 'constructor' || methods.has(key)) continue
        const descriptor = Object.getOwnPropertyDescriptor(proto, key)
        if (descriptor && typeof descriptor.value === 'function') methods.set(key, descriptor)
      }
      proto = Object.getPrototypeOf(proto) as object | null
    }
    for (const [key, descriptor] of methods) {
      const original: unknown = descriptor.value
      if (typeof original !== 'function' || Function.prototype.toString.call(original).includes('[native code]')) continue
      const own = Object.getOwnPropertyDescriptor(target, key)
      if (own && (!own.configurable || own.writable === false)) continue
      const id = `${path}.${String(key)}`, stats = fresh(id)
      nodes.set(id, stats); coverage.push(id)
      const wrapper = function (this: unknown, ...args: unknown[]): unknown {
        if (stopped) return Reflect.apply(original, this, args)
        const parent = stack.at(-1), frame = { id, childrenMs: 0 }
        const callPhase = phase
        let phaseNodes = phases.get(callPhase)
        if (!phaseNodes) { phaseNodes = new Map(); phases.set(callPhase, phaseNodes) }
        let phaseStats = phaseNodes.get(id)
        if (!phaseStats) { phaseStats = fresh(id); phaseNodes.set(id, phaseStats) }
        const from = parent?.id ?? '(callback / unobserved caller)', edgeId = JSON.stringify([from, id])
        let edge = edges.get(edgeId)
        if (!edge) { edge = { from, to: id, calls: 0, totalMs: 0 }; edges.set(edgeId, edge) }
        stack.push(frame)
        const start = now()
        let error = true
        try {
          const result: unknown = Reflect.apply(original, this, args)
          error = false
          return result
        } finally {
          const elapsed = Math.max(0, now() - start), self = Math.max(0, elapsed - frame.childrenMs)
          stack.pop()
          if (parent) parent.childrenMs += elapsed
          add(stats, elapsed, self, error); add(phaseStats, elapsed, self, error)
          edge.calls++; edge.totalMs += elapsed
        }
      }
      Object.defineProperty(wrapper, 'name', { value: `probe:${id}` })
      try {
        Object.defineProperty(target, key, { value: wrapper, configurable: true, writable: true, enumerable: own?.enumerable ?? false })
        restorers.push(() => {
          if (Object.getOwnPropertyDescriptor(target, key)?.value !== wrapper) return
          if (own) Object.defineProperty(target, key, own)
          else Reflect.deleteProperty(target, key)
        })
      } catch { nodes.delete(id); coverage.pop() }
    }
    if (depth >= (options.depth ?? 2)) return
    for (const key of Reflect.ownKeys(target)) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key)
      const value: unknown = descriptor?.value
      if (value && typeof value === 'object') visit(value, `${path}.${String(key)}`, depth + 1)
    }
  }
  visit(root, 'engine', 0)
  return {
    setPhase(name: string) { phase = name },
    stop(): CallGraphReport {
      const durationMs = now() - started
      stopped = true
      for (const restore of restorers.reverse()) restore()
      return {
        schema: 'grafetto-call-graph-v1', durationMs,
        nodes: [...nodes.values()].filter(n => n.calls), edges: [...edges.values()],
        phases: Object.fromEntries([...phases].map(([name, stats]) => [name, [...stats.values()].filter(n => n.calls)])),
        coverage,
        limitations: [
          'Exact counts cover only intercepted instance methods; captured callbacks and standalone functions may be absent.',
          'Edges are nearest intercepted synchronous ancestors, not proof of a direct call across unobserved functions.',
          'Total is synchronous elapsed time including driver waits, not CPU or GPU time. Awaited promise lifetime is not measured.',
          'Self time excludes intercepted children only. Inclusive totals must not be added together.',
          'Instrumentation changes runtime. Compare against a separate uninstrumented control on the same device.',
          'Histogram percentiles are approximate; call counts, sums, means and maximum are measured directly.',
        ],
      }
    },
  }
}
