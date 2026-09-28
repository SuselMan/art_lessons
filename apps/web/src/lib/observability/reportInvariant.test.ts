import { beforeEach, describe, expect, it, vi } from 'vitest'

// Пространство имён ES-модуля неизменяемо, `vi.spyOn` по нему не работает —
// подменяем сам модуль. Больше в нём ничего и не нужно: этот файл проверяет
// решения (о чём сообщать, сколько раз), а не SDK.
// `vi.hoisted`, потому что `vi.mock` поднимается выше объявлений в файле, и
// обычные `const` к моменту его вызова ещё не существуют.
const { captureMessage, addBreadcrumb } = vi.hoisted(() => ({
  captureMessage: vi.fn(), addBreadcrumb: vi.fn(),
}))
vi.mock('@sentry/react', () => ({ captureMessage, addBreadcrumb }))

import { _resetInvariants, countsSnapshot, reportInvariant } from './reportInvariant'

describe('reportInvariant', () => {
  beforeEach(() => {
    _resetInvariants()
    captureMessage.mockClear()
    addBreadcrumb.mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('сообщает о нарушении с именем, тегом и контекстом', () => {
    reportInvariant('seq gap in confirmed stream — resyncing', { expected: 1501, got: 1600 })

    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [message, options] = captureMessage.mock.calls[0]
    expect(message).toBe('seq gap in confirmed stream — resyncing')
    expect(options).toMatchObject({
      level: 'warning',
      tags: { invariant: 'seq gap in confirmed stream — resyncing' },
      extra: expect.objectContaining({ expected: 1501, got: 1600, seen: 1 }),
    })
  })

  // Почти каждое из этих мест живёт в горячем цикле — приход операции,
  // граница чекпойнта. Без дедупа одно залипшее состояние съело бы дневную
  // квоту бесплатного тарифа за минуту и вытеснило всё остальное.
  it('сообщает об одном имени один раз за сессию', () => {
    for (let i = 0; i < 500; i++) reportInvariant('reveal backlog', { backlog: i })

    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  // ...но повторы не должны исчезать: «случилось однажды» и «случается
  // непрерывно» — разные новости, и вторая как раз описывает залипание.
  it('оставляет крошку на каждом срабатывании и считает повторы', () => {
    reportInvariant('reveal backlog')
    reportInvariant('reveal backlog')
    reportInvariant('reveal backlog')

    expect(addBreadcrumb).toHaveBeenCalledTimes(3)
    expect(addBreadcrumb.mock.calls[2][0]).toMatchObject({ category: 'invariant', data: { seen: 3 } })
    expect(countsSnapshot()).toEqual({ 'reveal backlog': 3 })
  })

  // Ответ на «водяной знак застрял» часто не в самом событии, а в том, что
  // происходило рядом.
  it('прикладывает к отчёту счётчики остальных инвариантов', () => {
    reportInvariant('seq gap')
    reportInvariant('seq gap')
    reportInvariant('stale pending commit seq below baked watermark')

    const [, options] = captureMessage.mock.calls[1]
    expect(options).toMatchObject({
      extra: expect.objectContaining({
        invariantCounts: { 'seq gap': 2, 'stale pending commit seq below baked watermark': 1 },
      }),
    })
  })

  it('разные имена отчитываются независимо', () => {
    reportInvariant('a')
    reportInvariant('b')
    reportInvariant('a')

    expect(captureMessage).toHaveBeenCalledTimes(2)
  })
})
