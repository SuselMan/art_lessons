import { describe, expect, it } from 'vitest'

import { createPreviewSchedule, PREVIEW_IDLE_MS, PREVIEW_MIN_INTERVAL_MS } from './previewSchedule'

describe('previewSchedule (#595, ADR 015 §5)', () => {
  it('does not bake a board nothing happened on', () => {
    const s = createPreviewSchedule()
    expect(s.shouldBake(100_000)).toBe(false)
    expect(s.nextCheckAt(100_000)).toBeNull()
  })

  it('bakes once the pen has rested for the idle time after a stroke', () => {
    const s = createPreviewSchedule()
    s.notePenDown(1000)
    s.noteOperation(1400)
    s.notePenUp(1500)

    expect(s.shouldBake(1500 + PREVIEW_IDLE_MS - 1)).toBe(false)
    expect(s.nextCheckAt(1600)).toBe(1500 + PREVIEW_IDLE_MS)
    expect(s.shouldBake(1500 + PREVIEW_IDLE_MS)).toBe(true)
  })

  it('never bakes while the pen is down, however long the stroke', () => {
    const s = createPreviewSchedule()
    s.noteOperation(0)
    s.notePenDown(10)
    s.noteOperation(20)
    expect(s.shouldBake(60_000)).toBe(false)
    expect(s.nextCheckAt(60_000)).toBeNull()

    s.notePenUp(60_000)
    expect(s.nextCheckAt(60_000)).toBe(60_000 + PREVIEW_IDLE_MS)
  })

  it('a new stroke restarts the idle countdown', () => {
    const s = createPreviewSchedule()
    s.noteOperation(0)
    s.notePenUp(0)
    s.notePenDown(1000)
    s.notePenUp(1200)
    expect(s.shouldBake(PREVIEW_IDLE_MS)).toBe(false)
    expect(s.nextCheckAt(PREVIEW_IDLE_MS)).toBe(1200 + PREVIEW_IDLE_MS)
  })

  it('keeps at least the minimum interval between bakes', () => {
    const s = createPreviewSchedule()
    s.noteOperation(0)
    s.notePenUp(0)
    expect(s.shouldBake(PREVIEW_IDLE_MS)).toBe(true)
    s.noteBaked(PREVIEW_IDLE_MS)

    s.notePenDown(2000)
    s.noteOperation(2100)
    s.notePenUp(2200)
    // Idle is satisfied at 3700, the interval only at 1500 + 5000.
    expect(s.shouldBake(3700)).toBe(false)
    expect(s.nextCheckAt(3700)).toBe(PREVIEW_IDLE_MS + PREVIEW_MIN_INTERVAL_MS)
    expect(s.shouldBake(PREVIEW_IDLE_MS + PREVIEW_MIN_INTERVAL_MS)).toBe(true)
  })

  it('does not bake again when nothing changed since the last bake', () => {
    const s = createPreviewSchedule()
    s.noteOperation(0)
    s.notePenUp(0)
    s.noteBaked(PREVIEW_IDLE_MS)
    expect(s.shouldBake(100_000)).toBe(false)
    expect(s.nextCheckAt(100_000)).toBeNull()
  })

  it('bakes for a peer\'s operation (the teacher correcting) without any pen activity here', () => {
    const s = createPreviewSchedule()
    s.noteOperation(500)
    expect(s.shouldBake(500)).toBe(true)
    expect(s.nextCheckAt(500)).toBe(500)
  })

  it('an operation arriving during an in-flight bake counts toward the next one', () => {
    const s = createPreviewSchedule()
    s.noteOperation(0)
    s.noteBaked(0)
    s.noteOperation(10) // landed while the upload was still going
    expect(s.shouldBake(PREVIEW_MIN_INTERVAL_MS)).toBe(true)
  })

  it('nextCheckAt never points into the past', () => {
    const s = createPreviewSchedule()
    s.noteOperation(0)
    s.notePenUp(0)
    expect(s.nextCheckAt(99_999)).toBe(99_999)
  })

  it('takes custom thresholds', () => {
    const s = createPreviewSchedule({ idleMs: 100, minIntervalMs: 200 })
    s.noteOperation(0)
    s.notePenUp(0)
    expect(s.shouldBake(100)).toBe(true)
    s.noteBaked(100)
    s.noteOperation(110)
    expect(s.nextCheckAt(110)).toBe(300)
  })
})
