import { useState } from 'react'
import { Icon } from '../Icon'
import {
  FEATURE_FLAGS, getFeatureFlag, setFeatureFlag,
  getPencilSoundSetting, setPencilSoundSetting, type PencilSoundSetting,
  getPaperGrainVariant, setPaperGrainVariant, type PaperGrainVariant,
  getGraphiteGrainVariant, setGraphiteGrainVariant, type GraphiteGrainVariant, GRAPHITE_GRAIN_LABELS,
} from '../../lib/featureFlags'
import { ROUGH_VARIANTS } from '../../engine/src/paperNoise'
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
  const [pencilSound, setPencilSoundState] = useState<PencilSoundSetting>(() => getPencilSoundSetting())
  const [paperVariant, setPaperVariantState] = useState<PaperGrainVariant>(() => getPaperGrainVariant())
  const [grainVariant, setGrainVariantState] = useState<GraphiteGrainVariant>(() => getGraphiteGrainVariant())

  // Every flag toggle/select below only edits this local draft — nothing
  // touches localStorage or reloads until Save is pressed. Reloading on
  // every single checkbox click (the old behavior) was disruptive when
  // trying several flags in a row. Lazy-initialized from current storage so
  // reopening the panel always starts from what's actually active.
  const [pendingFlags, setPendingFlags] = useState<Record<string, boolean>>(
    () => Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, getFeatureFlag(f.key)])),
  )
  const dirty = FEATURE_FLAGS.some(f => pendingFlags[f.key] !== getFeatureFlag(f.key))
    || pencilSound !== getPencilSoundSetting()
    || paperVariant !== getPaperGrainVariant()
    || grainVariant !== getGraphiteGrainVariant()

  function handleSave() {
    for (const flag of FEATURE_FLAGS) setFeatureFlag(flag.key, pendingFlags[flag.key])
    setPencilSoundSetting(pencilSound)
    setPaperGrainVariant(paperVariant)
    setGraphiteGrainVariant(grainVariant)
    window.location.reload()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span>Settings</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.flagList}>
          {FEATURE_FLAGS.map(flag => (
            <label key={flag.key} className={styles.flagRow}>
              <input
                type="checkbox"
                checked={pendingFlags[flag.key]}
                onChange={e => setPendingFlags(p => ({ ...p, [flag.key]: e.target.checked }))}
              />
              <div>
                <div className={styles.flagLabel}>{flag.label}</div>
                <div className={styles.flagDescription}>{flag.description}</div>
              </div>
            </label>
          ))}
        </div>

        <div className={styles.flagRow} style={{ cursor: 'default' }}>
          <div style={{ width: '100%' }}>
            <div className={styles.flagLabel}>Pencil sound</div>
            <div className={styles.flagDescription}>Procedural paper-friction sound while drawing.</div>
            <select
              className={styles.select}
              value={pencilSound}
              onChange={e => setPencilSoundState(e.target.value as PencilSoundSetting)}
            >
              <option value="off">Off</option>
              <option value="variant1">Variant 1</option>
              <option value="variant2">Variant 2</option>
              <option value="variant3">Variant 3 (realistic, experimental)</option>
            </select>
          </div>
        </div>

        <div className={styles.flagRow} style={{ cursor: 'default' }}>
          <div style={{ width: '100%' }}>
            <div className={styles.flagLabel}>Paper grain variant (dev, rough only)</div>
            <div className={styles.flagDescription}>
              Overrides rough paper's texture with a candidate fiber algorithm for comparison — never
              affects smooth/bristol. Requires `npm run bake:paper-variants` to have been run locally.
            </div>
            <select
              className={styles.select}
              value={paperVariant}
              onChange={e => setPaperVariantState(e.target.value as PaperGrainVariant)}
            >
              <option value="off">Off (shipped default)</option>
              {ROUGH_VARIANTS.map((v, i) => (
                <option key={i} value={String(i + 1)}>{i + 1}. {v.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.flagRow} style={{ cursor: 'default' }}>
          <div style={{ width: '100%' }}>
            <div className={styles.flagLabel}>Graphite grain variant (dev)</div>
            <div className={styles.flagDescription}>
              Overrides the pencil mark's own texture (live in the shader, independent of paper) for
              comparison — applies to every paper type, unlike the paper-grain control above.
            </div>
            <select
              className={styles.select}
              value={grainVariant}
              onChange={e => setGrainVariantState(e.target.value as GraphiteGrainVariant)}
            >
              <option value="off">Off (shipped default)</option>
              {GRAPHITE_GRAIN_LABELS.slice(1).map((label, i) => (
                <option key={i} value={String(i + 1)}>{i + 1}. {label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.saveBar}>
          <span className={styles.hint}>
            {dirty ? 'Unsaved changes — reloads the page.' : 'Changes apply after Save.'}
          </span>
          <button type="button" className={styles.saveBtn} disabled={!dirty} onClick={handleSave}>
            Save
          </button>
        </div>

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
