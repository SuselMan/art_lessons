import { describe, expect, it, vi } from 'vitest'

import { MEMORY_ADMIT_PCT, MEMORY_WARN_PCT, pressureOf, readMemory } from './memory.js'

// (#415) Пороги — единственное место, где «сервер у потолка» превращается в
// решение отказать живому человеку, так что проверяется не арифметика долей, а
// именно границы: на самой границе порог обязан срабатывать, иначе алерт и
// гейт разойдутся на один процент и разойдутся молча.

function snapshotAt(heapUsedPct: number) {
  return { rssMb: 100, heapUsedMb: 100, heapLimitMb: 1000, heapUsedPct }
}

describe('pressureOf', () => {
  it('is ok below the warning watermark', () => {
    expect(pressureOf(snapshotAt(MEMORY_WARN_PCT - 0.1))).toBe('ok')
  })

  it('warns exactly at the watermark, not one tick past it', () => {
    expect(pressureOf(snapshotAt(MEMORY_WARN_PCT))).toBe('warn')
  })

  it('stays warn right below the admission watermark', () => {
    expect(pressureOf(snapshotAt(MEMORY_ADMIT_PCT - 0.1))).toBe('warn')
  })

  it('is critical exactly at the admission watermark', () => {
    // Ровно эта граница включает отказы в join_room/create_room.
    expect(pressureOf(snapshotAt(MEMORY_ADMIT_PCT))).toBe('critical')
  })

  it('orders the two watermarks so warn always precedes critical', () => {
    // Перевёрнутые пороги дали бы отказы без единого предупреждения — то есть
    // ровно то, чего пункт трека §1 требует не допустить: узнать раньше, чем
    // упрётся живой урок.
    expect(MEMORY_WARN_PCT).toBeLessThan(MEMORY_ADMIT_PCT)
  })
})

describe('readMemory', () => {
  it('reports a heap limit and a used share of it', () => {
    const snapshot = readMemory()

    expect(snapshot.heapLimitMb).toBeGreaterThan(0)
    expect(snapshot.heapUsedMb).toBeGreaterThan(0)
    expect(snapshot.heapUsedMb).toBeLessThanOrEqual(snapshot.heapLimitMb)
    expect(snapshot.heapUsedPct).toBeCloseTo((snapshot.heapUsedMb / snapshot.heapLimitMb) * 100, 0)
  })

  it('measures the heap rather than RSS', () => {
    // RSS шире кучи на буферы, стек и нативные аллокации — он полезен в
    // отчёте, но порогом быть не может: вытеснение комнат его не освобождает.
    // Здесь это фиксируется как факт о числах, а не как комментарий.
    const snapshot = readMemory()
    expect(snapshot.rssMb).toBeGreaterThan(0)
    expect(snapshot.rssMb).not.toBe(snapshot.heapUsedMb)
  })

  it('survives a heap reading without pretending to be precise', () => {
    const spy = vi.spyOn(process.memoryUsage, 'rss')
    readMemory()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
