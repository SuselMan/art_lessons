import { describe, expect, it } from 'vitest'

import { createReplayGate } from './replayGate'

describe('replayGate (#536 §17.49)', () => {
  it('passes everything through while open', () => {
    const gate = createReplayGate<number>()
    expect(gate.hold(1)).toBe(false)
  })

  it('holds arrivals while shut and releases them in order when opened', () => {
    const seen: number[] = []
    const gate = createReplayGate<number>()
    gate.setHandler(n => seen.push(n))
    gate.begin()
    expect(gate.hold(7)).toBe(true)
    expect(gate.hold(8)).toBe(true)
    expect(seen).toEqual([])
    gate.end()
    expect(seen).toEqual([7, 8])
    // Open again: the next one is the caller's to handle.
    expect(gate.hold(9)).toBe(false)
    expect(seen).toEqual([7, 8])
  })

  it('lets a released payload reach the handler with the gate already open', () => {
    // The handler is the ordinary confirmed-operation handler, which asks the
    // gate first: it must not be held a second time on its way out.
    const gate = createReplayGate<number>()
    const seen: number[] = []
    gate.setHandler(n => { if (!gate.hold(n)) seen.push(n) })
    gate.begin()
    gate.hold(1)
    gate.end()
    expect(seen).toEqual([1])
  })
})
