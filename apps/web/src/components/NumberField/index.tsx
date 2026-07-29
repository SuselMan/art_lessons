import { useCallback, useRef, useState } from 'react'
import clsx from 'clsx'

import { useDragToAdjust } from '../../lib/useDragToAdjust'
import { Icon } from '../Icon'
import { parseNumberInput, snapToStep, stepValue } from './numberField'
import styles from './NumberField.module.css'

/** Pixels of vertical drag that cover the field's whole min…max range. Chosen
 *  over a per-field `sensitivity` (what the header's zoom/rotation readouts
 *  take) because this component is handed arbitrary ranges from TOOL_SCHEMAS —
 *  0…1 opacity and 1…120 size have to feel the same under the finger, and only
 *  a range-relative figure does that. ~2.5 screen-heights of travel on a
 *  tablet at the extremes, which is deliberately unhurried: the arrow keys and
 *  typing are there for precision, the drag is for "a bit more than this". */
const DRAG_RANGE_PX = 400

interface NumberFieldProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Renders the value for display ("12px", "100%", "45°00′"). The field is
   *  edited in this same formatted form — see `parse`. */
  format?: (value: number) => string
  /** Reads a typed string back into a raw value, inverting `format`. Defaults
   *  to a plain number read, which is right for every format that only
   *  *decorates* the number (px, plain degrees) and wrong for any that
   *  rescales it (opacity's percent) or has more than one component (the
   *  marker angle's degrees+minutes) — those pass their own. */
  parse?: (text: string) => number | null
  /** Accessible name — the field's own label text, which lives in the row
   *  above rather than inside this component. */
  label: string
  title?: string
  className?: string
}

/** A numeric value that can be typed, stepped, or dragged (#335).
 *
 *  Three ways in, because the app has three input situations: a keyboard
 *  (type a number, or arrow up/down — with Shift for ten steps at a time), a
 *  mouse (the same, plus the hover spinner), and a bare finger on a tablet,
 *  where the field is dragged vertically exactly like the header's zoom and
 *  rotation readouts (`useDragToAdjust`, the same hook).
 *
 *  Typing is committed on Enter or blur, not per keystroke: half-typed input
 *  ("1" on the way to "120", or an empty field mid-edit) must not reach the
 *  engine, and Escape has to be able to put the original value back. */
export function NumberField({
  value, min, max, step, onChange, format, parse, label, title, className,
}: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Non-null only while someone is typing: the field shows the live value the
  // rest of the time, so a drag or an arrow key is reflected immediately.
  const [draft, setDraft] = useState<string | null>(null)

  const display = format ? format(value) : String(value)

  const commit = useCallback((text: string) => {
    const raw = (parse ?? parseNumberInput)(text)
    setDraft(null)
    if (raw !== null) onChange(snapToStep(raw, step, min, max))
  }, [parse, onChange, step, min, max])

  const nudge = useCallback((direction: 1 | -1, big: boolean) => {
    onChange(stepValue(value, direction, { step, min, max, big }))
  }, [value, step, min, max, onChange])

  const { onPointerDown } = useDragToAdjust(
    value,
    v => onChange(snapToStep(v, step, min, max)),
    { min, max, sensitivity: (max - min) / DRAG_RANGE_PX },
  )

  /** The drag covers the whole pill except the spinner. It has to: the drag
   *  takes a pointer capture on the wrapper, and a captured pointer delivers
   *  its `click` to the capturing element rather than to the button under the
   *  finger — so with the spinner inside the drag zone, its arrows silently
   *  did nothing. */
  const onFieldPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('[data-spinner]')) return
    onPointerDown(e)
  }, [onPointerDown])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const big = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown'
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      // Stepping abandons whatever half-typed draft is in the box — it steps
      // the committed value, which is what's actually in effect.
      setDraft(null); nudge(1, big); e.preventDefault()
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      setDraft(null); nudge(-1, big); e.preventDefault()
    } else if (e.key === 'Enter') {
      commit(e.currentTarget.value); e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setDraft(null); e.currentTarget.blur()
    }
  }, [nudge, commit])

  return (
    <div
      className={clsx(styles.field, className)}
      // The drag lives on the wrapper rather than the <input> so a plain click
      // still lands in the input and focuses it — useDragToAdjust only takes
      // over once the pointer has actually moved past its threshold, and
      // suppresses the click that follows a real drag.
      onPointerDown={onFieldPointerDown}
      title={title}
    >
      <input
        ref={inputRef}
        className={styles.input}
        // Not type="number": its own spinner and locale-dependent parsing get
        // in the way, and the field's displayed value carries a unit suffix
        // ("12px") that a number input refuses outright.
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft ?? display}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={e => commit(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {/* Hover/focus-only on purpose: on a tablet there's no hover, and the
          drag gesture covers the same ground without spending 2 × 16px of a
          narrow panel's width permanently. */}
      <span className={styles.spinner} data-spinner>
        <button
          type="button" tabIndex={-1} className={styles.spinnerBtn}
          aria-label={`${label} +`}
          onClick={e => { nudge(1, e.shiftKey); inputRef.current?.focus() }}
        ><Icon name="keyboard_arrow_up" /></button>
        <button
          type="button" tabIndex={-1} className={styles.spinnerBtn}
          aria-label={`${label} −`}
          onClick={e => { nudge(-1, e.shiftKey); inputRef.current?.focus() }}
        ><Icon name="keyboard_arrow_down" /></button>
      </span>
    </div>
  )
}
