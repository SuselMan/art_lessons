import { useCallback } from 'react'

import { useSettingsStore } from '../stores/settingsStore'
import { translate, type TFunction } from './core/translate'
import type { TranslationKey } from './core/en'
import type { Locale } from './core/locale'
import type { TranslationParams } from './core/types'

// The React face of the translation layer (#208) — everything a component
// needs, in one import. The lookup itself is store-free and lives in
// `./core/` (#650: a layer below the store, so the store and lib/ can
// translate without importing these hooks); only the two hooks below
// subscribe to the chosen language. See ADR 006 for why this exists instead of react-i18next.

export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, isLocale, detectLocale } from './core/locale'
export { translate, selectPluralForm } from './core/translate'
export type { TFunction } from './core/translate'
export type { Locale } from './core/locale'
export type { TranslationKey } from './core/en'
export type { PluralForms, TranslationParams } from './core/types'

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
