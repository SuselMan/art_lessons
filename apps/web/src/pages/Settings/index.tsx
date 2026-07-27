import clsx from 'clsx'

import { AccountNav } from '../../components/AccountNav'
import { Icon } from '../../components/Icon'
import { LOCALES, LOCALE_NAMES, useT } from '../../i18n'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './Settings.module.css'

/** App-wide settings (#208) — the person's own preferences, as opposed to
 *  the editor's `components/SettingsPanel` (feature flags, hotkeys, and
 *  other things scoped to one drawing session). Language is the only entry
 *  today; theme and similar belong here as they arrive.
 *
 *  Applies immediately with no Save step and no reload: every string comes
 *  from `useT()`, which is a store subscription, so switching language
 *  re-renders the app in place. */
export function Settings() {
  const t = useT()
  const locale = useSettingsStore(s => s.locale)
  const setLocale = useSettingsStore(s => s.setLocale)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>Art Lessons</div>
        <AccountNav />
      </header>

      <div className={styles.card}>
        <h1 className={styles.heading}>{t('settingsPage.title')}</h1>

        <section className={styles.section}>
          <div className={styles.label}>{t('settingsPage.language')}</div>
          {/* Language names are endonyms (see LOCALE_NAMES) — someone who
              landed in a language they can't read still recognizes their
              own by its own name. */}
          <div className={styles.options} role="radiogroup" aria-label={t('settingsPage.language')}>
            {LOCALES.map(option => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === locale}
                className={clsx(styles.option, option === locale && styles.optionSelected)}
                onClick={() => setLocale(option)}
              >
                <span className={styles.optionName}>{LOCALE_NAMES[option]}</span>
                {option === locale && <Icon name="check" />}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{t('settingsPage.languageHint')}</p>
        </section>
      </div>
    </div>
  )
}
