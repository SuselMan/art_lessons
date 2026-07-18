import { describe, expect, it } from 'vitest'

import { useRoomStore } from './roomStore'
import { defaultToolSettings } from '../pages/Room/toolSchemas'

// #20: confirms the combined store's initial shape matches spec — layers,
// viewport, tool, room all present with sane defaults, and nothing from
// the engine leaked in (see roomStore.ts's own doc comment on that
// boundary).
describe('roomStore initial shape', () => {
  it('has a starting layer with the background layer beneath it', () => {
    const { layerState } = useRoomStore.getState()
    expect(layerState.rootOrder).toHaveLength(2)
    expect(layerState.activeId).not.toBe('background')
    expect(layerState.items.background).toBeTruthy()
  })

  it('starts at a neutral viewport', () => {
    expect(useRoomStore.getState().viewport).toEqual({ cx: 0, cy: 0, zoom: 1, angle: 0 })
  })

  it('starts on pencil with schema-default tool settings', () => {
    const state = useRoomStore.getState()
    expect(state.tool).toBe('pencil')
    expect(state.toolSettings).toEqual(defaultToolSettings())
  })

  it('starts with no room info and no participants', () => {
    const state = useRoomStore.getState()
    expect(state.room).toBeNull()
    expect(state.participants).toEqual([])
  })

  it('starts with no ruler/transform-preview geometry', () => {
    const state = useRoomStore.getState()
    expect(state.rulerLine).toBeNull()
    expect(state.transformBounds).toBeNull()
    expect(state.transformLiveMatrix).toBeNull()
    expect(state.transformCenterOverride).toBeNull()
  })

  it('never exposes anything engine-shaped', () => {
    const keys = Object.keys(useRoomStore.getState())
    expect(keys.some(k => /engine/i.test(k))).toBe(false)
  })
})
