import {
  TOGGLEABLE_TOOLS, TOOLSET_MATERIAL_TOOLS, type ToggleableTool,
} from '@grafetto/shared'

import { useT } from '../../i18n'
import {
  FLOATING_PRIMARY_TOOLS, FLOATING_SECONDARY_TOOLS, FLOATING_UTILITY_TOOLS, TOOL_DISPLAY,
} from '../FloatingToolPanel/tools'
import { Icon } from '../Icon'
import styles from './ToolSetPicker.module.css'

interface ToolSetPickerProps {
  /** The room's toolset, or `undefined` for the unrestricted room — the same
   *  value `Room.enabledTools` carries, unchanged, so this component has no
   *  encoding of its own to get wrong. */
  value: ToggleableTool[] | undefined
  onChange: (next: ToggleableTool[] | undefined) => void
  /** Read-only rendering for anyone who is not the owner. Not currently
   *  mounted that way — both call sites are owner-only — but the toolset is a
   *  fact about the room every participant may reasonably want to see, and a
   *  picker that lies about being editable is the one thing to avoid if that
   *  day comes. */
  disabled?: boolean
}

/** The three groups, in the left toolbar's own order. Written as the floating
 *  panel's three lists rather than re-grouped here: the panel and the toolbar
 *  already agree on what a "material" is versus a "utility", and a third
 *  opinion about it is exactly the kind of drift that makes the same fifteen
 *  tools read as three different sets in three places. */
const GROUPS = [
  { key: 'materials' as const, labelKey: 'toolset.group.materials' as const, tools: FLOATING_PRIMARY_TOOLS },
  { key: 'secondary' as const, labelKey: 'toolset.group.secondary' as const, tools: FLOATING_SECONDARY_TOOLS },
  { key: 'utility' as const, labelKey: 'toolset.group.utility' as const, tools: FLOATING_UTILITY_TOOLS },
]

/** (#548, first step of #544) Which tools a room offers.
 *
 *  The same component in both places it is needed — the room creation form and
 *  the room's own settings — because they are the same decision made at two
 *  moments, and a lesson whose toolset was chosen up front has to be
 *  correctable mid-lesson without the teacher learning a second screen.
 *
 *  Everything can be switched off, the hand included: a mouse pans with the
 *  wheel and a tablet with two fingers, so no tool here is the only way to do
 *  anything. The single exception is the last material — with none of those
 *  left the room cannot be drawn in at all, which is read-only, and read-only
 *  is its own setting rather than something to arrive at by unchecking boxes.
 *  The last one standing therefore refuses to switch off, and says why.
 */
export function ToolSetPicker({ value, onChange, disabled }: ToolSetPickerProps) {
  const t = useT()
  // `undefined` means "everything", and that is the shape stored — never a
  // spelled-out list of all fifteen, or the next tool this app ships would be
  // excluded by every toolset ever saved (see sanitizeEnabledTools).
  const enabled = new Set<ToggleableTool>(value ?? TOGGLEABLE_TOOLS)
  const materialsLeft = TOOLSET_MATERIAL_TOOLS.filter(tool => enabled.has(tool))
  const allOn = enabled.size === TOGGLEABLE_TOOLS.length

  function toggle(tool: ToggleableTool) {
    const next = new Set(enabled)
    if (next.has(tool)) next.delete(tool)
    else next.add(tool)
    const ordered = TOGGLEABLE_TOOLS.filter(id => next.has(id))
    onChange(ordered.length === TOGGLEABLE_TOOLS.length ? undefined : ordered)
  }

  return (
    <div className={styles.picker}>
      <div className={styles.summaryRow}>
        <span className={styles.summary}>
          {t('toolset.selected', { n: enabled.size, total: TOGGLEABLE_TOOLS.length })}
        </span>
        <button
          type="button"
          className={styles.reset}
          disabled={disabled || allOn}
          onClick={() => onChange(undefined)}
        >
          {t('toolset.enableAll')}
        </button>
      </div>

      {GROUPS.map(group => (
        <section key={group.key} className={styles.group}>
          <h4 className={styles.groupLabel}>{t(group.labelKey)}</h4>
          <div className={styles.grid}>
            {group.tools.map(tool => {
              const on = enabled.has(tool)
              // The room has to keep one material. Locking the last one on is
              // better than letting it off and silently refusing the result
              // afterwards: the button that cannot do the thing says so, and
              // stays checked, instead of appearing to work and reverting.
              const locked = on && materialsLeft.length === 1 && materialsLeft[0] === tool
              return (
                <button
                  key={tool}
                  type="button"
                  className={[styles.tool, on && styles.toolOn, locked && styles.toolLocked]
                    .filter(Boolean).join(' ')}
                  aria-pressed={on}
                  disabled={disabled || locked}
                  title={locked ? t('toolset.lastMaterial') : undefined}
                  onClick={() => toggle(tool)}
                >
                  <Icon name={TOOL_DISPLAY[tool].icon} />
                  <span className={styles.toolName}>{t(TOOL_DISPLAY[tool].labelKey)}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <p className={styles.hint}>{t('toolset.hint')}</p>
    </div>
  )
}
