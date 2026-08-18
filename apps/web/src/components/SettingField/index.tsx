import { PrecisionSlider } from '../PrecisionSlider'
import { NumberField } from '../NumberField'
import { OptionButton, OptionSelect, type PickerOption } from '../OptionPicker'
import { Switch } from '../Switch'
import { rgbToHex } from '../../lib/color'
import { useT } from '../../i18n'
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
  const t = useT()
  const { valueType } = descriptor
  const label = t(descriptor.nameKey)

  /** An enum option's display text: its own translation where the schema
   *  provides one (nib, charcoal type), a literal name where the schema
   *  provides that instead (#468 — pigments are Colour Index products, so
   *  "French Ultramarine" is a name and not UI copy, exactly like a brand), and
   *  otherwise the raw value — pencil grades and liner widths are notation, the
   *  same in every language. */
  const optionLabel = (option: string): string => {
    const key = descriptor.optionLabelKeys?.[option]
    if (key) return t(key)
    return descriptor.optionLabels?.[option] ?? option
  }

  if (valueType.kind === 'numberRange') {
    const numValue = value as number
    if (layout === 'toolbar') {
      return (
        <div className={styles.toolbarBlock} title={label}>
          <span className={styles.toolbarValue}>
            {valueType.format ? valueType.format(numValue) : numValue}
          </span>
          <div className={styles.toolbarTrack}>
            <PrecisionSlider
              value={numValue}
              min={valueType.min} max={valueType.max} step={valueType.step}
              scale={valueType.scale}
              trackSize={RANGE_TRACK_HEIGHT}
              onChange={v => onChange(v)}
              formatValue={valueType.format}
              title={label}
            />
          </div>
        </div>
      )
    }
    // (#335) The panel's read-only value readout became an editable field:
    // the slider stays for "roughly this much", the field is for the times a
    // number is actually known ("28px", "60%"). The toolbar keeps its plain
    // readout above — there's no room for a text field in a 40px column, and
    // no keyboard on the device it's designed for.
    return (
      <div className={styles.panelRow}>
        <div className={styles.panelRowHead}>
          <span className={styles.panelLabel}>{label}</span>
          <NumberField
            value={numValue}
            min={valueType.min} max={valueType.max} step={valueType.step}
            onChange={onChange}
            format={valueType.format}
            parse={valueType.parse}
            label={label}
          />
        </div>
        <PrecisionSlider
          className={styles.panelRange}
          orientation="horizontal"
          value={numValue}
          min={valueType.min} max={valueType.max} step={valueType.step}
          scale={valueType.scale}
          onChange={v => onChange(v)}
          formatValue={valueType.format}
          title={label}
        />
      </div>
    )
  }

  if (valueType.kind === 'enumOptions') {
    const strValue = value as string
    const index = Math.max(0, valueType.options.indexOf(strValue))

    // (#335) Tool *type* fields — pencil grade, charcoal type, marker nib —
    // render as a picker showing what each option draws, in both panels. The
    // remaining enum (the liner's mm ladder) keeps the slider: its options are
    // a single number on a scale, which is what a slider is, and there's
    // nothing to show about 0.3mm that "0.3" doesn't already say.
    if (descriptor.uiControls[0] === 'select') {
      const options: PickerOption[] = valueType.options.map(option => ({
        value: option,
        label: optionLabel(option),
        image: descriptor.optionImages?.[option],
        icon: descriptor.optionIcons?.[option],
        curve: descriptor.optionCurves?.[option],
      }))
      return layout === 'toolbar' ? (
        // Same block shape as the toolbar's other fields: the control, with
        // the current value spelled out under it — the preview alone says
        // "darker than the last one", not "2B".
        <div className={styles.toolbarBlock} title={label}>
          <OptionButton options={options} value={strValue} onChange={onChange} label={label} />
          <span className={styles.toolbarValue}>{optionLabel(strValue)}</span>
        </div>
      ) : (
        <div className={styles.panelRow}>
          <span className={styles.panelLabel}>{label}</span>
          <OptionSelect options={options} value={strValue} onChange={onChange} label={label} />
        </div>
      )
    }

    if (layout === 'toolbar') {
      return (
        <div className={styles.toolbarBlock} title={label}>
          <div className={styles.toolbarTrack} style={{ height: ENUM_TRACK_HEIGHT }}>
            <PrecisionSlider
              value={index}
              min={0} max={valueType.options.length - 1} step={1}
              trackSize={ENUM_TRACK_HEIGHT}
              onChange={v => onChange(valueType.options[v])}
              formatValue={v => optionLabel(valueType.options[v])}
              title={label}
            />
          </div>
          <span className={styles.toolbarValue}>{optionLabel(strValue)}</span>
        </div>
      )
    }
    return (
      <div className={styles.panelRow}>
        <div className={styles.panelRowHead}>
          <span className={styles.panelLabel}>{label}</span>
          <span className={styles.panelValue}>{optionLabel(strValue)}</span>
        </div>
        <PrecisionSlider
          className={styles.panelRange}
          orientation="horizontal"
          value={index}
          min={0} max={valueType.options.length - 1} step={1}
          onChange={v => onChange(valueType.options[v])}
          formatValue={v => optionLabel(valueType.options[v])}
          title={label}
        />
      </div>
    )
  }

  if (valueType.kind === 'boolean') {
    // (#391) The quick column keeps the shape every other field there uses —
    // control on top, a line of text under it — because a toggle's own glyph
    // says nothing about what it toggles, and a `title` only pays out to
    // whoever hovers long enough to find out, which on the tablet this column
    // is designed for is nobody. Both that block and the panel's row are the
    // Switch itself now (#326), label included: it is one control in two
    // orientations rather than two hand-built layouts around a checkbox.
    return (
      <Switch
        checked={value as boolean}
        onChange={onChange}
        label={label}
        orientation={layout === 'toolbar' ? 'vertical' : 'horizontal'}
      />
    )
  }

  // valueType.kind === 'color'
  const rgb = value as [number, number, number]
  return (
    <button
      className={layout === 'toolbar' ? styles.toolbarSwatch : styles.panelSwatch}
      style={{ background: rgbToHex(rgb) }}
      title={label}
      aria-label={label}
      onClick={onExpand}
    />
  )
}
