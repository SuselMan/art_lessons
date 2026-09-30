import { useEffect, useState } from 'react'

import { useRoomStore } from '../../stores/roomStore'
import { loadSelectedTool, saveSelectedTool } from './tools/selectedTool'

/** (#682) The tool in hand, remembered per room on this device — the colour
 *  and the rest of each tool's settings already are (#156), so without this a
 *  room came back with the right colour on a pencil nobody had been holding.
 *
 *  Seeded synchronously inside a throwaway useState initializer, the same
 *  timing the tool settings use: the engine is built from the tool read on the
 *  first render (`initialToolRef`), so a restore that landed in an effect
 *  would configure it for the pencil and switch a frame later. Must therefore
 *  be called before anything in Room reads `tool` — useToolChoice calls it
 *  first thing, and Room calls useToolChoice before its own read.
 *
 *  The drawing tool behind it goes first, so a room left with the fill in
 *  hand reopens with the fill in front of the brush it was taken up from. */
export function useRememberedTool(roomId: string | undefined): void {
  useState(() => {
    const remembered = loadSelectedTool(localStorage, roomId ?? '')
    if (!remembered) return
    const { setTool } = useRoomStore.getState()
    if (remembered.drawingTool) setTool(remembered.drawingTool)
    setTool(remembered.tool)
  })

  const tool = useRoomStore(s => s.tool)
  const drawingTool = useRoomStore(s => s.drawingTool)
  useEffect(() => {
    if (!roomId) return
    saveSelectedTool(localStorage, roomId, tool, drawingTool)
  }, [roomId, tool, drawingTool])
}
