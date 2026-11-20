import { ResetDefaultsFooter } from '../Button'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { Icon } from '../Icon'
import { Switch } from '../Switch'
import { Tooltip } from '../Tooltip'
import { OptionGroup } from '../OptionGroup'
import { PrecisionSlider } from '../PrecisionSlider'
import {
  HANDEDNESS_OPTIONS, MINIMAL_UI_TAP_MODES, floatingPanelChoices, floatingPanelSelection, minimalUiAvailable,
  type FloatingPanelMode, type MinimalUiTapMode,
} from '../../lib/browser/uiPreferences'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './SettingsPanel.module.css'
import general from './GeneralTab.module.css'

const FLOATING_PANEL_LABELS: Record<FloatingPanelMode, TranslationKey> = {
  always: 'editorSettings.floatingPanel.always',
  minimal: 'editorSettings.floatingPanel.minimal',
  never: 'editorSettings.floatingPanel.never',
}

const MINIMAL_UI_TAP_LABELS: Record<MinimalUiTapMode, TranslationKey> = {
  single: 'editorSettings.minimalUiTap.single',
  double: 'editorSettings.minimalUiTap.double',
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
  const handedness = useSettingsStore(s => s.handedness)
  const setHandedness = useSettingsStore(s => s.setHandedness)
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

  const volumePercent = Math.round(soundVolume * 100)

  return (
    <div className={general.panel}>
      <Switch label={t('editorSettings.soundEnabled')} checked={soundEnabled} onChange={setSoundEnabled} />
      {soundEnabled && (
        <div className={general.volume}>
          <span className={general.label}>{t('editorSettings.soundVolume')}</span>
          <div className={general.volumeControl}>
            <PrecisionSlider orientation="horizontal" value={volumePercent} min={0} max={100} step={1}
              onChange={v => setSoundVolume(v / 100)} formatValue={v => `${v}%`} title={t('editorSettings.soundVolume')} />
            <span className={general.value}>{volumePercent}%</span>
          </div>
        </div>
      )}

      <div className={general.interface}>
        <div className={general.row}>
          <span className={general.label}>{t('settingsPage.handedness')}</span>
          <div className={general.control}>
            <OptionGroup variant="choices"
              options={HANDEDNESS_OPTIONS.map(id => ({ id, label: t(id === 'left' ? 'settingsPage.leftHanded' : 'settingsPage.rightHanded') }))}
              active={handedness} onSelect={setHandedness} ariaLabel={t('settingsPage.handedness')} />
          </div>
        </div>

        {minimalUiAvailable(deviceType) && (
          <>
            <Switch label={t('editorSettings.minimalUi')} checked={minimalUi} onChange={setMinimalUi} />
            {minimalUi && (
              <div className={general.row}>
                <span className={general.label}>{t('editorSettings.minimalUiTap')}</span>
                <div className={general.control}>
                  <OptionGroup variant="choices"
                    options={MINIMAL_UI_TAP_MODES.map(mode => ({ id: mode, label: t(MINIMAL_UI_TAP_LABELS[mode]) }))}
                    active={minimalUiTapMode} onSelect={setMinimalUiTapMode} ariaLabel={t('editorSettings.minimalUiTap')} />
                </div>
              </div>
            )}
          </>
        )}

        <div className={general.row}>
          <div className={general.heading}>
            <span className={general.label}>{t('editorSettings.floatingPanel')}</span>
            <Tooltip content={t('editorSettings.floatingPanelHint')}>
              <button type="button" className={styles.infoButton} aria-label={t('common.moreInfo')}><Icon name="info" /></button>
            </Tooltip>
          </div>
          <div className={general.control}>
            <OptionGroup variant="choices"
              options={floatingPanelChoices(deviceType).map(mode => ({ id: mode, label: t(FLOATING_PANEL_LABELS[mode]) }))}
              active={floatingPanelSelection(floatingPanel, deviceType)} onSelect={setFloatingPanel} ariaLabel={t('editorSettings.floatingPanel')} />
          </div>
        </div>
      </div>

        <ResetDefaultsFooter onClick={() => {
          const settings = useSettingsStore.getState()
          settings.setSoundEnabled(false); settings.setSoundVolume(0.7)
          settings.setMinimalUi(true); settings.setMinimalUiTapMode('double')
          settings.setFloatingPanel('minimal'); settings.setHandedness('right')
        }}>{t('common.resetDefaults')}</ResetDefaultsFooter>
    </div>
  )
}
