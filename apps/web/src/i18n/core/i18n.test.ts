import { describe, expect, it } from 'vitest'

import { en } from './en'
import { ru } from './ru'
import { detectLocale, isLocale, LOCALES } from './locale'
// Imported from ./translate, not ./index: the barrel also exports the React
// hooks, which pull in the settings store and its localStorage read — the
// lookup itself needs neither.
import { selectPluralForm, translate } from './translate'
import type { PluralForms } from './types'

describe('locale detection', () => {
  it('picks the first supported language from the browser preference list', () => {
    expect(detectLocale(['ru-RU', 'en-US'])).toBe('ru')
    expect(detectLocale(['en-GB', 'ru'])).toBe('en')
  })

  it('matches on the primary subtag, so regional variants share a dictionary', () => {
    expect(detectLocale(['ru-BY'])).toBe('ru')
  })

  it('skips languages we do not ship and falls back to English', () => {
    expect(detectLocale(['de-DE', 'fr', 'ru'])).toBe('ru')
    expect(detectLocale(['de-DE', 'fr'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })

  it('rejects anything that is not a supported locale tag', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('dictionaries', () => {
  // The Dictionary type already enforces this at typecheck time; asserting it
  // again at runtime catches a dictionary that gets loaded some other way
  // later (a lazily fetched or user-contributed locale), where the compiler
  // never sees the object literal.
  it('cover exactly the same keys in every locale', () => {
    const reference = Object.keys(en).sort()
    for (const dictionary of [en, ru]) {
      expect(Object.keys(dictionary).sort()).toEqual(reference)
    }
  })

  it('leaves no empty strings', () => {
    for (const [key, message] of Object.entries(ru)) {
      const forms = typeof message === 'string' ? [message] : Object.values(message)
      for (const form of forms) expect(form, key).not.toBe('')
    }
  })

  it('keeps the same {placeholders} in every translation', () => {
    const placeholders = (message: string | PluralForms): string[] => {
      const text = typeof message === 'string' ? message : Object.values(message).join(' ')
      return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort()
    }
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]))
    }
  })
})

describe('translate', () => {
  it('returns the message for the requested locale', () => {
    expect(translate('en', 'common.cancel')).toBe('Cancel')
    expect(translate('ru', 'common.cancel')).toBe('Отмена')
  })

  it('substitutes named parameters', () => {
    expect(translate('en', 'join.headingNamed', { room: 'Still life' })).toBe('Join "Still life"')
    expect(translate('ru', 'join.headingNamed', { room: 'Натюрморт' })).toBe('Присоединиться к «Натюрморт»')
  })

  it('leaves an unsupplied placeholder visible rather than printing undefined', () => {
    expect(translate('en', 'join.headingNamed', {})).toBe('Join "{room}"')
  })

  it('ships a dictionary for every declared locale', () => {
    for (const locale of LOCALES) {
      expect(translate(locale, 'common.save')).not.toBe('')
    }
  })
})

describe('selectPluralForm', () => {
  // No shipped string is count-dependent yet, so this is exercised directly
  // rather than through a dictionary entry. It exists so the first Russian
  // counted string that appears is right by construction: Russian needs four
  // forms, and a two-form (English-shaped) helper gets «5 слоёв» wrong every
  // time.
  const EN = { one: '{n} layer', other: '{n} layers' }
  const RU = { one: '{n} слой', few: '{n} слоя', many: '{n} слоёв', other: '{n} слоя' }

  it('uses English one/other', () => {
    expect(selectPluralForm('en', EN, 1)).toBe('{n} layer')
    expect(selectPluralForm('en', EN, 0)).toBe('{n} layers')
    expect(selectPluralForm('en', EN, 5)).toBe('{n} layers')
  })

  it('uses the full Russian one/few/many set', () => {
    expect(selectPluralForm('ru', RU, 1)).toBe('{n} слой')
    expect(selectPluralForm('ru', RU, 2)).toBe('{n} слоя')
    expect(selectPluralForm('ru', RU, 5)).toBe('{n} слоёв')
    expect(selectPluralForm('ru', RU, 11)).toBe('{n} слоёв')
    expect(selectPluralForm('ru', RU, 21)).toBe('{n} слой')
  })

  it('falls back to `other` when a locale asks for a form the entry omits', () => {
    expect(selectPluralForm('ru', { one: 'x', other: 'y' }, 5)).toBe('y')
  })
})
