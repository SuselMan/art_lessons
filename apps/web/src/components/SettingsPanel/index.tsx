import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Tabs } from '../Tabs'
import {
  FEATURE_FLAGS, getFeatureFlag, setFeatureFlag,
  getPencilSoundSetting, setPencilSoundSetting, type PencilSoundSetting,
  getGraphiteGrainVariant, setGraphiteGrainVariant,
  getCharcoalGrainVariant, setCharcoalGrainVariant,
  type GrainVariant, GRAPHITE_GRAIN_LABELS,
} from '../../lib/featureFlags'
import { GRAPHITE_GRAIN_DEFAULT, CHARCOAL_GRAIN_STREAKY } from '../../engine'
import {
  HOTKEY_ACTIONS, bindingsEqual, captureHotkeyBinding, findHotkeyConflict,
  formatHotkeyLabel, getHotkeyBindings, setHotkeyBindings, type HotkeyBinding,
} from '../../lib/hotkeys'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
}

type SettingsTabId = 'general' | 'hotkeys'

// The General tab is a developer instrument (feature flags, grain-variant
// comparison, a vibration probe) and stays in English on purpose (#208) —
// its contents churn with whatever is being investigated. The panel chrome
// and the Hotkeys tab are real user-facing features and are translated.
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  // Ad-hoc diagnostic for the hapticGrain experiment (see chat): bypasses the
  // hash-grid entirely and calls navigator.vibrate() directly, so "did the
  // whole feature fail" and "does this device/browser honor vibrate() at
  // all" can be told apart. vibrate() never throws on rejection — it just
  // returns false — so the raw return value is the only signal available.
  const [vibrateResult, setVibrateResult] = useState<string | null>(null)
  const [pencilSound, setPencilSoundState] = useState<PencilSoundSetting>(() => getPencilSoundSetting())
  const [grainVariant, setGrainVariantState] = useState<GrainVariant>(() => getGraphiteGrainVariant())
  const [charcoalGrainVariant, setCharcoalGrainVariantState] = useState<GrainVariant>(() => getCharcoalGrainVariant())

  // Hotkeys (#174) — same edit-a-draft-then-Save-reloads pattern as every
  // other setting in this panel. recordingActionId is which row is
  // currently listening for its next keypress; null means no row is
  // recording and the window keydown listener below is detached entirely.
  const [pendingHotkeys, setPendingHotkeys] = useState<Record<string, HotkeyBinding>>(
    () => getHotkeyBindings(localStorage),
  )
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)

  useEffect(() => {
    if (!recordingActionId) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecordingActionId(null); setHotkeyError(null); return }
      const captured = captureHotkeyBinding(e)
      if (!captured) return // bare modifier (Ctrl/Shift/Meta/Alt alone) — keep listening
      const conflict = findHotkeyConflict(recordingActionId, captured, pendingHotkeys)
      if (conflict) { setHotkeyError(t('editorSettings.hotkeyConflict', { action: t(conflict.labelKey) })); return }
      setPendingHotkeys(p => ({ ...p, [recordingActionId]: captured }))
      setHotkeyError(null)
      setRecordingActionId(null)
    }
    // Capture phase so a rebind can't be swallowed by some other keydown
    // listener higher up the tree while this panel is open.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recordingActionId, pendingHotkeys, t])

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
    || grainVariant !== getGraphiteGrainVariant()
    || charcoalGrainVariant !== getCharcoalGrainVariant()
    || HOTKEY_ACTIONS.some(a => !bindingsEqual(pendingHotkeys[a.id], getHotkeyBindings(localStorage)[a.id]))

  function handleSave() {
    for (const flag of FEATURE_FLAGS) setFeatureFlag(flag.key, pendingFlags[flag.key])
    setPencilSoundSetting(pencilSound)
    setGraphiteGrainVariant(grainVariant)
    setCharcoalGrainVariant(charcoalGrainVariant)
    setHotkeyBindings(localStorage, pendingHotkeys)
    window.location.reload()
  }

  const generalContent = (
    <>
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

      {/* #304 follow-up: one selector per material, not one shared override.
          Their shipped defaults differ (graphite 10 "Solid", charcoal 3
          "Streaky"), so a single control couldn't express both — and
          auditioning a variant on one used to disturb the other. */}
      {([
        {
          label: 'Graphite grain variant (dev)',
          defaultMode: GRAPHITE_GRAIN_DEFAULT,
          value: grainVariant,
          onChange: setGrainVariantState,
        },
        {
          label: 'Charcoal grain variant (dev)',
          defaultMode: CHARCOAL_GRAIN_STREAKY,
          value: charcoalGrainVariant,
          onChange: setCharcoalGrainVariantState,
        },
      ] as const).map(row => (
        <div key={row.label} className={styles.flagRow} style={{ cursor: 'default' }}>
          <div style={{ width: '100%' }}>
            <div className={styles.flagLabel}>{row.label}</div>
            <div className={styles.flagDescription}>
              Overrides this tool's own mark texture (live in the shader, independent of paper)
              for comparison — applies to every paper type, unlike the paper-grain control above.
              Each tool keeps its own default and its own override.
            </div>
            <select
              className={styles.select}
              value={row.value}
              onChange={e => row.onChange(e.target.value as GrainVariant)}
            >
              <option value="off">
                Default ({row.defaultMode}. {GRAPHITE_GRAIN_LABELS[row.defaultMode]})
              </option>
              {GRAPHITE_GRAIN_LABELS.map((label, i) => (
                <option key={i} value={String(i)}>{i}. {label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

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
    </>
  )

  // Hotkeys (#174): the registry in lib/hotkeys.ts is the single source of
  // truth — this list, the keydown handler in Room/index.tsx, and every
  // tooltip that mentions a hotkey all read from it, so rebinding here
  // actually takes effect everywhere at once (after Save's reload), not
  // just here. Desktop-only, same as the shortcuts themselves (#173: no
  // keyboard on touch devices).
  const hotkeysContent = (
    <div className={styles.flagList}>
      {HOTKEY_ACTIONS.map(action => (
        <div key={action.id} className={styles.flagRow} style={{ cursor: 'default' }}>
          <div className={styles.hotkeyRow}>
            <span className={styles.flagLabel}>{t(action.labelKey)}</span>
            <button
              type="button"
              className={styles.hotkeyBtn}
              onClick={() => { setRecordingActionId(action.id); setHotkeyError(null) }}
            >
              {recordingActionId === action.id ? t('editorSettings.pressKey') : formatHotkeyLabel(pendingHotkeys[action.id])}
            </button>
          </div>
          {recordingActionId === action.id && hotkeyError && (
            <div className={styles.hotkeyError}>{hotkeyError}</div>
          )}
        </div>
      ))}
      <button
        type="button"
        className={styles.hotkeyResetBtn}
        onClick={() => {
          setPendingHotkeys(Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default])))
          setRecordingActionId(null)
          setHotkeyError(null)
        }}
      >
        {t('editorSettings.resetHotkeys')}
      </button>
    </div>
  )

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span>{t('editorSettings.title')}</span>
          <button className={styles.closeBtn} onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>

        <Tabs
          tabs={[
            { id: 'general', label: t('editorSettings.tab.general'), content: generalContent },
            { id: 'hotkeys', label: t('editorSettings.tab.hotkeys'), content: hotkeysContent },
          ]}
          active={activeTab}
          onSelect={setActiveTab}
        />

        <div className={styles.saveBar}>
          <span className={styles.hint}>
            {t(dirty ? 'editorSettings.unsaved' : 'editorSettings.applyAfterSave')}
          </span>
          <button type="button" className={styles.saveBtn} disabled={!dirty} onClick={handleSave}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
