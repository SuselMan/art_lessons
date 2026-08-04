import { useState } from 'react'

import { useT } from '../../i18n'
import { isDebugToolsEnabled } from '../../lib/debugTools'
import { Modal } from '../Modal'
import { OptionGroup } from '../OptionGroup'
import { RoomAccessControl } from '../RoomAccessControl'
import { DebugTab } from './DebugTab'
import { GeneralTab } from './GeneralTab'
import { HotkeysTab } from './HotkeysTab'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose: () => void
  /** The room this panel was opened from. Absent means it isn't one — the
   *  Access tab is the only thing that needs it. */
  roomId?: string
  isOwner?: boolean
}

type SettingsTabId = 'general' | 'access' | 'hotkeys' | 'debug'

/** (#321) The settings screen reached from the editor's ≡ menu.
 *
 *  It holds two genuinely different kinds of thing, deliberately in one place:
 *  the person's own preferences (sound, interface, shortcuts — `settingsStore`,
 *  applied immediately) and one property of the room itself (who may enter —
 *  the server's, changed over REST). Keeping them apart would be truer to the
 *  data and worse to use: mid-lesson there is one "settings" a teacher reaches
 *  for, not two.
 *
 *  What is *not* here: the room's own drawing properties (name, paper colour,
 *  read-only mode). Those are still fixed at creation — #321 keeps that part
 *  open. */
export function SettingsPanel({ onClose, roomId, isOwner }: SettingsPanelProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  // Read once per open, not subscribed: the key is set by a URL parameter at
  // startup (see lib/debugTools), so it cannot change while this is mounted.
  const [debugAvailable] = useState(() => isDebugToolsEnabled())

  // Owner-only and courtesy-only: every endpoint behind RoomAccessControl
  // answers 403 to anyone else (see its own doc comment), so hiding the tab is
  // about not offering an action that fails.
  const accessAvailable = roomId !== undefined && isOwner === true

  const tabs = [
    { id: 'general' as const, label: t('editorSettings.tab.general'), content: <GeneralTab /> },
    ...(accessAvailable
      ? [{ id: 'access' as const, label: t('editorSettings.tab.access'), content: <RoomAccessControl roomId={roomId} /> }]
      : []),
    { id: 'hotkeys' as const, label: t('editorSettings.tab.hotkeys'), content: <HotkeysTab /> },
    ...(debugAvailable
      ? [{ id: 'debug' as const, label: t('editorSettings.tab.debug'), content: <DebugTab /> }]
      : []),
  ]

  return (
    <Modal title={t('editorSettings.title')} size="sm" onClose={onClose}>
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
