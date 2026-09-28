import { describe, expect, it } from 'vitest'

import { createLatencyMeter, LIVE_LATENCY_BUDGET_MS, liveTiming, noteLivePacketPainted } from './liveLatency'
import { createServerClock, sampleFromRound, syncServerClock } from './serverClock'

/** (#432) The meter's arithmetic. What a real round trip and a real frame do
 *  is the e2e's to show; this pins what is done with them. */

describe('serverClock', () => {
  it('puts the server’s answer halfway through the round trip', () => {
    // Sent at local 1000, back at 1100; the server said 5050 — so at local
    // 1050 the server read 5050, and the offset is 4000 either way round.
    expect(sampleFromRound(1000, 5050, 1100)).toEqual({ offset: 4000, rtt: 100 })
  })

  it('keeps the fastest round, because a slow one waited somewhere', () => {
    let local = 0
    const clock = createServerClock(() => local)
    clock.add({ offset: 4000, rtt: 80 })
    clock.add({ offset: 4700, rtt: 900 }) // queued behind something: ignored
    clock.add({ offset: 4010, rtt: 20 })
    local = 100
    expect(clock.serverNow()).toBe(4110)
    expect(clock.uncertainty()).toBe(10)
  })

  it('knows nothing until one round is in, and forgets on reset', () => {
    const clock = createServerClock(() => 0)
    expect(clock.serverNow()).toBeNull()
    clock.add({ offset: 5, rtt: 2 })
    clock.reset()
    expect(clock.serverNow()).toBeNull()
  })

  it('a sync runs its rounds and ends with the best of them', async () => {
    let local = 0
    const clock = createServerClock(() => local)
    const trips = [300, 40, 120]
    await syncServerClock(async () => {
      const trip = trips.shift()!
      const serverNow = local + 10_000 + trip / 2
      local += trip
      return serverNow
    }, 3, clock, () => local)
    expect(clock.uncertainty()).toBe(20)
    expect(clock.serverNow()! - local).toBe(10_000)
  })
})

describe('the meter', () => {
  it('stamps nothing until the clock has synced', () => {
    expect(liveTiming([{ t: 0 }, { t: 50 }], createServerClock())).toEqual({})
  })

  it('stamps the send time and the age of the oldest dab', () => {
    const clock = createServerClock(() => 1000)
    clock.add({ offset: 500, rtt: 4 })
    expect(liveTiming([{ t: 120 }, { t: 150 }, { t: 178 }], clock)).toEqual({ sentAt: 1500, penAgeMs: 58 })
  })

  it('measures pen to ink on the next frame, on the server clock', () => {
    let local = 0
    const clock = createServerClock(() => local)
    clock.add({ offset: 100, rtt: 6 })
    const meter = createLatencyMeter()
    let frame: (() => void) | undefined
    let device = 5000
    noteLivePacketPainted('peer', { sentAt: 1000, penAgeMs: 40 }, {
      clock, meter, nextFrame: cb => { frame = cb }, now: () => device, arrivedAt: 4990,
    })
    expect(meter.stats()).toBeNull()
    local = 980 // server time 1080: 80 ms after the author sent it
    device = 5012 // and on this device, 22 ms after the packet reached its handler
    frame!()
    expect(meter.stats()).toMatchObject({
      count: 1, p50: 120, sendP95: 80, localP95: 22, uncertaintyMax: 3, overBudget: 0,
    })
  })

  it('reports the tail, and counts what is over budget', () => {
    const meter = createLatencyMeter()
    for (let i = 1; i <= 100; i++) {
      meter.record({ userId: 'p', penToInkMs: i * 3, sendToInkMs: i, uncertaintyMs: 1, localMs: i % 10 })
    }
    const s = meter.stats()!
    expect(s.p50).toBe(150)
    expect(s.p95).toBe(285)
    expect(s.max).toBe(300)
    expect(s.overBudget).toBe(100 - Math.floor(LIVE_LATENCY_BUDGET_MS / 3))
  })

  it('keeps a rolling window', () => {
    const meter = createLatencyMeter(3)
    for (const v of [900, 10, 20, 30]) meter.record({ userId: 'p', penToInkMs: v, sendToInkMs: v, uncertaintyMs: 0, localMs: 0 })
    expect(meter.stats()!.max).toBe(30)
  })
})
