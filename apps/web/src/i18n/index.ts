import { useCallback } from 'react'

import { useSettingsStore } from '../stores/settingsStore'
import { translate, type TFunction } from './translate'
import type { TranslationKey } from './en'
import type { Locale } from './locale'
import type { TranslationParams } from './types'

// The React face of the translation layer (#208) — everything a component
// needs, in one import. The lookup itself is store-free and lives in
// `./translate.ts`; only the two hooks below subscribe to the chosen
// language. See ADR 006 for why this exists instead of react-i18next.

export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, isLocale, detectLocale } from './locale'
export { translate, selectPluralForm } from './translate'
export type { TFunction } from './translate'
export type { Locale } from './locale'
export type { TranslationKey } from './en'
export type { PluralForms, TranslationParams } from './types'

/** The translation function for the currently selected language. Identity is
 *  stable per locale, so passing it into a `useMemo`/`useCallback` dependency
 *  list (or into a memo()'d child) doesn't churn on every render. */
export function useT(): TFunction {
  const locale = useSettingsStore(s => s.locale)
  return useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  )
}

/** The active locale, for the places that need it directly rather than as a
 *  translated string — `Intl` formatters, `toLocaleDateString`, and so on. */
export function useLocale(): Locale {
  return useSettingsStore(s => s.locale)
}
