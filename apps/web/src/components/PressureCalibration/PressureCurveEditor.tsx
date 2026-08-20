import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { clamp } from 'lodash-es'

import {
  MAX_CURVE_POINTS, compilePressureCurve, type PressureCurvePoint,
} from '../../lib/pressureCalibration'
import { useT } from '../../i18n'
import styles from './PressureCalibration.module.css'

interface PressureCurveEditorProps {
  points: PressureCurvePoint[]
  onChange: (points: PressureCurvePoint[]) => void
}

/** Sampled positions of the drawn curve. 48 is well past what the eye resolves
 *  in a 200px box and cheap enough to recompute on every drag frame. */
const SAMPLES = 48

/** How far outside the box a point has to be dragged to be deleted. Generous:
 *  removing a point by accident is worse than having to drag further. */
const DELETE_MARGIN = 24

/** Minimum gap in x between neighbouring knots, matching what
 *  `normalizeCurvePoints` would otherwise silently drop. Enforced while
 *  dragging so a point can't be shoved somewhere the curve won't keep it. */
const MIN_GAP = 0.05

/** The response curve, as a graph you drag (#475).
 *
 *  Input runs left to right (light press → firm press), output bottom to top
 *  (faint mark → full mark), with the diagonal drawn behind as the "unchanged"
 *  reference — the shape of the deviation from that line is the entire content
 *  of the setting, and without it a lone curve says nothing.
 *
 *  The endpoints are not draggable on purpose: the wizard's range measurement
 *  already decides what counts as no press and as a full press, and a second
 *  control for the same quantity is how a person ends up with a calibration
 *  that can no longer reach 1. */
export function PressureCurveEditor({ points, onChange }: PressureCurveEditorProps) {
  const t = useT()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const curvePath = useMemo(() => {
    const curve = compilePressureCurve(points)
    let d = ''
    for (let i = 0; i <= SAMPLES; i++) {
      const x = i / SAMPLES
      d += `${i === 0 ? 'M' : 'L'}${(x * 100).toFixed(2)},${((1 - curve(x)) * 100).toFixed(2)}`
    }
    return d
  }, [points])

  const toGraph = (e: ReactPointerEvent): { x: number; y: number; outside: boolean } => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0, outside: false }
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    return {
      x: clamp(px / rect.width, 0, 1),
      y: clamp(1 - py / rect.height, 0, 1),
      outside:
        px < -DELETE_MARGIN || px > rect.width + DELETE_MARGIN ||
        py < -DELETE_MARGIN || py > rect.height + DELETE_MARGIN,
    }
  }

  const startDrag = (index: number) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(index)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragging === null) return
    const { x, y } = toGraph(e)
    const lower = dragging === 0 ? 0 : points[dragging - 1].x
    const upper = dragging === points.length - 1 ? 1 : points[dragging + 1].x
    const next = points.map((p, i) =>
      i === dragging ? { x: clamp(x, lower + MIN_GAP, upper - MIN_GAP), y } : p,
    )
    onChange(next)
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragging === null) return
    const { outside } = toGraph(e)
    if (outside) onChange(points.filter((_, i) => i !== dragging))
    setDragging(null)
  }

  // A press on empty graph adds a knot there, which is the only way to get a
  // third one and the fastest way to get the first. Guarded by the same
  // spacing rule as dragging, so a tap right on top of an existing point is
  // ignored rather than creating one the normalizer will drop.
  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (points.length >= MAX_CURVE_POINTS) return
    const { x, y } = toGraph(e)
    if (x < MIN_GAP || x > 1 - MIN_GAP) return
    if (points.some(p => Math.abs(p.x - x) < MIN_GAP)) return
    onChange([...points, { x, y }].sort((a, b) => a.x - b.x))
  }

  return (
    <div className={styles.curveBox}>
      <svg
        ref={svgRef}
        className={styles.curveSvg}
        viewBox="0 0 100 100"
        role="img"
        aria-label={t('pressure.curve')}
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect x="0" y="0" width="100" height="100" className={styles.curveField} />
        {[25, 50, 75].map(v => (
          <g key={v}>
            <line x1={v} y1="0" x2={v} y2="100" className={styles.curveGrid} />
            <line x1="0" y1={v} x2="100" y2={v} className={styles.curveGrid} />
          </g>
        ))}
        <line x1="0" y1="100" x2="100" y2="0" className={styles.curveReference} />
        <path d={curvePath} className={styles.curveLine} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x * 100}
            cy={(1 - p.y) * 100}
            r="4.5"
            className={i === dragging ? styles.curveKnobActive : styles.curveKnob}
            onPointerDown={startDrag(i)}
          />
        ))}
      </svg>
      <div className={styles.curveAxis}>
        <span>{t('pressure.axisLight')}</span>
        <span>{t('pressure.axisFirm')}</span>
      </div>
    </div>
  )
}
