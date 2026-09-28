import { afterEach, describe, expect, it } from 'vitest'

import {
  _resetEventLoopMonitor, EVENT_LOOP_CRITICAL_MS, EVENT_LOOP_CRITICAL_UTILIZATION,
  EVENT_LOOP_WARN_MS, EVENT_LOOP_WARN_UTILIZATION, eventLoopPressureOf, readEventLoop,
  startEventLoopMonitor,
} from './eventLoop.js'

// (#324) Здесь проверяется не арифметика долей, а то, ради чего модуль
// переписывался после нагрузочного прогона: тревога обязана срабатывать на
// **насыщении**, а не только на длинных залипаниях. Замер 10.08 показал, что
// сервер умеет сломаться полностью (подтверждение штриха 8.9 с), не превысив
// порог по задержке ни разу — если этот файл когда-нибудь позволит вернуть
// суждение к одной задержке, авария снова станет невидимой.

function snapshot(overrides: Partial<Parameters<typeof eventLoopPressureOf>[0] & object> = {}) {
  return {
    p50Ms: 0.2, p99Ms: 0.4, maxMs: 1, worstMs: 1, utilization: 0.1, windowSeconds: 60,
    ...overrides,
  }
}

afterEach(() => {
  _resetEventLoopMonitor()
})

describe('eventLoopPressureOf', () => {
  it('is ok on a quiet loop', () => {
    expect(eventLoopPressureOf(snapshot())).toBe('ok')
  })

  it('is unknown — not ok — before the first window closes', () => {
    // Сразу после рестарта данных честно нет. Ноль здесь означал бы
    // «измерено, всё хорошо», то есть ложь ровно в тот момент, когда сервер
    // ещё разогревается.
    expect(eventLoopPressureOf(null)).toBe('unknown')
  })

  it('catches saturation the delay threshold sleeps through', () => {
    // Ровно форма аварии из прогона: очередь растёт, залипаний нет.
    const saturated = snapshot({ utilization: 0.95, p99Ms: 35 })

    expect(saturated.p99Ms).toBeLessThan(EVENT_LOOP_CRITICAL_MS)
    expect(eventLoopPressureOf(saturated)).toBe('critical')
  })

  it('still catches one long synchronous stall at low utilization', () => {
    // Обратный класс беды: цикл почти свободен, но одна операция заморозила
    // всех разом. Утилизация о нём молчит — поэтому обе величины и остались.
    const stalled = snapshot({ utilization: 0.2, p99Ms: EVENT_LOOP_CRITICAL_MS })

    expect(stalled.utilization).toBeLessThan(EVENT_LOOP_WARN_UTILIZATION)
    expect(eventLoopPressureOf(stalled)).toBe('critical')
  })

  it('warns at each watermark exactly', () => {
    expect(eventLoopPressureOf(snapshot({ utilization: EVENT_LOOP_WARN_UTILIZATION }))).toBe('warn')
    expect(eventLoopPressureOf(snapshot({ p99Ms: EVENT_LOOP_WARN_MS }))).toBe('warn')
    expect(eventLoopPressureOf(snapshot({ utilization: EVENT_LOOP_CRITICAL_UTILIZATION }))).toBe('critical')
  })

  it('orders every watermark so warn always precedes critical', () => {
    expect(EVENT_LOOP_WARN_UTILIZATION).toBeLessThan(EVENT_LOOP_CRITICAL_UTILIZATION)
    expect(EVENT_LOOP_WARN_MS).toBeLessThan(EVENT_LOOP_CRITICAL_MS)
  })
})

describe('startEventLoopMonitor', () => {
  it('reports nothing until a window has closed', () => {
    startEventLoopMonitor()

    // Окно по умолчанию — минута, так что сразу после запуска данных нет и
    // быть не должно.
    expect(readEventLoop()).toBeNull()
  })

  it('is idempotent, so a second call cannot leave two timers behind', () => {
    startEventLoopMonitor()
    startEventLoopMonitor()
    startEventLoopMonitor()

    // Наблюдаемо только косвенно — но повторный вызов, создающий вторую
    // гистограмму, сбрасывал бы окна первой на середине, и показания стали бы
    // тихо занижаться вдвое.
    expect(() => startEventLoopMonitor()).not.toThrow()
    expect(readEventLoop()).toBeNull()
  })
})
