import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine as makeTestEngine } from './testing/engineTestUtils'
import type { PencilEngine } from './index'

interface Scratch { live: boolean }
interface PendingSettle { next: number; raf: number; ops: Array<() => void> }
interface SettleProbe {
  _settle: PendingSettle | null
  _strokeLayerId: string | null
  _opQueue: unknown[]
  settleBacklogMax: number
  _startSettle(scratch: Scratch, ops: Array<() => void>, complete: () => void): void
  _completeSettle(): void
  _cancelSettle(): void
  _scheduleFieldRelease(): void
}

// These are ordering and frame-budget tests. MockGL cannot check the picture;
// the recorded-log browser A/B covers that separately.
describe('watercolor settle execution order and frame budget', () => {
  let engine: PencilEngine
  let probe: SettleProbe
  let now: number
  let nextRaf: number
  let frames: Map<number, FrameRequestCallback>
  let events: string[]
  const scratch = (): Scratch => ({ live: true })
  const ops = (name: string, count: number): Array<() => void> =>
    Array.from({ length: count }, (_, i) => () => events.push(`${name}:${i}`))
  const frame = (elapsed = 16): void => {
    now += elapsed
    const id = probe._settle?.raf
    if (!id) throw new Error('no settle frame scheduled')
    const callback = frames.get(id)
    if (!callback) throw new Error('settle frame was cancelled')
    frames.delete(id)
    callback(now)
  }

  beforeEach(() => {
    now = 100; nextRaf = 1; frames = new Map(); events = []
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextRaf++; frames.set(id, callback); return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    engine = makeTestEngine({ paper: 'flat' }, { width: 16, height: 16 }).engine
    probe = engine as unknown as SettleProbe
    vi.spyOn(probe, '_scheduleFieldRelease').mockImplementation(() => events.push('release'))
  })
  afterEach(() => {
    if (probe) { probe._strokeLayerId = null; probe._opQueue = [] }
    engine?.destroy()
    vi.restoreAllMocks(); vi.unstubAllGlobals()
  })

  it('captures the first entry immediately and drains the remainder before completion', () => {
    probe._startSettle(scratch(), ops('a', 3), () => events.push('done'))
    expect(events).toEqual(['a:0'])
    const raf = probe._settle!.raf
    probe._completeSettle()
    expect(events).toEqual(['a:0', 'a:1', 'a:2', 'done', 'release'])
    expect(probe._settle).toBeNull()
    expect(frames.has(raf)).toBe(false)
  })

  it('lands an earlier plan before capturing a new one in the shared field', () => {
    probe._startSettle(scratch(), ops('a', 2), () => events.push('a:done'))
    probe._startSettle(scratch(), ops('b', 2), () => events.push('b:done'))
    expect(events).toEqual(['a:0', 'a:1', 'a:done', 'release', 'b:0'])
    probe._completeSettle()
    expect(events.slice(-3)).toEqual(['b:1', 'b:done', 'release'])
  })

  it('skips at most three late frames while drawing, then makes progress', () => {
    probe._strokeLayerId = 'L'
    probe._startSettle(scratch(), ops('a', 8), () => events.push('done'))
    frame()
    expect(events).toEqual(['a:0', 'a:1'])
    for (let i = 0; i < 3; i++) frame(25)
    expect(events).toEqual(['a:0', 'a:1'])
    frame(25)
    expect(events).toEqual(['a:0', 'a:1', 'a:2'])
    frame(16)
    expect(events).toEqual(['a:0', 'a:1', 'a:2', 'a:3'])
  })

  it('uses the backlog cap on an on-time frame, and only one entry on a late frame', () => {
    probe.settleBacklogMax = 2
    probe._opQueue = [{}, {}, {}]
    probe._startSettle(scratch(), ops('a', 8), () => events.push('done'))
    frame()
    expect(events).toEqual(['a:0', 'a:1', 'a:2'])
    frame(25)
    expect(events).toEqual(['a:0', 'a:1', 'a:2', 'a:3'])
    // The public cap is read live, rather than captured when a plan starts.
    probe.settleBacklogMax = 3
    frame(16)
    expect(events.slice(-3)).toEqual(['a:4', 'a:5', 'a:6'])
  })

  it('drops a dead scratch without writing back or completing it', () => {
    const s = scratch()
    probe._startSettle(s, ops('a', 3), () => events.push('done'))
    s.live = false
    frame()
    expect(events).toEqual(['a:0'])
    expect(probe._settle).toBeNull()
  })

  it('cancels a plan without landing remaining steps and cancels its frame', () => {
    probe._startSettle(scratch(), ops('a', 3), () => events.push('done'))
    const raf = probe._settle!.raf
    probe._cancelSettle()
    expect(events).toEqual(['a:0'])
    expect(probe._settle).toBeNull()
    expect(frames.has(raf)).toBe(false)
  })

  it('drains a plan started by the completion callback before returning', () => {
    probe._startSettle(scratch(), ops('a', 2), () => {
      events.push('a:done')
      probe._startSettle(scratch(), ops('b', 2), () => events.push('b:done'))
    })
    probe._completeSettle()
    expect(events).toEqual(['a:0', 'a:1', 'a:done', 'b:0', 'release', 'b:1', 'b:done', 'release'])
    expect(probe._settle).toBeNull()
  })

  it('completes an empty plan at the scheduled frame boundary', () => {
    probe._startSettle(scratch(), [], () => events.push('done'))
    expect(events).toEqual([])
    frame()
    expect(events).toEqual(['done', 'release'])
    expect(probe._settle).toBeNull()
  })
})
