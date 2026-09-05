import type { ShapeFrame } from '@grafetto/shared'

import { useT } from '../../i18n'
import { NumberField } from '../../components/NumberField'
import { frameWithRatio, frameWithSize } from './shapeTool'
import styles from './ShapeFrameFields.module.css'

// (#530) Width, height and angle of the shape being placed, as numbers.
//
// For the frame-around-a-thumbnail case (#525's first scenario) this is
// arguably more of the feature than the drag is: an exact size cannot be set
// with a pen, and "about 400 wide" is not what a frame around a study means.
// The ratio presets are the same thought one level up — the sizes that matter
// in a composition exercise are ratios, not pixel counts.
//
// Shown only while a shape is open, in the quick settings column with the
// tool's other controls, and gone the moment the shape is confirmed: these
// fields edit *this* shape, not the tool.

/** The ratios worth one tap. Deliberately short: a list of every ratio anyone
 *  might want is a list nobody reads, and the numeric fields are right there
 *  for anything else. Square first because it is the one people reach for. */
const RATIO_PRESETS: Array<{ label: string; ratio: number }> = [
  { label: '1:1', ratio: 1 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
]

interface ShapeFrameFieldsProps {
  frame: ShapeFrame
  onChange: (frame: ShapeFrame) => void
}

export function ShapeFrameFields({ frame, onChange }: ShapeFrameFieldsProps) {
  const t = useT()
  const width = Math.round(Math.abs(frame.width))
  const height = Math.round(Math.abs(frame.height))
  const angle = Math.round((frame.angle * 180) / Math.PI)
  const ratio = height === 0 ? 1 : Math.abs(frame.width) / Math.abs(frame.height)

  return (
    <div className={styles.fields}>
      <label className={styles.row}>
        <span className={styles.label}>{t('room.shape.width')}</span>
        <NumberField
          label={t('room.shape.width')}
          value={width}
          min={1}
          max={100000}
          step={1}
          format={v => `${Math.round(v)}`}
          onChange={v => onChange(frameWithSize(frame, 'width', v))}
        />
      </label>
      <label className={styles.row}>
        <span className={styles.label}>{t('room.shape.height')}</span>
        <NumberField
          label={t('room.shape.height')}
          value={height}
          min={1}
          max={100000}
          step={1}
          format={v => `${Math.round(v)}`}
          onChange={v => onChange(frameWithSize(frame, 'height', v))}
        />
      </label>
      <label className={styles.row}>
        <span className={styles.label}>{t('tool.field.angle')}</span>
        <NumberField
          label={t('tool.field.angle')}
          value={angle}
          min={-360}
          max={360}
          step={1}
          format={v => `${Math.round(v)}°`}
          onChange={v => onChange({ ...frame, angle: (v * Math.PI) / 180 })}
        />
      </label>
      <div className={styles.ratios} role="group" aria-label={t('room.shape.ratio')}>
        {RATIO_PRESETS.map(preset => (
          <button
            key={preset.label}
            className={styles.ratio}
            // Lit when the frame already has this shape, within a tolerance
            // that matches what the eye can tell apart at these sizes: a frame
            // dragged to "about 4:3" should show which preset it is near.
            aria-pressed={Math.abs(ratio - preset.ratio) < 0.02}
            onClick={() => onChange(frameWithRatio(frame, preset.ratio))}
          >{preset.label}</button>
        ))}
      </div>
    </div>
  )
}
