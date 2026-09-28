import { describe, expect, it } from 'vitest'
import { describeClient } from './clientDescription.js'

describe('describeClient', () => {
  // Реальные строки из nginx за урок 21.08 — то, ради чего это заведено.
  it('разбирает планшет преподавателя', () => {
    const { platform, browser } = describeClient(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    )

    expect(platform).toBe('android')
    expect(browser).toBe('Chrome 151')
  })

  it('разбирает второго участника', () => {
    const { platform, browser } = describeClient(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    )

    // Chrome на маке — это точно десктоп, но платформа всё равно
    // apple-desktop-ua: различает их не она, а браузер.
    expect(platform).toBe('apple-desktop-ua')
    expect(browser).toBe('Chrome 151')
  })

  // Ловушка, ради которой у платформы такое имя: Safari на iPadOS по
  // умолчанию представляется маком, и «macos» здесь было бы уверенным
  // неверным ответом на первый же вопрос про любой баг (ADR 007).
  it('не выдаёт iPadOS-сафари за macOS', () => {
    const { platform, browser } = describeClient(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
    )

    expect(platform).toBe('apple-desktop-ua')
    // Версия Safari настоящая и равна версии iPadOS — единственное, что в
    // этой строке не desktop-mode.
    expect(browser).toBe('Safari 16')
  })

  it('видит Chrome на iPadOS точно — он не притворяется', () => {
    expect(describeClient(
      'Mozilla/5.0 (iPad; CPU OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0 Mobile/15E148 Safari/604.1',
    )).toMatchObject({ platform: 'ios', browser: 'Chrome 151' })
  })

  it('не путает Edge и Samsung с Chrome, чьё имя они тоже несут', () => {
    expect(describeClient(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',
    )).toMatchObject({ platform: 'windows', browser: 'Edge 151' })
    expect(describeClient(
      'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    )).toMatchObject({ platform: 'android', browser: 'Samsung 23' })
  })

  it('переживает отсутствующий и незнакомый User-Agent', () => {
    expect(describeClient(undefined)).toEqual({ platform: 'unknown', browser: 'unknown', ua: '' })
    expect(describeClient('curl/8.5.0')).toMatchObject({ platform: 'unknown', browser: 'unknown' })
  })

  it('обрезает строку, но сохраняет её', () => {
    const long = `Mozilla/5.0 ${'x'.repeat(500)}`
    const { ua } = describeClient(long)

    expect(ua.length).toBe(200)
    expect(long.startsWith(ua)).toBe(true)
  })
})
