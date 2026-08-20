import { useEffect, useRef, useState } from 'react'

import { CalibrationWizard } from '../PressureCalibration/CalibrationWizard'
import { PressureCurveEditor } from '../PressureCalibration/PressureCurveEditor'
import { useT } from '../../i18n'
import {
  IDENTITY_PRESSURE_CALIBRATION, PRESSURE_CURVE_PRESETS, PRESSURE_CURVE_PRESET_POINTS,
  matchingCurvePreset, type PressureCurvePoint, type PressureCurvePreset,
} from '../../lib/pressureCalibration'
import type { TranslationKey } from '../../i18n'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './SettingsPanel.module.css'

const PRESET_LABELS: Record<PressureCurvePreset, TranslationKey> = {
  softer: 'pressure.preset.softer',
  linear: 'pressure.preset.linear',
  firmer: 'pressure.preset.firmer',
}

interface StylusTabProps {
  /** The wizard needs room to draw a stroke in, which the settings modal at
   *  its usual width does not have. Reported upward rather than solved here so
   *  the modal stays the one thing deciding its own size. */
  onWideChange: (wide: boolean) => void
}

/** Pen settings (#475): what this device's stylus reports, and how that report
 *  is shaped.
 *
 *  Here rather than in `pages/Settings` for the reason `GeneralTab` states —
 *  anything about drawing itself belongs next to the drawing it changes. That
 *  matters more here than anywhere else in this panel: a pressure curve is
 *  tuned by dragging it, drawing a line, and dragging it again, and the
 *  account-wide settings screen is a different page with no canvas on it. */
export function StylusTab({ onWideChange }: StylusTabProps) {
  const t = useT()
  const calibration = useSettingsStore(s => s.pressureCalibration)
  const setCalibration = useSettingsStore(s => s.setPressureCalibration)
  const [calibrating, setCalibrating] = useState(false)
  const calibrateRef = useRef<HTMLButtonElement | null>(null)
  const wasCalibrating = useRef(false)

  useEffect(() => {
    onWideChange(calibrating)
    return () => { onWideChange(false) }
  }, [calibrating, onWideChange])

  // Leaving the wizard puts focus back on the button that opened it. Not
  // politeness: every way out of the wizard is a button that unmounts itself,
  // which drops focus to `body` — and Modal's Escape handler sits on the
  // backdrop and only fires while focus is inside it (see its own comment on
  // why it is not on window). Without this the panel silently stops closing on
  // Escape until the person clicks somewhere inside it again. Guarded on
  // having actually been calibrating, so opening the tab doesn't steal focus
  // from the tab strip.
  useEffect(() => {
    if (wasCalibrating.current && !calibrating) calibrateRef.current?.focus()
    wasCalibrating.current = calibrating
  }, [calibrating])

  // The two halves of a calibration are reported separately, because Reset
  // clears only the range: judging this row by the whole calibration would
  // make a reset range still read as "calibrated" whenever a curve is set.
  const rangeMeasured = calibration.inMin !== 0 || calibration.inMax !== 1
  const activePreset = matchingCurvePreset(calibration.points)

  // The curve writes through immediately, unlike the wizard: it is meant to be
  // dragged, tried on the canvas and dragged again, and a Save step between
  // every attempt would make that loop useless. Same rule the sound volume in
  // GeneralTab follows.
  const setPoints = (points: PressureCurvePoint[]) => {
    setCalibration({ ...calibration, points })
  }

  if (calibrating) {
    return (
      <CalibrationWizard
        points={calibration.points}
        onApply={next => {
          setCalibration(next)
          setCalibrating(false)
        }}
        onCancel={() => { setCalibrating(false) }}
      />
    )
  }

  return (
    <div className={styles.flagList}>
      <div className={styles.sectionHeading}>{t('pressure.rangeSection')}</div>

      <div className={styles.choiceRow}>
        <div className={styles.flagLabel}>
          {rangeMeasured
            ? t('pressure.rangeValue', {
              min: calibration.inMin.toFixed(2),
              max: calibration.inMax.toFixed(2),
            })
            : t('pressure.notCalibrated')}
        </div>
        <div className={styles.flagDescription}>{t('pressure.rangeHint')}</div>
        <div className={styles.buttonRow}>
          <button
            type="button"
            ref={calibrateRef}
            className={styles.hotkeyBtn}
            onClick={() => { setCalibrating(true) }}
          >
            {rangeMeasured ? t('pressure.recalibrate') : t('pressure.calibrate')}
          </button>
          {rangeMeasured && (
            <button
              type="button"
              className={styles.hotkeyBtn}
              onClick={() => { setCalibration({ ...IDENTITY_PRESSURE_CALIBRATION, points: calibration.points }) }}
            >
              {t('pressure.resetRange')}
            </button>
          )}
        </div>
      </div>

      <div className={styles.sectionHeading}>{t('pressure.curveSection')}</div>

      <div className={styles.choiceRow}>
        <div className={styles.flagDescription}>{t('pressure.curveHint')}</div>
        <div className={styles.buttonRow}>
          {PRESSURE_CURVE_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              className={preset === activePreset ? styles.presetBtnActive : styles.hotkeyBtn}
              aria-pressed={preset === activePreset}
              onClick={() => { setPoints(PRESSURE_CURVE_PRESET_POINTS[preset]) }}
            >
              {t(PRESET_LABELS[preset])}
            </button>
          ))}
        </div>
        <PressureCurveEditor points={calibration.points} onChange={setPoints} />
        <div className={styles.flagDescription}>{t('pressure.curveEditHint')}</div>
      </div>
    </div>
  )
}
