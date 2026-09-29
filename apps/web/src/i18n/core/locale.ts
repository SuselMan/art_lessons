// Locale identity and detection (#208) — deliberately free of React, of the
// store, and of the dictionaries themselves, so `stores/settingsStore.ts`
// can depend on it without pulling in every translated string (and without
// an import cycle through `i18n/index.ts`, which reads the store).

export const LOCALES = ['en', 'ru'] as const

export type Locale = (typeof LOCALES)[number]

/** Fallback when the browser asks for a language we don't ship. Also the
 *  language the dictionaries are authored in, so a key missing from another
 *  locale degrades to readable English rather than to the key itself. */
export const DEFAULT_LOCALE: Locale = 'en'

/** Endonyms — each language named in itself, never translated. Someone
 *  looking for their own language in a list they can't read finds it by its
 *  own name, not by its English one. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** First supported language among the browser's own preferences, matched on
 *  the primary subtag only — 'ru-RU', 'ru-BY' and 'ru' all resolve to 'ru',
 *  since regional variants share one dictionary here. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isLocale(primary)) return primary
  }
  return DEFAULT_LOCALE
}
