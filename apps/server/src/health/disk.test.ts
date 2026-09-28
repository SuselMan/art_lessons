import { describe, expect, it, vi } from 'vitest'

import { DISK_CRITICAL_PCT, DISK_WARN_PCT, diskPressureOf, readDisk } from './disk.js'

// `vi.mock`, а не `vi.spyOn`: неймспейс ESM-модуля заморожен, и подмена его
// свойства падает с «Cannot redefine property». По умолчанию мок делегирует
// настоящему `statfs`, чтобы тесты ниже мерили реальную файловую систему, а
// не выдуманные числа; единственный тест про сбой перекрывает его разово.
const mocks = vi.hoisted(() => ({ statfs: vi.fn() }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  mocks.statfs.mockImplementation(actual.statfs)
  return { ...actual, statfs: mocks.statfs }
})

// (#415) Диск — единственная из наших стен, у которой нет тормоза: гейта на
// него нет и быть не может, отказ в комнате не освобождает ни байта. Значит,
// письмо здесь — весь механизм целиком, и проверяются именно границы, на
// которых оно уходит, плюс то, что «не смогли посмотреть» никогда не
// притворяется «места полно».

function at(usedPct: number) {
  return { totalGb: 50, freeGb: 50 * (1 - usedPct / 100), usedPct }
}

describe('diskPressureOf', () => {
  it('is ok below the warning watermark', () => {
    expect(diskPressureOf(at(DISK_WARN_PCT - 0.1))).toBe('ok')
  })

  it('warns exactly at the watermark', () => {
    expect(diskPressureOf(at(DISK_WARN_PCT))).toBe('warn')
  })

  it('is critical exactly at its watermark', () => {
    expect(diskPressureOf(at(DISK_CRITICAL_PCT))).toBe('critical')
  })

  it('reports unknown — never ok — when the filesystem could not be read', () => {
    // Единственная по-настоящему неприемлемая ошибка этого модуля: сказать
    // «места достаточно», когда мы этого не знаем. Молчащий мониторинг делают
    // именно так, и он выглядит работающим.
    expect(diskPressureOf(null)).toBe('unknown')
  })

  it('warns before it is critical, with room for a human to act', () => {
    // Пороги диска ниже, чем у памяти, намеренно: память освобождается сама,
    // когда урок кончился, а диск требует человека — и человеку нужны недели,
    // а не минуты.
    expect(DISK_WARN_PCT).toBeLessThan(DISK_CRITICAL_PCT)
  })
})

describe('readDisk', () => {
  it('reports a real filesystem', async () => {
    const snapshot = await readDisk()

    expect(snapshot).not.toBeNull()
    expect(snapshot!.totalGb).toBeGreaterThan(0)
    expect(snapshot!.freeGb).toBeGreaterThanOrEqual(0)
    expect(snapshot!.freeGb).toBeLessThanOrEqual(snapshot!.totalGb)
    expect(snapshot!.usedPct).toBeGreaterThanOrEqual(0)
    expect(snapshot!.usedPct).toBeLessThanOrEqual(100)
  })

  it('agrees with itself: used% matches free against total', async () => {
    const snapshot = (await readDisk())!
    const derived = ((snapshot.totalGb - snapshot.freeGb) / snapshot.totalGb) * 100
    // Допуск — под округление до десятых в обоих числах.
    expect(snapshot.usedPct).toBeCloseTo(derived, 0)
  })

  it('returns null rather than a guess when statfs throws', async () => {
    mocks.statfs.mockRejectedValueOnce(new Error('no such mount'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(readDisk()).resolves.toBeNull()

    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('returns null rather than dividing by a zero-sized filesystem', async () => {
    // Не гипотетика: `statfs` на псевдо-ФС отдаёт нулевые блоки, и без этой
    // ветки usedPct стал бы NaN, который в JSON уезжает как `null` и читается
    // пробой как «поля нет» — то есть тревогой не о том.
    mocks.statfs.mockResolvedValueOnce({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0, files: 0, ffree: 0 })

    await expect(readDisk()).resolves.toBeNull()
  })
})
