import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { OptionGroup } from '../OptionGroup'
import { PrecisionSlider } from '../PrecisionSlider'
import {
  MINIMAL_UI_TAP_MODES, floatingPanelChoices, floatingPanelSelection, minimalUiAvailable,
  type FloatingPanelMode, type MinimalUiTapMode,
} from '../../lib/uiPreferences'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './SettingsPanel.module.css'

const FLOATING_PANEL_LABELS: Record<FloatingPanelMode, TranslationKey> = {
  always: 'editorSettings.floatingPanel.always',
  minimal: 'editorSettings.floatingPanel.minimal',
  never: 'editorSettings.floatingPanel.never',
}

const MINIMAL_UI_TAP_LABELS: Record<MinimalUiTapMode, TranslationKey> = {
  single: 'editorSettings.minimalUiTap.single',
  double: 'editorSettings.minimalUiTap.double',
}

interface ToggleRowProps {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <label className={styles.flagRow}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div>
        <div className={styles.flagLabel}>{label}</div>
        <div className={styles.flagDescription}>{hint}</div>
      </div>
    </label>
  )
}

/** (#321) The settings a teacher actually opens this panel for. Everything
 *  here writes straight through to `settingsStore` — no draft, no Save, no
 *  reload: the volume slider is meant to be dragged while listening, and a
 *  reload mid-lesson to find out what a checkbox does is not a thing we ask
 *  of anyone. The Debug tab keeps that older model, because feature flags
 *  really are read once at mount.
 *
 *  What belongs here rather than in `pages/Settings` (the account-wide screen)
 *  is anything about drawing itself: it is reached from inside the room, next
 *  to the drawing it changes. Language and control scheme stay there. */
export function GeneralTab() {
  const t = useT()
  const deviceType = useSettingsStore(s => s.deviceType)
  const soundEnabled = useSettingsStore(s => s.soundEnabled)
  const setSoundEnabled = useSettingsStore(s => s.setSoundEnabled)
  const soundVolume = useSettingsStore(s => s.soundVolume)
  const setSoundVolume = useSettingsStore(s => s.setSoundVolume)
  const minimalUi = useSettingsStore(s => s.minimalUi)
  const setMinimalUi = useSettingsStore(s => s.setMinimalUi)
  const minimalUiTapMode = useSettingsStore(s => s.minimalUiTapMode)
  const setMinimalUiTapMode = useSettingsStore(s => s.setMinimalUiTapMode)
  const floatingPanel = useSettingsStore(s => s.floatingPanel)
  const setFloatingPanel = useSettingsStore(s => s.setFloatingPanel)
  const lockBrushAngle = useSettingsStore(s => s.lockBrushAngleToCanvas)
  const setLockBrushAngle = useSettingsStore(s => s.setLockBrushAngleToCanvas)

  const volumePercent = Math.round(soundVolume * 100)

  return (
    <div className={styles.flagList}>
      <div className={styles.sectionHeading}>{t('editorSettings.soundSection')}</div>

      <ToggleRow
        label={t('editorSettings.soundEnabled')}
        hint={t('editorSettings.soundEnabledHint')}
        checked={soundEnabled}
        onChange={setSoundEnabled}
      />

      {/* Only while there is something to set the volume of — a disabled
          slider under an off switch is a control that answers a question
          nobody asked yet. */}
      {soundEnabled && (
        <div className={styles.sliderRow}>
          <div className={styles.sliderHead}>
            <span className={styles.flagLabel}>{t('editorSettings.soundVolume')}</span>
            <span className={styles.sliderValue}>{volumePercent}%</span>
          </div>
          <PrecisionSlider
            orientation="horizontal"
            value={volumePercent}
            min={0}
            max={100}
            step={1}
            onChange={v => setSoundVolume(v / 100)}
            formatValue={v => `${v}%`}
            title={t('editorSettings.soundVolume')}
          />
        </div>
      )}

      <div className={styles.sectionHeading}>{t('editorSettings.interfaceSection')}</div>

      {/* Touch-only, and absent rather than disabled on a PC: there is no way
          into the mode there and no way back out of it (see
          `minimalUiAvailable`, and #384 for what a desktop answer might be). */}
      {minimalUiAvailable(deviceType) && (
        <>
          <ToggleRow
            label={t('editorSettings.minimalUi')}
            hint={t('editorSettings.minimalUiHint')}
            checked={minimalUi}
            onChange={setMinimalUi}
          />

          {/* Same rule as the volume slider above: only while there is a mode
              for it to describe. */}
          {minimalUi && (
            <div className={styles.choiceRow}>
              <div className={styles.flagLabel}>{t('editorSettings.minimalUiTap')}</div>
              <div className={styles.flagDescription}>{t('editorSettings.minimalUiTapHint')}</div>
              <OptionGroup
                variant="list"
                options={MINIMAL_UI_TAP_MODES.map(mode => ({
                  id: mode,
                  label: t(MINIMAL_UI_TAP_LABELS[mode]),
                }))}
                active={minimalUiTapMode}
                onSelect={setMinimalUiTapMode}
                ariaLabel={t('editorSettings.minimalUiTap')}
              />
            </div>
          )}
        </>
      )}

      <div className={styles.choiceRow}>
        <div className={styles.flagLabel}>{t('editorSettings.floatingPanel')}</div>
        <div className={styles.flagDescription}>{t('editorSettings.floatingPanelHint')}</div>
        <OptionGroup
          variant="list"
          options={floatingPanelChoices(deviceType).map(mode => ({
            id: mode,
            label: t(FLOATING_PANEL_LABELS[mode]),
          }))}
          active={floatingPanelSelection(floatingPanel, deviceType)}
          onSelect={setFloatingPanel}
          ariaLabel={t('editorSettings.floatingPanel')}
        />
      </div>

      <ToggleRow
        label={t('editorSettings.lockBrushAngle')}
        hint={t('editorSettings.lockBrushAngleHint')}
        checked={lockBrushAngle}
        onChange={setLockBrushAngle}
      />
    </div>
  )
}
