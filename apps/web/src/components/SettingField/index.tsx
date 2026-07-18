import { PrecisionSlider } from '../PrecisionSlider'
import { Icon } from '../Icon'
import { rgbToHex } from '../../lib/color'
import type { SettingDescriptor } from '../../pages/Room/toolSchemas'
import styles from './SettingField.module.css'

interface SettingFieldProps {
  descriptor: SettingDescriptor
  value: SettingDescriptor['default']
  onChange: (value: SettingDescriptor['default']) => void
  /** 'toolbar': narrow vertical quick-access rendering (left toolbar).
   *  'panel': wider horizontal rendering (the "Tool settings" side-panel tab, #197). */
  layout: 'toolbar' | 'panel'
  /** Called when a 'swatch' control (color fields) is clicked — SettingField
   *  itself has no opinion on what a full color-editing surface looks like
   *  (that's ColorPicker, opened elsewhere via the existing 'color' SidePanel
   *  tab); this just reports the intent to expand. */
  onExpand?: () => void
}

const ENUM_TRACK_HEIGHT = 108
const RANGE_TRACK_HEIGHT = 76

/** One generic control per tool setting (#196) — the same component renders
 *  every field for every tool, in both the toolbar's quick-access row and the
 *  full "Tool settings" panel tab, switching purely on
 *  `descriptor.valueType.kind`. Adding a new tool/setting is a data change in
 *  toolSchemas.ts; this file does not grow per tool. */
export function SettingField({ descriptor, value, onChange, layout, onExpand }: SettingFieldProps) {
  const { valueType } = descriptor

  if (valueType.kind === 'numberRange') {
    const numValue = value as number
    if (layout === 'toolbar') {
      return (
        <div className={styles.toolbarBlock} title={descriptor.name}>
          <span className={styles.toolbarValue}>
            {valueType.format ? valueType.format(numValue) : numValue}
          </span>
          <div className={styles.toolbarTrack}>
            <PrecisionSlider
              value={numValue}
              min={valueType.min} max={valueType.max} step={valueType.step}
              trackHeight={RANGE_TRACK_HEIGHT}
              onChange={v => onChange(v)}
              formatValue={valueType.format}
              title={descriptor.name}
            />
          </div>
        </div>
      )
    }
    return (
      <label className={styles.panelRow}>
        <span className={styles.panelLabel}>{descriptor.name}</span>
        <input
          type="range"
          className={styles.panelRange}
          min={valueType.min} max={valueType.max} step={valueType.step}
          value={numValue}
          onChange={e => onChange(Number(e.target.value))}
        />
        <span className={styles.panelValue}>
          {valueType.format ? valueType.format(numValue) : numValue}
        </span>
      </label>
    )
  }

  if (valueType.kind === 'enumOptions') {
    const strValue = value as string
    const index = Math.max(0, valueType.options.indexOf(strValue))
    if (layout === 'toolbar') {
      return (
        <div className={styles.toolbarBlock} title={descriptor.name}>
          <div className={styles.toolbarTrack} style={{ height: ENUM_TRACK_HEIGHT }}>
            <PrecisionSlider
              value={index}
              min={0} max={valueType.options.length - 1} step={1}
              trackHeight={ENUM_TRACK_HEIGHT}
              onChange={v => onChange(valueType.options[v])}
              formatValue={v => valueType.options[v]}
              title={descriptor.name}
            />
          </div>
          <span className={styles.toolbarValue}>{strValue}</span>
        </div>
      )
    }
    return (
      <label className={styles.panelRow}>
        <span className={styles.panelLabel}>{descriptor.name}</span>
        <input
          type="range"
          className={styles.panelRange}
          min={0} max={valueType.options.length - 1} step={1}
          value={index}
          onChange={e => onChange(valueType.options[Number(e.target.value)])}
        />
        <span className={styles.panelValue}>{strValue}</span>
      </label>
    )
  }

  if (valueType.kind === 'boolean') {
    const boolValue = value as boolean
    if (layout === 'toolbar') {
      return (
        <button
          className={styles.toolbarToggle}
          aria-pressed={boolValue}
          title={descriptor.name}
          onClick={() => onChange(!boolValue)}
        >
          <Icon name={boolValue ? 'check_box' : 'check_box_outline_blank'} />
        </button>
      )
    }
    return (
      <label className={styles.panelRow}>
        <span className={styles.panelLabel}>{descriptor.name}</span>
        <input
          type="checkbox"
          checked={boolValue}
          onChange={e => onChange(e.target.checked)}
        />
      </label>
    )
  }

  // valueType.kind === 'color'
  const rgb = value as [number, number, number]
  return (
    <button
      className={layout === 'toolbar' ? styles.toolbarSwatch : styles.panelSwatch}
      style={{ background: rgbToHex(rgb) }}
      title={descriptor.name}
      aria-label={descriptor.name}
      onClick={onExpand}
    />
  )
}
