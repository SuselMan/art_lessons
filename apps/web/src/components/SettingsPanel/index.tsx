import { Icon } from '../Icon'
import { FEATURE_FLAGS, getFeatureFlag, setFeatureFlag } from '../../lib/featureFlags'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
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
      </div>
    </div>
  )
}
