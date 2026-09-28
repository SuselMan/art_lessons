import { useEffect } from 'react'

import { isModalOpen } from '../../components/Modal/modalSlot'
import { useRoomStore } from '../../stores/roomStore'
import { isTypingTarget } from './tools/editorKeys'

/** (#493) Held Space pans the canvas (#319, ADR 007 §4).
 *
 *  Separate from the registry-driven shortcuts because this is a hold, not an
 *  action: it needs the keyup half, and it must not be rebindable (see
 *  lib/input/hotkeys.ts). Same guards as the shortcuts — a Space typed into a room
 *  name or a dialog is a space, not a gesture.
 *
 *  Takes nothing and returns nothing: the hold is a fact about the room, so it
 *  lives in the store, and the only thing this owns is the listeners that set
 *  it. Whether the hand is *active* is a different question — `tool` matters
 *  there too — and Room answers it (isHandActive).
 */
export function useSpaceToPan(): void {
  const setHandHeld = useRoomStore(s => s.setHandHeld)

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTypingTarget(e.target) || isModalOpen()) return
      // Otherwise the page scrolls under the canvas on every hold.
      e.preventDefault()
      setHandHeld(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      setHandHeld(false)
    }
    // A keyup that never arrives — alt-tabbing away mid-hold, an OS shortcut
    // swallowing it — would otherwise leave the canvas permanently in a mode
    // the person can't see the cause of and didn't ask for.
    const release = () => setHandHeld(false)

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
      setHandHeld(false)
    }
  }, [setHandHeld])
}
