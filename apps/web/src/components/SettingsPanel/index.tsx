import { useCallback, useState } from 'react'
import type { ToggleableTool } from '@grafetto/shared'

import { useT } from '../../i18n'
import { isDebugToolsEnabled } from '../../lib/debugTools'
import { Modal } from '../Modal'
import { OptionGroup } from '../OptionGroup'
import { RoomAccessControl } from '../RoomAccessControl'
import { ToolSetPicker } from '../ToolSetPicker'
import { DebugTab } from './DebugTab'
import { GeneralTab } from './GeneralTab'
import { HotkeysTab } from './HotkeysTab'
import { StylusTab } from './StylusTab'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
  /** The room this panel was opened from. Absent means it isn't one — the
   *  Access tab is the only thing that needs it. */
  roomId?: string
  isOwner?: boolean
  /** (#548) The room's toolset and the way to change it. Both come from Room
   *  because the change travels over the room's own socket — the panel is
   *  where the control lives, not what applies it. Absent outside a room, same
   *  as `roomId`. */
  enabledTools?: ToggleableTool[]
  onEnabledToolsChange?: (next: ToggleableTool[] | undefined) => void
}

type SettingsTabId = 'general' | 'stylus' | 'access' | 'tools' | 'hotkeys' | 'debug'

/** (#321) The settings screen reached from the editor's ≡ menu.
 *
 *  It holds two genuinely different kinds of thing, deliberately in one place:
 *  the person's own preferences (sound, interface, shortcuts — `settingsStore`,
 *  applied immediately) and one property of the room itself (who may enter —
 *  the server's, changed over REST). Keeping them apart would be truer to the
 *  data and worse to use: mid-lesson there is one "settings" a teacher reaches
 *  for, not two.
 *
 *  (#548) The toolset joined it, and for the same reason: which tools this
 *  room puts out is a property of the room, decided on the creation form and
 *  corrected here when the lesson turns out to need something else.
 *
 *  What is *not* here: the room's own drawing properties (name, paper colour,
 *  read-only mode). Those are still fixed at creation — #321 keeps that part
 *  open. */
export function SettingsPanel({
  onClose, roomId, isOwner, enabledTools, onEnabledToolsChange,
}: SettingsPanelProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  // Read once per open, not subscribed: the key is set by a URL parameter at
  // startup (see lib/debugTools), so it cannot change while this is mounted.
  const [debugAvailable] = useState(() => isDebugToolsEnabled())
  // (#475) The pen calibration draws a stroke to measure it, which needs more
  // room than a settings modal normally takes. Held here rather than inside the
  // tab so the modal remains the only thing that decides its own width.
  const [wide, setWide] = useState(false)
  const onWideChange = useCallback((next: boolean) => { setWide(next) }, [])

  // Owner-only and courtesy-only: every endpoint behind RoomAccessControl
  // answers 403 to anyone else (see its own doc comment), so hiding the tab is
  // about not offering an action that fails.
  const accessAvailable = roomId !== undefined && isOwner === true
  // (#548) Same owner-only rule, and the same reason: the server rejects
  // `set_room_tools` from anyone else (socketHandlers.ts), so hiding the tab
  // is about not offering an action that fails.
  const toolsAvailable = accessAvailable && onEnabledToolsChange !== undefined

  const tabs = [
    { id: 'general' as const, label: t('editorSettings.tab.general'), content: <GeneralTab /> },
    { id: 'stylus' as const, label: t('editorSettings.tab.stylus'), content: <StylusTab onWideChange={onWideChange} /> },
    ...(accessAvailable
      ? [{ id: 'access' as const, label: t('editorSettings.tab.access'), content: <RoomAccessControl roomId={roomId} /> }]
      : []),
    ...(toolsAvailable
      ? [{
          id: 'tools' as const,
          label: t('editorSettings.tab.tools'),
          content: <ToolSetPicker value={enabledTools} onChange={onEnabledToolsChange} />,
        }]
      : []),
    { id: 'hotkeys' as const, label: t('editorSettings.tab.hotkeys'), content: <HotkeysTab /> },
    ...(debugAvailable
      ? [{ id: 'debug' as const, label: t('editorSettings.tab.debug'), content: <DebugTab /> }]
      : []),
  ]

  return (
    <Modal title={t('editorSettings.title')} size={wide ? 'lg' : 'sm'} onClose={onClose}>
      <div className={styles.scrollArea}>
        <OptionGroup
          options={tabs}
          active={activeTab}
          onSelect={setActiveTab}
          ariaLabel={t('editorSettings.title')}
        />
      </div>
    </Modal>
  )
}
