import clsx from 'clsx'

import type { ShapeFrame } from '@grafetto/shared'

import { Icon } from '../../components/Icon'
import { SettingField } from '../../components/SettingField'
import { useT } from '../../i18n'
import { useClipboardStore } from '../../stores/clipboardStore'
import { useRoomStore } from '../../stores/roomStore'
import { ShapeFrameFields } from './ShapeFrameFields'
import { WatercolorDryButton } from './WatercolorDryButton'
import { TOOL_SCHEMAS, type UiToolId } from './toolSchemas'
import styles from './Room.module.css'

export interface QuickSettingsBarProps {
  uiHidden: boolean
  /** The phone-sized "annotations only" shell (#512). */
  compact: boolean
  /** Edits the open shape's frame (#530). */
  onShapeFrameChange: (frame: ShapeFrame) => void
  /** The layer a pixel action lands on, and whether it refuses paint (#518). */
  paintTargetId: string | null
  paintTargetLocked: boolean
  copySelection: () => void
  cutSelection: () => void
  pasteClipboard: () => void
  deleteSelectionContents: () => void
  /** (#536, §17.47/48) "Высушить всё" - sends `paper_dry` (see
   *  WatercolorDryButton). */
  onWatercolorDry: () => void
}

/** (#493) The column beside the rail: the tool in hand's quick-access
 *  fields, driven entirely by TOOL_SCHEMAS (#196); the open shape's numbers
 *  (#530); and, with the selection tool, what can be done with a selection
 *  as buttons (#446).
 *
 *  Kept as its own same-width column next to the toolbar rather than
 *  interleaved with the tool buttons: interleaving made the buttons jump
 *  every time the field count changed. Alone among the chrome it survives
 *  minimal UI (#471) — .quickSettingsBarMinimal moves it into the corner the
 *  header and toolbar vacated — except in the compact shell (#512), where
 *  minimal UI is for the screen and this is the largest thing left on it.
 *
 *  Out of Room's render. The tool, its settings, the open shape, the
 *  selection and the clipboard are read from the stores. */
export function QuickSettingsBar({
  uiHidden, compact, onShapeFrameChange, paintTargetId, paintTargetLocked,
  copySelection, cutSelection, pasteClipboard, deleteSelectionContents, onWatercolorDry,
}: QuickSettingsBarProps): React.JSX.Element {
  const t = useT()
  // Every `EditorTool` is a `UiToolId` by construction — see settingsToolId
  // in ToolSettingsTab for why the selected tool's schema is always the one shown.
  const settingsToolId: UiToolId = useRoomStore(s => s.tool)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const shapeFrame = useRoomStore(s => s.shapeFrame)
  const selection = useRoomStore(s => s.selection)
  const setSelection = useRoomStore(s => s.setSelection)
  // (#521) Only the clipboard's meta — enough to answer "is there anything to
  // paste" without reading the raster out of IndexedDB.
  const clipboardMeta = useClipboardStore(s => s.meta)
  const selectionActive = settingsToolId === 'selection'

  return (
    <aside className={clsx(
      styles.quickSettingsBar,
      uiHidden && (compact ? styles.uiHidden : styles.quickSettingsBarMinimal),
      styles.strokeBlockable,
    )}>
      {Object.entries(TOOL_SCHEMAS[settingsToolId])
        .filter(([, descriptor]) => descriptor.quickAccess)
        // (#542) No colour in this column at all any more — every colour a
        // tool carries is drawn by the pinned well in the rail to the left.
        // Filtered here rather than by clearing `quickAccess` in ten
        // schemas: the flag says "this is a field a hand reaches for
        // mid-gesture", which is still true of colour, and a schema that
        // denied it to make one layout come out right would be lying to
        // every other reader of it.
        .filter(([, descriptor]) => descriptor.valueType.kind !== 'color')
        .filter(([, descriptor]) => !descriptor.visibleWhen || descriptor.visibleWhen(toolSettings[settingsToolId]))
        .map(([key, descriptor]) => (
          <SettingField
            key={key}
            descriptor={descriptor}
            value={toolSettings[settingsToolId][key]}
            onChange={v => setToolSetting(settingsToolId, key, v)}
            layout="toolbar"
          />
        ))}
      {/* (#530) The numbers behind the drag, and only while a shape is
          open: they edit *this* shape, not the tool. For a frame around a
          thumbnail sketch this is arguably more of the tool than the drag
          is — an exact size cannot be set with a pen. The ratio presets
          live in the full settings panel instead (Ilya, 05.09): the rail is
          for what a hand reaches for mid-gesture. */}
      {shapeFrame && <ShapeFrameFields frame={shapeFrame} onChange={onShapeFrameChange} />}
      {settingsToolId === 'watercolor' && <WatercolorDryButton onDry={onWatercolorDry} />}
      {/* (#446) What can be done with a selection, as buttons rather than
          only as Ctrl+C/X/V. A tablet is a first-class target here and has
          no modifier keys at all: without these, cut/copy/paste — the half
          of this feature Ilya actually asked for — would exist only for
          people with a keyboard.

          In the quick column rather than floating over the canvas: it is
          already the place the selected tool's own controls appear, it
          never covers the drawing, and it needs no placement logic of its
          own. Each button is disabled exactly when its action would do
          nothing, so the row also answers "is anything selected" and "is
          there anything to paste" without a word of text. */}
      {selectionActive && (
        <div className={styles.selectionActions}>
          <button
            className={styles.toolIconBtn}
            title={t('selection.copy')}
            aria-label={t('selection.copy')}
            disabled={!selection || !paintTargetId}
            onClick={copySelection}
          ><Icon name="content_copy" /></button>
          <button
            className={styles.toolIconBtn}
            title={t('selection.cut')}
            aria-label={t('selection.cut')}
            disabled={!selection || !paintTargetId || paintTargetLocked}
            onClick={cutSelection}
          ><Icon name="content_cut" /></button>
          <button
            className={styles.toolIconBtn}
            title={t('selection.paste')}
            aria-label={t('selection.paste')}
            disabled={!clipboardMeta || !paintTargetId || paintTargetLocked}
            onClick={pasteClipboard}
          ><Icon name="content_paste" /></button>
          <button
            className={styles.toolIconBtn}
            title={t('selection.delete')}
            aria-label={t('selection.delete')}
            disabled={!selection || !paintTargetId || paintTargetLocked}
            onClick={deleteSelectionContents}
          ><Icon name="delete" /></button>
          <button
            className={styles.toolIconBtn}
            title={t('selection.clear')}
            aria-label={t('selection.clear')}
            disabled={!selection}
            onClick={() => setSelection(null)}
          ><Icon name="deselect" /></button>
        </div>
      )}
    </aside>
  )
}
