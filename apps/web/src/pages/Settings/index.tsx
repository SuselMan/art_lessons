import { useState } from 'react'

import { AppHeader } from '../../components/AppHeader'
import { OptionGroup } from '../../components/OptionGroup'
import { LOCALES, LOCALE_NAMES, useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { APP_VERSION, isDeployedBuild } from '../../lib/appVersion'
import { COMPACT_PREFERENCES, DEVICE_TYPES, type CompactPreference, type DeviceType } from '../../lib/deviceType'
import { checkForUpdateNow } from '../../lib/registerServiceWorker'
import { THEMES, type Theme } from '../../lib/theme'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './Settings.module.css'

const DEVICE_TYPE_LABELS: Record<DeviceType, TranslationKey> = {
  tablet: 'settingsPage.deviceTablet',
  desktop: 'settingsPage.deviceDesktop',
}

const COMPACT_LABELS: Record<CompactPreference, TranslationKey> = {
  auto: 'settingsPage.compactAuto',
  on: 'settingsPage.compactOn',
  off: 'settingsPage.compactOff',
}

const THEME_LABELS: Record<Theme, TranslationKey> = {
  dark: 'settingsPage.themeDark',
  light: 'settingsPage.themeLight',
}

/** App-wide settings (#208) — the person's own preferences, as opposed to
 *  the editor's `components/SettingsPanel` (feature flags, hotkeys, and
 *  other things scoped to one drawing session). Language, interface scheme
 *  and palette live here; anything else that belongs to the person rather
 *  than to a drawing joins them.
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
  const compactPreference = useSettingsStore(s => s.compactPreference)
  const setCompactPreference = useSettingsStore(s => s.setCompactPreference)
  const theme = useSettingsStore(s => s.theme)
  const setTheme = useSettingsStore(s => s.setTheme)

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
          <OptionGroup
            variant="list"
            options={LOCALES.map(option => ({ id: option, label: LOCALE_NAMES[option] }))}
            active={locale}
            onSelect={setLocale}
            ariaLabel={t('settingsPage.language')}
          />
          <p className={styles.hint}>{t('settingsPage.languageHint')}</p>
        </section>

        <section className={styles.section}>
          <div className={styles.label}>{t('settingsPage.theme')}</div>
          {/* (#426) Two options and no "Auto", for the reason the device type
              gives just below: the detected value is already what shows as
              selected before anyone has chosen, so a third entry that behaves
              like one of the other two would only be a way to lose the choice
              later. The hint says plainly that the light one is the higher
              contrast of the two — this setting exists for people who need
              that, and they should not have to try both to find out. */}
          <OptionGroup
            variant="list"
            options={THEMES.map(option => ({ id: option, label: t(THEME_LABELS[option]) }))}
            active={theme}
            onSelect={setTheme}
            ariaLabel={t('settingsPage.theme')}
          />
          <p className={styles.hint}>{t('settingsPage.themeHint')}</p>
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
          <OptionGroup
            variant="list"
            options={DEVICE_TYPES.map(option => ({ id: option, label: t(DEVICE_TYPE_LABELS[option]) }))}
            active={deviceType}
            onSelect={setDeviceType}
            ariaLabel={t('settingsPage.deviceType')}
          />
          <p className={styles.hint}>{t('settingsPage.deviceTypeHint')}</p>
        </section>

        <section className={styles.section}>
          <div className={styles.label}>{t('settingsPage.compact')}</div>
          {/* (#512) Three options here where the tumbler above has two, and the
              difference is that this one measures something that *changes*: a
              phone rotates, a window is dragged narrower. `auto` therefore has
              a meaning the device tumbler's would have lacked — "keep
              following the screen" — rather than being a third state that looks
              like one of the other two. */}
          <OptionGroup
            variant="list"
            options={COMPACT_PREFERENCES.map(option => ({ id: option, label: t(COMPACT_LABELS[option]) }))}
            active={compactPreference}
            onSelect={setCompactPreference}
            ariaLabel={t('settingsPage.compact')}
          />
          <p className={styles.hint}>{t('settingsPage.compactHint')}</p>
        </section>

        <VersionSection />
      </div>
    </div>
  )
}

/** (#515) Which build this device is running, and a way to stop it being an
 *  older one.
 *
 *  Small and last on the page on purpose — it is not a preference, and nobody
 *  comes here to set it. It is here because this is the one screen that exists
 *  on every device the app runs on, and the question it answers ("is this
 *  tablet on the build I just deployed?") had no answer at all before: the
 *  only way to tell was comparing chunk hashes against the server over ssh,
 *  which is not something anyone does mid-lesson. So it was guessed instead,
 *  and a wrong guess in either direction costs an afternoon — see the issue.
 *
 *  The button is the deterministic half. Update checks already happen on a
 *  timer and on resume, but "already happened" is invisible; pressing
 *  something and being told an answer is not. */
function VersionSection() {
  const t = useT()
  const [state, setState] = useState<'idle' | 'checking' | 'current'>('idle')

  async function check() {
    setState('checking')
    const result = await checkForUpdateNow()
    // 'updating' deliberately leaves the label on "checking": the page is
    // reloading, and flashing a result the person cannot finish reading is
    // worse than the spinner they already understand.
    //
    if (result === 'updating') return
    // 'unavailable' goes back to idle rather than claiming to be up to date.
    // Nothing was asked of any server in that case, and "this is the latest
    // version" from a build that cannot know is precisely the false
    // reassurance this whole row exists to remove.
    setState(result === 'current' ? 'current' : 'idle')
  }

  return (
    <section className={styles.section}>
      <div className={styles.label}>{t('settingsPage.version')}</div>
      <div className={styles.versionRow}>
        {/* A build identity, not prose — monospace so two of them can be
            compared character by character, which is the only thing anyone
            ever does with it. */}
        <code className={styles.version}>{APP_VERSION}</code>
        {isDeployedBuild() && (
          <button
            type="button"
            className={styles.versionCheck}
            onClick={() => { void check() }}
            disabled={state === 'checking'}
          >
            {state === 'checking' ? t('settingsPage.versionChecking') : t('settingsPage.versionCheck')}
          </button>
        )}
      </div>
      <p className={styles.hint}>
        {state === 'current' ? t('settingsPage.versionCurrent') : t('settingsPage.versionHint')}
      </p>
    </section>
  )
}
