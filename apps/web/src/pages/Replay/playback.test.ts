import { describe, expect, it } from 'vitest'

import { appliedCountForElapsed, buildTimeline, currentElapsedMs, formatDuration } from './playback'

describe('buildTimeline', () => {
  it('returns an empty timeline for no ops', () => {
    expect(buildTimeline([])).toEqual({ offsetsMs: [], durationMs: 0 })
  })

  it('offsets every op from the first op\'s createdAt', () => {
    const ops = [
      { createdAt: '2026-07-19T10:00:00.000Z' },
      { createdAt: '2026-07-19T10:00:01.500Z' },
      { createdAt: '2026-07-19T10:00:04.000Z' },
    ]
    expect(buildTimeline(ops)).toEqual({ offsetsMs: [0, 1500, 4000], durationMs: 4000 })
  })

  it('is 0 duration for a single op', () => {
    expect(buildTimeline([{ createdAt: '2026-07-19T10:00:00.000Z' }])).toEqual({ offsetsMs: [0], durationMs: 0 })
  })
})

describe('appliedCountForElapsed', () => {
  const offsetsMs = [0, 1000, 1000, 2500, 5000]

  it('is 0 before the first op is due', () => {
    expect(appliedCountForElapsed(offsetsMs, -1)).toBe(0)
  })

  it('counts every op whose offset has been reached, including ties', () => {
    expect(appliedCountForElapsed(offsetsMs, 0)).toBe(1)
    expect(appliedCountForElapsed(offsetsMs, 1000)).toBe(3)
    expect(appliedCountForElapsed(offsetsMs, 2000)).toBe(3)
  })

  it('is the full length once elapsed reaches the last offset', () => {
    expect(appliedCountForElapsed(offsetsMs, 5000)).toBe(5)
    expect(appliedCountForElapsed(offsetsMs, 999999)).toBe(5)
  })

  it('is always 0 for an empty timeline', () => {
    expect(appliedCountForElapsed([], 5000)).toBe(0)
  })
})

describe('currentElapsedMs', () => {
  it('holds still when playback is paused (speed 0)', () => {
    expect(currentElapsedMs(1000, 5000, 0, 9000)).toBe(5000)
  })

  it('advances 1ms of elapsed time per 1ms of wall clock at 1x', () => {
    expect(currentElapsedMs(1000, 5000, 1, 4000)).toBe(8000)
  })

  it('advances proportionally to the speed multiplier', () => {
    expect(currentElapsedMs(1000, 5000, 4, 2000)).toBe(9000)
  })
})

describe('formatDuration', () => {
  it('formats sub-minute durations', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7000)).toBe('0:07')
  })

  it('formats minutes with zero-padded seconds', () => {
    expect(formatDuration(65000)).toBe('1:05')
    expect(formatDuration(600000)).toBe('10:00')
  })

  it('never goes negative', () => {
    expect(formatDuration(-500)).toBe('0:00')
  })
})
