import clsx from 'clsx'

import { Icon } from '../Icon'
import { CURVE_GRAPH_PADDING, curveGraphPoints } from './optionCurveGraph'
import type { PickerOption } from './types'
import styles from './OptionPicker.module.css'

interface OptionPreviewProps {
  option: PickerOption
  /** 'strip': the sample stroke at its natural landscape proportions, for a
   *  list row. 'dot': the middle of that same stroke cropped to a circle, for
   *  the quick-panel button — a 500-px-wide strip squeezed into a 40 px
   *  toolbar slot would be a grey smudge, while its middle is exactly the
   *  part that carries the tone. */
  shape: 'strip' | 'dot'
}

// The strip's own box, in SVG user units — same 88x34 the CSS gives
// .previewStrip, so the graph is drawn at 1:1 and its 1-px stroke stays a
// 1-px stroke. The dot renders the same curve in a square.
const GRAPH_WIDTH = 88
const GRAPH_HEIGHT = 34
const GRAPH_DOT_SIZE = 30

/** The visual half of one option: a cropped sample stroke, an icon, or a line
 *  graph — see PickerOption for which kind of option gets which. The circle is
 *  a CSS crop of the same asset rather than a second set of round files — same
 *  pixels, same download, and one place to replace when a stroke is re-shot. */
export function OptionPreview({ option, shape }: OptionPreviewProps) {
  if (option.icon) {
    return (
      <span className={clsx(styles.preview, shape === 'dot' ? styles.previewIconDot : styles.previewIcon)}>
        <Icon name={option.icon} />
      </span>
    )
  }
  if (option.curve) {
    const dot = shape === 'dot'
    const width = dot ? GRAPH_DOT_SIZE : GRAPH_WIDTH
    const height = dot ? GRAPH_DOT_SIZE : GRAPH_HEIGHT
    return (
      <span className={clsx(styles.preview, dot ? styles.previewGraphDot : styles.previewGraph)}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="presentation">
          {/* The baseline is what makes the curve readable as a curve: without
              a floor to leave, a slow ramp and a flat line look alike at this
              size. Drawn inside the same padding so the two agree at x=0. */}
          <line
            className={styles.graphAxis}
            x1={CURVE_GRAPH_PADDING} y1={height - CURVE_GRAPH_PADDING}
            x2={width - CURVE_GRAPH_PADDING} y2={height - CURVE_GRAPH_PADDING}
          />
          <polyline
            className={styles.graphLine}
            points={curveGraphPoints(option.curve, width, height)}
          />
        </svg>
      </span>
    )
  }
  if (!option.image) return null
  return (
    <span
      className={clsx(styles.preview, shape === 'dot' ? styles.previewDot : styles.previewStrip)}
      style={{ backgroundImage: `url(${option.image})` }}
      role="presentation"
    />
  )
}
