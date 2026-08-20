import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import {
  MIN_CALIBRATION_SAMPLES, calibrationFromMeasurement, compilePressureCalibration, measurePressure,
  type PressureCalibration, type PressureCurvePoint, type PressureMeasurement, type PressureVerdict,
} from '../../lib/pressureCalibration'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { centreOffset, clearTrace, drawTrace, sizeCanvasToBox, type TracePoint } from './strokeTrace'
import styles from './PressureCalibration.module.css'

interface CalibrationWizardProps {
  /** The curve already tuned, if any. Carried through untouched: re-measuring
   *  the range is not a reason to throw away someone's response shape. */
  points: PressureCurvePoint[]
  onApply: (calibration: PressureCalibration) => void
  onCancel: () => void
}

type Step = 'light' | 'firm' | 'result'

const STEP_PROMPT: Record<'light' | 'firm', TranslationKey> = {
  light: 'pressure.wizard.lightPrompt',
  firm: 'pressure.wizard.firmPrompt',
}

const VERDICT_MESSAGE: Record<Exclude<PressureVerdict, 'ok'>, TranslationKey> = {
  noRange: 'pressure.wizard.noRange',
  reversed: 'pressure.wizard.reversed',
  tooFewSamples: 'pressure.wizard.tooShort',
}

/** Measures what this pen reports (#475).
 *
 *  Two strokes, in the person's own hand: the lightest mark they make on
 *  purpose and the firmest press they can comfortably hold. The second one is
 *  deliberately *not* "as hard as you can" — calibrating against a press
 *  nobody sustains reproduces the original complaint at a different force.
 *
 *  The first screen is also the diagnostic, and that is not a side effect: a
 *  pen reporting a constant 0.5 (what a browser sends for a stylus with no
 *  pressure sensor) and a pen reporting a compressed range look identical from
 *  inside the app, and the numbers under the strip are what separates them.
 *
 *  Nothing is written until Apply. Every other setting in this panel writes
 *  through immediately, and this one deliberately doesn't: a half-finished
 *  measurement is not a preference, and a person who walked away mid-wizard
 *  must not come back to a pen that behaves differently. */
export function CalibrationWizard({ points, onApply, onCancel }: CalibrationWizardProps) {
  const t = useT()
  const [step, setStep] = useState<Step>('light')
  const [light, setLight] = useState<TracePoint[]>([])
  const [firm, setFirm] = useState<TracePoint[]>([])
  const [measurement, setMeasurement] = useState<PressureMeasurement | null>(null)
  const [notAPen, setNotAPen] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const meterRef = useRef<HTMLDivElement | null>(null)
  const readoutRef = useRef<HTMLSpanElement | null>(null)
  // The in-progress stroke lives in a ref, not in state: a stylus reports up to
  // 360 samples a second and each one repaints the strip imperatively. Only the
  // finished stroke becomes state.
  const strokeRef = useRef<TracePoint[]>([])
  const drawingRef = useRef(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = sizeCanvasToBox(canvas)
    if (!ctx) return
    clearTrace(ctx, canvas)
    // Raw, unmapped: while recording, the strip's job is to show what the pen
    // reports, not what we would like it to report.
    drawTrace(ctx, strokeRef.current, raw => raw)
  }, [])

  // The strip is remounted between steps, and a device rotation or a panel
  // resize changes its box — both need the backing store resized and the
  // recorded stroke repainted at the new scale.
  useEffect(() => {
    if (step === 'result') return
    redraw()
    const observer = new ResizeObserver(() => { redraw() })
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => { observer.disconnect() }
  }, [step, redraw])

  const setMeter = (pressure: number | null) => {
    if (meterRef.current) meterRef.current.style.width = `${Math.round((pressure ?? 0) * 100)}%`
    if (readoutRef.current) readoutRef.current.textContent = pressure === null ? '—' : pressure.toFixed(2)
  }

  const localPoint = (e: ReactPointerEvent<HTMLCanvasElement>): TracePoint => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Pen only, and refused rather than silently accepted: a mouse reports a
    // constant substituted pressure, so a "calibration" measured with one
    // would be a correction fitted to a signal that does not exist, then
    // applied to the stylus that does.
    if (e.pointerType !== 'pen') {
      setNotAPen(true)
      return
    }
    setNotAPen(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    strokeRef.current = [localPoint(e)]
    setMeter(e.pressure)
    redraw()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    // Coalesced samples matter here for the same reason they matter in the
    // engine: on a high-rate stylus most of the stroke arrives through them,
    // and a measurement built from the outer events alone would be sampling
    // the pen at whatever rate the display happens to run at.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    const rect = e.currentTarget.getBoundingClientRect()
    if (events.length > 0) {
      for (const ev of events) {
        strokeRef.current.push({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, pressure: ev.pressure })
      }
    } else {
      strokeRef.current.push(localPoint(e))
    }
    setMeter(e.pressure)
    redraw()
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    setMeter(null)
    const stroke = strokeRef.current
    if (stroke.length < MIN_CALIBRATION_SAMPLES) return // a tap or a slip: let them try again
    if (step === 'light') {
      setLight(stroke)
      strokeRef.current = []
      setStep('firm')
    } else if (step === 'firm') {
      setFirm(stroke)
      setMeasurement(measurePressure(light.map(p => p.pressure), stroke.map(p => p.pressure)))
      setStep('result')
    }
  }

  const restart = () => {
    strokeRef.current = []
    setLight([])
    setFirm([])
    setMeasurement(null)
    setNotAPen(false)
    setStep('light')
  }

  if (step === 'result' && measurement !== null) {
    return (
      <ResultStep
        measurement={measurement}
        firm={firm}
        points={points}
        onRestart={restart}
        onCancel={onCancel}
        onApply={onApply}
      />
    )
  }

  // Narrowed for the prompt lookup: 'result' is handled by the early return
  // above, which TypeScript can't see through on its own.
  const captureStep: 'light' | 'firm' = step === 'firm' ? 'firm' : 'light'

  return (
    <div className={styles.wizard}>
      <p className={styles.prompt}>{t(STEP_PROMPT[captureStep])}</p>

      <canvas
        ref={canvasRef}
        className={styles.strip}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div className={styles.meterRow}>
        <span className={styles.meterLabel}>{t('pressure.reported')}</span>
        <div className={styles.meter}>
          <div ref={meterRef} className={styles.meterFill} style={{ width: '0%' }} />
        </div>
        <span ref={readoutRef} className={styles.meterValue}>—</span>
      </div>

      {notAPen && <p className={styles.warning}>{t('pressure.wizard.penOnly')}</p>}

      <div className={styles.actions}>
        <span className={styles.stepCount}>{t('pressure.wizard.step', { n: captureStep === 'light' ? 1 : 2 })}</span>
        <button type="button" className={styles.btn} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}

interface ResultStepProps {
  measurement: PressureMeasurement
  firm: TracePoint[]
  points: PressureCurvePoint[]
  onRestart: () => void
  onCancel: () => void
  onApply: (calibration: PressureCalibration) => void
}

/** What the measurement found, and what it would change.
 *
 *  The comparison redraws the firm stroke that was just recorded, twice: as it
 *  is today and as it would be calibrated. Both halves render the same
 *  samples through the same code, so the difference between them is the
 *  calibration and nothing else — which is the only claim this screen makes. */
function ResultStep({ measurement, firm, points, onRestart, onCancel, onApply }: ResultStepProps) {
  const t = useT()
  const beforeRef = useRef<HTMLCanvasElement | null>(null)
  const afterRef = useRef<HTMLCanvasElement | null>(null)
  const failure = measurement.verdict === 'ok' ? null : VERDICT_MESSAGE[measurement.verdict]
  const usable = failure === null
  const calibration = useMemo(
    () => calibrationFromMeasurement(measurement, points),
    [measurement, points],
  )

  useEffect(() => {
    if (!usable) return
    const pairs: [HTMLCanvasElement | null, (raw: number) => number][] = [
      [beforeRef.current, raw => raw],
      [afterRef.current, compilePressureCalibration(calibration)],
    ]
    for (const [canvas, map] of pairs) {
      if (!canvas) continue
      const ctx = sizeCanvasToBox(canvas)
      if (!ctx) continue
      clearTrace(ctx, canvas)
      drawTrace(ctx, firm, map, centreOffset(canvas, firm))
    }
  }, [usable, firm, calibration])

  return (
    <div className={styles.wizard}>
      {usable ? (
        <>
          <p className={styles.prompt}>
            {measurement.lowCeiling
              ? t('pressure.wizard.foundLowCeiling')
              : t('pressure.wizard.found')}
          </p>
          <div className={styles.numbers}>
            <Readout label={t('pressure.wizard.lightLevel')} value={measurement.light} />
            <Readout label={t('pressure.wizard.firmLevel')} value={measurement.heavy} />
            <Readout label={t('pressure.wizard.observedMax')} value={measurement.observedMax} />
          </div>
          <div className={styles.compare}>
            <div className={styles.compareHalf}>
              <span className={styles.compareLabel}>{t('pressure.wizard.before')}</span>
              <canvas ref={beforeRef} className={styles.compareCanvas} />
            </div>
            <div className={styles.compareHalf}>
              <span className={styles.compareLabel}>{t('pressure.wizard.after')}</span>
              <canvas ref={afterRef} className={styles.compareCanvas} />
            </div>
          </div>
        </>
      ) : (
        <>
          <p className={styles.warning}>{failure !== null && t(failure)}</p>
          <div className={styles.numbers}>
            <Readout label={t('pressure.wizard.lightLevel')} value={measurement.light} />
            <Readout label={t('pressure.wizard.firmLevel')} value={measurement.heavy} />
            <Readout label={t('pressure.wizard.observedMax')} value={measurement.observedMax} />
          </div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={onRestart}>{t('pressure.wizard.again')}</button>
        <button type="button" className={styles.btn} onClick={onCancel}>{t('common.cancel')}</button>
        {usable && (
          <button type="button" className={styles.btnPrimary} onClick={() => onApply(calibration)}>
            {t('pressure.wizard.apply')}
          </button>
        )}
      </div>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.number}>
      <span className={styles.numberValue}>{value.toFixed(2)}</span>
      <span className={styles.numberLabel}>{label}</span>
    </div>
  )
}
