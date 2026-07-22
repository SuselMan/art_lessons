import type { StateCreator } from 'zustand'

import { defaultToolSettings, type ToolSettingsMap, type UiToolId, type SettingDescriptor } from '../../pages/Room/toolSchemas'

export type DrawingTool = 'pencil' | 'eraser' | 'smudge' | 'liner' | 'marker'

// The subset of DrawingTool that actually lays ink and has its own color
// (unlike eraser/smudge, which modify what's already there) — what a
// "return to drawing" affordance (the toolbar's eraser/smudge toggle-off,
// FloatingToolPanel's top button) should switch back to. Excludes smudge
// deliberately: smudging isn't "drawing" either, it just isn't the thing
// most in need of a quick way back out (no dedicated toggle exists for it
// today beyond its own toolbar button). Marker (#252) joined pencil/liner
// here for the same reason liner did (#245 follow-up): it's a real drawing
// tool with its own color field, so the Color side-panel tab/colorTool logic
// in Room/index.tsx needs to be able to name it too.
export type PrimaryDrawingTool = 'pencil' | 'liner' | 'marker'

function isPrimaryDrawingTool(tool: DrawingTool): tool is PrimaryDrawingTool {
  return tool === 'pencil' || tool === 'liner' || tool === 'marker'
}

export interface ToolSlice {
  tool: DrawingTool
  setTool: (updater: DrawingTool | ((prev: DrawingTool) => DrawingTool)) => void
  // Most recent PrimaryDrawingTool `tool` held, kept in sync automatically
  // by setTool below — not its own separate setter. Lets a "return to
  // drawing" affordance (eraser/smudge toggle-off, FloatingToolPanel's top
  // button) go back to whichever of pencil/liner was actually active
  // before, instead of assuming pencil (a real gap once liner became a
  // second real drawing tool - #245 follow-up).
  lastDrawingTool: PrimaryDrawingTool
  // TOOL_SCHEMAS-shaped settings for every registered tool (#170/#196) —
  // seeded with schema defaults here; Room re-seeds this from
  // loadToolSettings(localStorage, roomId) once at mount via
  // setAllToolSettings (the store itself has no concept of "room id" to
  // load from automatically).
  toolSettings: ToolSettingsMap
  setToolSetting: (
    toolId: UiToolId,
    key: string,
    value: SettingDescriptor['default'] | ((prev: SettingDescriptor['default']) => SettingDescriptor['default']),
  ) => void
  setAllToolSettings: (settings: ToolSettingsMap) => void
}

export const createToolSlice: StateCreator<ToolSlice> = set => ({
  tool: 'pencil',
  lastDrawingTool: 'pencil',
  setTool: updater => set(state => {
    const next = typeof updater === 'function' ? updater(state.tool) : updater
    return {
      tool: next,
      lastDrawingTool: isPrimaryDrawingTool(next) ? next : state.lastDrawingTool,
    }
  }),
  toolSettings: defaultToolSettings(),
  setToolSetting: (toolId, key, value) => set(state => ({
    toolSettings: {
      ...state.toolSettings,
      [toolId]: {
        ...state.toolSettings[toolId],
        [key]: typeof value === 'function'
          ? (value as (prev: SettingDescriptor['default']) => SettingDescriptor['default'])(state.toolSettings[toolId][key])
          : value,
      },
    },
  })),
  setAllToolSettings: settings => set({ toolSettings: settings }),
})
