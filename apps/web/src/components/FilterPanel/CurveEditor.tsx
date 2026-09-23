import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { clamp } from 'lodash-es'

import type { CurvePoint } from '@grafetto/shared'
import { LAYER_FILTER_LIMITS } from '@grafetto/shared'

import { curveLut } from '../../engine'
import styles from './FilterPanel.module.css'

interface CurveEditorProps {
  points: CurvePoint[]
  onChange: (points: CurvePoint[]) => void
  /** Stroke colour of the curve — the channel being edited. */
  tone: 'value' | 'red' | 'green' | 'blue'
  label: string
}

/** How far outside the box a point has to be dragged to be removed. Generous
 *  for the same reason as the pressure curve's: losing a point by accident is
 *  worse than dragging a little further. */
const DELETE_MARGIN = 24

/** Minimum gap between neighbouring points, in levels. */
const MIN_GAP = 4

/** (#574) One channel of the Curves filter, as a graph you drag: input level
 *  left to right, output bottom to top, the diagonal behind it as "unchanged".
 *
 *  Unlike the pressure curve (#475) the end points move too — lifting the
 *  black point or pulling down the white one is the most common thing done
 *  with a curves dialog. They cannot be removed, only moved.
 *
 *  The line drawn is `curveLut`, the very table the engine applies, so the
 *  graph cannot promise a different curve from the one that will be used. */
export function CurveEditor({ points, onChange, tone, label }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const path = useMemo(() => {
    const lut = curveLut(points)
    let d = ''
    for (let x = 0; x < 256; x += 3) {
      d += `${x === 0 ? 'M' : 'L'}${((x / 255) * 100).toFixed(2)},${(100 - (lut[x] / 255) * 100).toFixed(2)}`
    }
    return `${d}L100,${(100 - (lut[255] / 255) * 100).toFixed(2)}`
  }, [points])

  const toLevels = (e: ReactPointerEvent): { x: number; y: number; outside: boolean } => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0, outside: false }
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    return {
      x: Math.round(clamp(px / rect.width, 0, 1) * 255),
      y: Math.round(clamp(1 - py / rect.height, 0, 1) * 255),
      outside: px < -DELETE_MARGIN || px > rect.width + DELETE_MARGIN
        || py < -DELETE_MARGIN || py > rect.height + DELETE_MARGIN,
    }
  }

  const move = (index: number, x: number, y: number): CurvePoint[] => {
    const lower = index === 0 ? 0 : points[index - 1][0] + MIN_GAP
    const upper = index === points.length - 1 ? 255 : points[index + 1][0] - MIN_GAP
    return points.map((p, i): CurvePoint => (i === index ? [clamp(x, lower, upper), y] : p))
  }

  const startDrag = (index: number) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    setDragging(index)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragging === null) return
    const { x, y } = toLevels(e)
    onChange(move(dragging, x, y))
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragging === null) return
    const isEnd = dragging === 0 || dragging === points.length - 1
    if (toLevels(e).outside && !isEnd) onChange(points.filter((_, i) => i !== dragging))
    setDragging(null)
  }

  // A press on the empty graph adds a point there and starts dragging it —
  // one gesture to place a point where it belongs, rather than tap then drag.
  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (points.length >= LAYER_FILTER_LIMITS.curvePoints) return
    const { x, y } = toLevels(e)
    if (points.some(p => Math.abs(p[0] - x) < MIN_GAP)) return
    const added: CurvePoint = [x, y]
    const next = [...points, added].sort((a, b) => a[0] - b[0])
    if (next[0][0] !== points[0][0] || next[next.length - 1][0] !== points[points.length - 1][0]) return
    svgRef.current?.setPointerCapture(e.pointerId)
    setDragging(next.findIndex(p => p[0] === x))
    onChange(next)
  }

  return (
    <svg
      ref={svgRef}
      className={styles.curveSvg}
      viewBox="-3 -3 106 106"
      role="img"
      aria-label={label}
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
      <path d={path} className={styles.curveLine} data-tone={tone} />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={(p[0] / 255) * 100}
          cy={100 - (p[1] / 255) * 100}
          r="3.5"
          className={i === dragging ? styles.curveKnobActive : styles.curveKnob}
          onPointerDown={startDrag(i)}
        />
      ))}
    </svg>
  )
}
