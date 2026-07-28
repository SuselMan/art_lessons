import clsx from 'clsx'

import { AppHeader } from '../../components/AppHeader'
import { Icon } from '../../components/Icon'
import { LOCALES, LOCALE_NAMES, useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { DEVICE_TYPES, type DeviceType } from '../../lib/deviceType'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './Settings.module.css'

const DEVICE_TYPE_LABELS: Record<DeviceType, TranslationKey> = {
  tablet: 'settingsPage.deviceTablet',
  desktop: 'settingsPage.deviceDesktop',
}

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
  const deviceType = useSettingsStore(s => s.deviceType)
  const setDeviceType = useSettingsStore(s => s.setDeviceType)

  return (
    <div className={styles.page}>
      <AppHeader />

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

        <section className={styles.section}>
          <div className={styles.label}>{t('settingsPage.deviceType')}</div>
          {/* (#331, ADR #318) Two options and no "Auto": the detected value is
              simply what's shown selected on a device nobody has chosen for
              yet, so "auto" would be a third state that looks identical to
              one of the other two while behaving unpredictably. Detection is
              right about nine times in ten and can't ever be right about a
              Surface with the keyboard detached — this is the escape hatch
              for the rest, and it needs to read as a plain either/or. */}
          <div className={styles.options} role="radiogroup" aria-label={t('settingsPage.deviceType')}>
            {DEVICE_TYPES.map(option => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === deviceType}
                className={clsx(styles.option, option === deviceType && styles.optionSelected)}
                onClick={() => setDeviceType(option)}
              >
                <span className={styles.optionName}>{t(DEVICE_TYPE_LABELS[option])}</span>
                {option === deviceType && <Icon name="check" />}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{t('settingsPage.deviceTypeHint')}</p>
        </section>
      </div>
    </div>
  )
}
