import { en, type Dictionary, type TranslationKey } from './en'
import { ru } from './ru'
import type { Locale } from './locale'
import type { PluralCategory, PluralForms, TranslationParams } from './types'

// The translation runtime (#208): dictionary lookup, `{name}` interpolation,
// and plural selection delegated to the platform's own `Intl.PluralRules`.
//
// Deliberately free of React and of the settings store — it's a pure
// function of (locale, key, params), so tests and non-component helpers can
// use it without a DOM. The React layer that reads the current locale lives
// in `./index.ts`.

const DICTIONARIES: Record<Locale, Dictionary> = { en, ru }

// One `Intl.PluralRules` per locale, built lazily and reused — constructing
// one is comparatively expensive and translation runs on every render.
const pluralRules = new Map<Locale, Intl.PluralRules>()

function pluralRulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules
}

/** Picks the form matching `count` under this locale's own plural rules.
 *  English needs two forms, Russian four («1 слой / 2 слоя / 5 слоёв»);
 *  neither set is hardcoded here — both come from `Intl`. Falls back to
 *  `other`, which every `PluralForms` is required to declare. */
export function selectPluralForm(locale: Locale, forms: PluralForms, count: number): string {
  const category = pluralRulesFor(locale).select(count) as PluralCategory
  return forms[category] ?? forms.other
}

const PLACEHOLDER = /\{(\w+)\}/g

/** Substitutes `{name}` placeholders. An unknown placeholder is left as-is
 *  rather than replaced with "undefined" — a visible `{name}` in the UI
 *  points straight at the missing parameter. */
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}

export type TFunction = (key: TranslationKey, params?: TranslationParams) => string

/** Locale-explicit lookup. Inside components use `useT()` instead, so the
 *  text re-renders when the language changes. */
export function translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  // The `?? en[key]` fallback is unreachable while every dictionary is typed
  // as `Dictionary` — it's the safety net for a locale loaded some other way
  // (a future user-contributed or lazily fetched dictionary), where a missing
  // key should degrade to English rather than to a blank label.
  const message = DICTIONARIES[locale]?.[key] ?? en[key]
  // `n` is the agreed-on parameter name for the count in every plural entry.
  const count = typeof params?.n === 'number' ? params.n : 0
  const template = typeof message === 'string' ? message : selectPluralForm(locale, message, count)
  return interpolate(template, params)
}
