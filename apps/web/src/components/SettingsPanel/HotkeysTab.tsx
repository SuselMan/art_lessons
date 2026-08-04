import { useEffect, useState } from 'react'

import { useT } from '../../i18n'
import {
  HOTKEY_ACTIONS, captureHotkeyBinding, findHotkeyConflict, formatHotkeyLabel,
} from '../../lib/hotkeys'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './SettingsPanel.module.css'

/** (#174) Rebinding, against the registry in `lib/hotkeys` — which is the
 *  single source of truth for this list, the editor's own keydown handler and
 *  every tooltip that spells a shortcut out.
 *
 *  (#321) Applies on the keypress rather than on Save: bindings live in
 *  `settingsStore` now, and the editor subscribes to them, so there is nothing
 *  left that a page reload would have been for. */
export function HotkeysTab() {
  const t = useT()
  const hotkeys = useSettingsStore(s => s.hotkeys)
  const setHotkeys = useSettingsStore(s => s.setHotkeys)
  // Which row is listening for its next keypress; null means no row is, and
  // the window listener below is detached entirely.
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)

  useEffect(() => {
    if (!recordingActionId) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecordingActionId(null); setHotkeyError(null); return }
      const captured = captureHotkeyBinding(e)
      if (!captured) return // bare modifier (Ctrl/Shift/Meta/Alt alone) — keep listening
      const conflict = findHotkeyConflict(recordingActionId, captured, hotkeys)
      if (conflict) { setHotkeyError(t('editorSettings.hotkeyConflict', { action: t(conflict.labelKey) })); return }
      setHotkeys({ ...hotkeys, [recordingActionId]: captured })
      setHotkeyError(null)
      setRecordingActionId(null)
    }
    // Capture phase so a rebind can't be swallowed by some other keydown
    // listener higher up the tree while this panel is open.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recordingActionId, hotkeys, setHotkeys, t])

  return (
    <div className={styles.flagList}>
      {HOTKEY_ACTIONS.map(action => (
        <div key={action.id} className={styles.flagRow} style={{ cursor: 'default' }}>
          <div className={styles.hotkeyRow}>
            <span className={styles.flagLabel}>{t(action.labelKey)}</span>
            <button
              type="button"
              className={styles.hotkeyBtn}
              onClick={() => { setRecordingActionId(action.id); setHotkeyError(null) }}
            >
              {recordingActionId === action.id ? t('editorSettings.pressKey') : formatHotkeyLabel(hotkeys[action.id])}
            </button>
          </div>
          {recordingActionId === action.id && hotkeyError && (
            <div className={styles.hotkeyError}>{hotkeyError}</div>
          )}
        </div>
      ))}
      <button
        type="button"
        className={styles.hotkeyResetBtn}
        onClick={() => {
          setHotkeys(Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default])))
          setRecordingActionId(null)
          setHotkeyError(null)
        }}
      >
        {t('editorSettings.resetHotkeys')}
      </button>
    </div>
  )
}
