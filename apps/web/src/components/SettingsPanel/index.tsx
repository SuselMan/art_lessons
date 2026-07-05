import { useState } from 'react'
import { Icon } from '../Icon'
import { FEATURE_FLAGS, getFeatureFlag, setFeatureFlag } from '../../lib/featureFlags'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  // Ad-hoc diagnostic for the hapticGrain experiment (see chat): bypasses the
  // hash-grid entirely and calls navigator.vibrate() directly, so "did the
  // whole feature fail" and "does this device/browser honor vibrate() at
  // all" can be told apart. vibrate() never throws on rejection — it just
  // returns false — so the raw return value is the only signal available.
  const [vibrateResult, setVibrateResult] = useState<string | null>(null)

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span>Settings</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.flagList}>
          {FEATURE_FLAGS.map(flag => (
            <label key={flag.key} className={styles.flagRow}>
              <input
                type="checkbox"
                defaultChecked={getFeatureFlag(flag.key)}
                onChange={e => {
                  setFeatureFlag(flag.key, e.target.checked)
                  window.location.reload()
                }}
              />
              <div>
                <div className={styles.flagLabel}>{flag.label}</div>
                <div className={styles.flagDescription}>{flag.description}</div>
              </div>
            </label>
          ))}
        </div>

        <div className={styles.hint}>Changes apply after the page reloads.</div>

        <div className={styles.flagRow} style={{ cursor: 'default' }}>
          <button
            type="button"
            onClick={() => {
              if (!navigator.vibrate) { setVibrateResult('navigator.vibrate is undefined — no Vibration API on this browser'); return }
              const ok = navigator.vibrate(300)
              setVibrateResult(ok ? 'vibrate(300) returned true — browser accepted it' : 'vibrate(300) returned false — browser/OS rejected it')
            }}
          >
            Test vibration (300ms)
          </button>
          {vibrateResult && <div className={styles.flagDescription}>{vibrateResult}</div>}
        </div>
      </div>
    </div>
  )
}
