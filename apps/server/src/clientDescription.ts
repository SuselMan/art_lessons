/** (#480, трек #314 §1) Короткое описание клиента для лога подключения.
 *
 *  21.08 на вопрос «а какое устройство было у преподавателя» пришлось
 *  склеивать nginx access.log с логами контейнера по времени хендшейков
 *  socket.io: сервер знал `userId`, но не знал устройства, а nginx знал
 *  устройство, но не знал `userId`. Ничего нового мы при этом не собираем —
 *  User-Agent и так лежит в nginx, — просто кладём его туда, где он отвечает
 *  на вопрос сам.
 *
 *  **`platform` намеренно врёт меньше, чем мог бы.** Safari на iPadOS по
 *  умолчанию представляется маком: `Mozilla/5.0 (Macintosh; Intel Mac OS X
 *  10_15_7) ... Version/16.3 Safari/605.1.15`, и отличить его от настоящего
 *  мака по одному User-Agent нельзя — «Macintosh» там desktop-mode, а
 *  настоящая только версия Safari, и она равна версии iPadOS. Поэтому такой
 *  клиент помечается `apple-desktop-ua`, а не `macos`: планшет и десктоп —
 *  первое, что спрашивают почти о каждом здешнем баге (ADR 007), и уверенный
 *  неверный ответ хуже честного «одно из двух». Chrome на iPadOS так себя не
 *  ведёт (`CriOS`), и его видно точно. */
export interface ClientDescription {
  platform: 'android' | 'ios' | 'apple-desktop-ua' | 'windows' | 'linux' | 'unknown'
  /** Браузер и мажорная версия, `unknown` если не разобрали. */
  browser: string
  /** Сырая строка, обрезанная по длине: разбор выше — догадка, а это факт.
   *  Всё, чего парсер не предусмотрел, восстанавливается отсюда. */
  ua: string
}

const MAX_UA = 200

export function describeClient(userAgent: string | undefined): ClientDescription {
  const ua = (userAgent ?? '').slice(0, MAX_UA)
  return { platform: platformOf(ua), browser: browserOf(ua), ua }
}

function platformOf(ua: string): ClientDescription['platform'] {
  if (/Android/i.test(ua)) return 'android'
  // Порядок важен: CriOS/FxiOS содержат и «iPhone»/«iPad», и своё имя, а
  // «like Mac OS X» в UA айфона поймалось бы проверкой на Macintosh ниже.
  if (/iPhone|iPad|iPod|CriOS|FxiOS/.test(ua)) return 'ios'
  if (/Macintosh/.test(ua)) return 'apple-desktop-ua'
  if (/Windows NT/.test(ua)) return 'windows'
  if (/Linux|X11/.test(ua)) return 'linux'
  return 'unknown'
}

function browserOf(ua: string): string {
  // Сверху вниз по специфичности: почти каждый браузер держит в строке и
  // «Safari», и обычно «Chrome», так что первое совпадение сверху — верное.
  const patterns: [string, RegExp][] = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Samsung', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    // Только у Safari версия живёт в отдельном `Version/`, а не рядом с
    // именем — и именно она равна версии iOS/iPadOS.
    ['Safari', /Version\/(\d+)[\d.]* Safari/],
  ]
  for (const [name, re] of patterns) {
    const match = re.exec(ua)
    if (match) return `${name} ${match[1]}`
  }
  return 'unknown'
}
