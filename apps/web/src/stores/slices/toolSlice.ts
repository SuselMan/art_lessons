import type { StateCreator } from 'zustand'

import { defaultToolSettings, type ToolSettingsMap, type UiToolId, type SettingDescriptor } from '../../pages/Room/toolSchemas'

export interface ToolSlice {
  tool: 'pencil' | 'eraser'
  setTool: (updater: 'pencil' | 'eraser' | ((prev: 'pencil' | 'eraser') => 'pencil' | 'eraser')) => void
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
  setTool: updater => set(state => ({
    tool: typeof updater === 'function' ? updater(state.tool) : updater,
  })),
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
