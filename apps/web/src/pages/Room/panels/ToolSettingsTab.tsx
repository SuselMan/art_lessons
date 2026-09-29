import type { ShapeFrame } from '@grafetto/shared'

import { SettingField } from '../../../components/SettingField'
import { useT } from '../../../i18n'
import { useRoomStore } from '../../../stores/roomStore'
import { ShapeRatioPresets } from '../shapes/ShapeFrameFields'
import { TOOL_SCHEMAS, type UiToolId } from '../../../lib/tools/toolSchemas'
import styles from '../Room.module.css'

export interface ToolSettingsTabProps {
  /** Opens the colour flyout on the rail's well for this colour field. */
  onExpandColor: (key: string) => void
  /** Resizes the open shape (#530). */
  onShapeFrameChange: (frame: ShapeFrame) => void
}

/** (#197, #493) The side panel's "Tool settings" tab: every field of the
 *  tool in hand, from the same TOOL_SCHEMAS and SettingField the quick
 *  column uses (#196) — this one renders all of them, not only the
 *  quick-access ones. Out of Room's render; the tool and its settings come
 *  from the store. */
export function ToolSettingsTab({ onExpandColor, onShapeFrameChange }: ToolSettingsTabProps): React.JSX.Element {
  const t = useT()
  // (#391/#405) Whose settings the quick-access column and the "Tool settings"
  // tab are showing: the selected tool, full stop. This used to be
  // `transformActive ? 'transform' : tool` — a special case, because transform
  // was a mode rather than a tool and only that one mode had settings worth
  // surfacing. With one exclusive selection there is no special case left to
  // write: the ruler's show/snap and the grid's visibility are its settings
  // exactly the way the pencil's grade is, and selecting a drawing tool again
  // hands both surfaces back with its own settings where they were.
  //
  // Every `EditorTool` is a `UiToolId` by construction (toolSlice's two lists
  // are `satisfies readonly UiToolId[]`), so this needs no widening or
  // fallback: there is always a schema to show.
  const settingsToolId: UiToolId = useRoomStore(s => s.tool)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const shapeFrame = useRoomStore(s => s.shapeFrame)

  return Object.keys(TOOL_SCHEMAS[settingsToolId]).length === 0 ? (
    <p className={styles.noToolSettings}>{t('room.noToolSettings')}</p>
  ) : (
    <div className={styles.toolSettingsPanel}>
      {Object.entries(TOOL_SCHEMAS[settingsToolId])
        .filter(([, descriptor]) => !descriptor.visibleWhen || descriptor.visibleWhen(toolSettings[settingsToolId]))
        .map(([key, descriptor]) => (
        <SettingField
          key={key}
          descriptor={descriptor}
          value={toolSettings[settingsToolId][key]}
          onChange={v => setToolSetting(settingsToolId, key, v)}
          layout="panel"
          // (#542) Every colour field, not just the one named
          // `color` — a shape's two are `strokeColor`/`fillColor`
          // and were left without a way to expand at all. They
          // all open the same flyout, on the well in the rail:
          // this tab is only ever on screen next to it, and one
          // surface in one place beats a popover that chases
          // whichever copy of a swatch was pressed.
          onExpand={descriptor.valueType.kind === 'color' ? () => onExpandColor(key) : undefined}
        />
      ))}
      {/* (#530) The ratio presets, here rather than in the quick
          column (Ilya, 05.09): picking 3:4 is a decision made
          once, and the rail is for what a hand reaches for
          mid-gesture. Only while a shape is open — they resize
          that shape, not the tool. */}
      {shapeFrame && <ShapeRatioPresets frame={shapeFrame} onChange={onShapeFrameChange} />}
    </div>
  )
}
