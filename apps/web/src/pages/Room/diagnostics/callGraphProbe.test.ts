import { describe, expect, it } from 'vitest'
import { startCallGraph } from './callGraphProbe'

describe('opt-in synchronous call graph', () => {
  it('counts nested calls and separates inclusive and intercepted self time', () => {
    let clock = 0
    class Engine {
      child() { clock += 3; return 42 }
      parent() { clock += 2; const value = this.child(); clock += 1; return value }
    }
    const engine = new Engine(), original = engine.parent
    const probe = startCallGraph(engine, { now: () => clock })
    expect(engine.parent()).toBe(42)
    const report = probe.stop()
    expect(engine.parent).toBe(original)
    expect(report.nodes.find(n => n.id === 'engine.parent')).toMatchObject({ calls: 1, totalMs: 6, selfMs: 3 })
    expect(report.nodes.find(n => n.id === 'engine.child')).toMatchObject({ calls: 1, totalMs: 3, selfMs: 3 })
    expect(report.edges.find(e => e.from === 'engine.parent')).toMatchObject({ to: 'engine.child', calls: 1, totalMs: 3 })
    expect(Object.hasOwn(engine, 'parent')).toBe(false)
  })

  it('preserves thrown exceptions, return identity, receiver and own descriptors', () => {
    const failure = new Error('test')
    class Engine {
      fail() { throw failure }
      own = () => this
    }
    const engine = new Engine(), descriptor = Object.getOwnPropertyDescriptor(engine, 'own')
    const probe = startCallGraph(engine)
    expect(engine.own()).toBe(engine)
    expect(() => engine.fail()).toThrow(failure)
    const report = probe.stop()
    expect(report.nodes.find(n => n.id === 'engine.fail')?.errors).toBe(1)
    expect(Object.getOwnPropertyDescriptor(engine, 'own')).toEqual(descriptor)
  })

  it('does not turn returned promises into a measurement of asynchronous work', async () => {
    let clock = 0
    const promise = Promise.resolve('result')
    class Engine { asyncReturn() { clock += 2; return promise } }
    const engine = new Engine(), probe = startCallGraph(engine, { now: () => clock })
    probe.setPhase('active')
    expect(engine.asyncReturn()).toBe(promise)
    clock += 500
    await promise
    expect(probe.stop().phases.active[0]).toMatchObject({ calls: 1, totalMs: 2 })
  })

  it('keeps same-named collaborators separate and does not overwrite a later replacement', () => {
    class Worker { run() { return 1 } }
    class Engine { a = new Worker(); b = new Worker() }
    const engine = new Engine(), probe = startCallGraph(engine)
    engine.a.run(); engine.b.run()
    const replacement = () => 5
    engine.a.run = replacement
    expect(probe.stop().nodes.map(n => n.id).sort()).toEqual(['engine.a.run', 'engine.b.run'])
    expect(engine.a.run).toBe(replacement)
    expect(Object.hasOwn(engine.b, 'run')).toBe(false)
  })
})
