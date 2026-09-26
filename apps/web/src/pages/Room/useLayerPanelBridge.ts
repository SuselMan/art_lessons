import { useCallback, type RefObject } from 'react'

import { isToolEnabledInRoom } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'

/** What the layer panel needs from the engine and the editor, without knowing
 *  either exists. Each callback is stable (it reads through the ref and the
 *  store at call time), which is what keeps the memo'd panel from re-rendering
 *  with the Room — see LayerPanel's own note on #127. */
export function useLayerPanelBridge(engineRef: RefObject<PencilEngineAPI | null>) {
  // (#263) Does this layer have any painted content? Gates the panel's delete
  // confirm the same way Clear-layer's own confirm (#171) is gated.
  const hasLayerContent = useCallback((layerId: string): boolean =>
    engineRef.current?.hasLayerContent(layerId) ?? false
  , [engineRef])

  const preloadImage = useCallback(async (src: string): Promise<void> => {
    await engineRef.current?.preloadImage(src)
  }, [engineRef])

  // (#608) A fresh import opens the transform gizmo on itself, the way a paste
  // does. The panel has already made the new layer active, so the session
  // effect frames exactly that layer — provided no selection is standing: a
  // selection would scope the session to its own region instead (#446), and
  // the frame would sit around whatever was selected, not around the picture.
  // A room whose toolset leaves transform out keeps the tool it had.
  const onImageImported = useCallback(() => {
    const { room, setSelection, setTool } = useRoomStore.getState()
    if (!isToolEnabledInRoom(room?.enabledTools, 'transform')) return
    setSelection(null)
    setTool('transform')
  }, [])

  return { hasLayerContent, preloadImage, onImageImported }
}
