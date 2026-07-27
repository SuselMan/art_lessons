// Shared types for the translation layer (#208). Kept in their own module so
// the dictionaries (en.ts/ru.ts) and the runtime (index.ts) can both import
// them without importing each other.

/** The plural categories `Intl.PluralRules` can return. A locale only ever
 *  declares the forms its own rules can actually produce — English needs
 *  `one`/`other`, Russian needs `one`/`few`/`many` (plus `other`, which its
 *  rules use for fractional counts like "1,5 слоя"). `other` is required
 *  everywhere so form selection always has somewhere to fall back to. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string }

/** A dictionary entry: a plain string, or — when the sentence has to agree
 *  with a count — one string per plural form. Plural entries select on the
 *  `n` parameter (see `translate`). */
export type Message = string | PluralForms

export type TranslationParams = Record<string, string | number>
