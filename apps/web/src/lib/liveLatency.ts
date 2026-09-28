import type { StrokeLiveData } from '@grafetto/shared'

import { serverClock, type ServerClock } from './serverClock'

/** (#432, трек #314 §11) How long a peer's pen takes to become ink on this
 *  screen.
 *
 *  Measured per live packet, for its *oldest* dab — the one that waited
 *  longest — so the numbers are the worst of each packet, not a flattering
 *  average of it:
 *
 *    pen → ink = penAgeMs            (the dab waiting in the author's batch)
 *              + (inkAt − sentAt)    (network, server relay, this client
 *                                     painting it into the next frame)
 *
 *  both halves on the server's clock, so neither participant's own clock has
 *  to be right. `inkAt` is the start of the first animation frame after the
 *  packet was painted into the layer: the frame that composites it, give or
 *  take the one frame of presentation the browser does not report.
 *
 *  What it cannot see: the author's own input latency (digitiser to
 *  PointerEvent) — no browser exposes it, and it is the same on both ends of
 *  every comparison this is for. */

/** The budget §11 of the release track sets: ink at the peer within this. */
export const LIVE_LATENCY_BUDGET_MS = 200

export interface LatencySample {
  userId: string
  /** Pen to ink, ms — the number the budget is about. */
  penToInkMs: number
  /** The network-and-paint part alone. */
  sendToInkMs: number
  /** How far either clock estimate could be off, combined — the receiver's
   *  half round trip (the sender's is not known here). */
  uncertaintyMs: number
}

export interface LatencyStats {
  count: number
  p50: number
  p95: number
  max: number
  /** p95 of the network-and-paint part, to tell a slow batch from a slow link. */
  sendP95: number
  overBudget: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[i]
}

export interface LatencyMeter {
  record(sample: LatencySample): void
  stats(): LatencyStats | null
  reset(): void
  subscribe(listener: () => void): () => void
}

/** A rolling window of the last `capacity` samples. */
export function createLatencyMeter(capacity = 300): LatencyMeter {
  let samples: LatencySample[] = []
  const listeners = new Set<() => void>()
  return {
    record(sample) {
      samples.push(sample)
      if (samples.length > capacity) samples = samples.slice(samples.length - capacity)
      for (const l of listeners) l()
    },
    stats() {
      if (samples.length === 0) return null
      const pen = samples.map(s => s.penToInkMs).sort((a, b) => a - b)
      const send = samples.map(s => s.sendToInkMs).sort((a, b) => a - b)
      return {
        count: pen.length,
        p50: percentile(pen, 0.5),
        p95: percentile(pen, 0.95),
        max: pen[pen.length - 1],
        sendP95: percentile(send, 0.95),
        overBudget: pen.filter(v => v > LIVE_LATENCY_BUDGET_MS).length,
      }
    },
    reset() { samples = [] },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export const liveLatency = createLatencyMeter()

declare global {
  // eslint-disable-next-line no-var
  var __liveLatency: LatencyMeter | undefined
}
// Read-only and a few numbers, so unlike the engine handle (devEngineHandle)
// it is on in production too: the measurement §11 asks for is between two
// real devices on the real deploy, read over CDP.
globalThis.__liveLatency = liveLatency

/** The two timing fields a live packet carries — see StrokeLiveData. Empty
 *  until this client's clock has synced: an unstamped packet is simply not
 *  measured, which beats one measured against a guess. */
export function liveTiming(
  dabs: ReadonlyArray<{ t: number }>, clock: ServerClock = serverClock,
): Pick<StrokeLiveData, 'sentAt' | 'penAgeMs'> {
  const sentAt = clock.serverNow()
  if (sentAt === null || dabs.length === 0) return {}
  return { sentAt, penAgeMs: Math.max(0, dabs[dabs.length - 1].t - dabs[0].t) }
}

/** The receiving half: called right after a peer's packet was painted into
 *  the layer; takes its sample on the next frame. */
export function noteLivePacketPainted(
  userId: string, packet: Pick<StrokeLiveData, 'sentAt' | 'penAgeMs'>,
  { clock = serverClock, meter = liveLatency, nextFrame = requestFrame }:
  { clock?: ServerClock; meter?: LatencyMeter; nextFrame?: (cb: () => void) => void } = {},
): void {
  const { sentAt } = packet
  if (sentAt === undefined) return
  nextFrame(() => {
    const inkAt = clock.serverNow()
    const uncertainty = clock.uncertainty()
    if (inkAt === null || uncertainty === null) return
    const sendToInkMs = inkAt - sentAt
    meter.record({
      userId, sendToInkMs, penToInkMs: sendToInkMs + (packet.penAgeMs ?? 0), uncertaintyMs: uncertainty,
    })
  })
}

function requestFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb())
  else setTimeout(cb, 0)
}
