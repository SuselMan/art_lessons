import type { BrushDefinition, ToolType } from '@grafetto/shared'
import { brushDefinitionForTool } from './brushDefinitions'
import { shapingForBrushPenPreset } from './brushPenPresets'
import { shapingForDigitalBrush } from './digitalBrushPresets'
import { shapingForWatercolorPreset } from './watercolorPresets'
import { shapingForMarkerPreset, type NibAngleConfig } from './markerPresets'
import { charcoalNibFromPreset } from './charcoalPresets'
import { DEFAULT_TILT_RESPONSE, type TiltResponse } from './tiltCurve'
import {
  LINER_DAB_SHAPING, PENCIL_SHAPING_BY_RESPONSE, CHARCOAL_SHAPING_BY_RESPONSE,
  charcoalChiselShaping, CHARCOAL_CHISEL_ANGLE_DEFAULT, DEFAULT_NIB_ANCHOR,
  type DabShapingProfile,
} from './brushGeometry'

export * from './brushGeometry'

/** Compatibility entry for existing UI/log tokens; model execution is shared. */
export function shapingForTool(
  tool: ToolType, presetName?: string, nibAngle?: NibAngleConfig,
  tiltResponse: TiltResponse = DEFAULT_TILT_RESPONSE,
): DabShapingProfile {
  return shapingForBrushDefinition(brushDefinitionForTool(tool, presetName), nibAngle, tiltResponse)
}

/** Compile data into the existing geometry formulas; no editor/room state. */
export function shapingForBrushDefinition(
  definition: BrushDefinition, nibAngle?: NibAngleConfig,
  tiltResponse: TiltResponse = DEFAULT_TILT_RESPONSE,
): DabShapingProfile {
  const preset = definition.parameters.preset
  switch (definition.model) {
    case 'liner': return LINER_DAB_SHAPING
    case 'marker': return shapingForMarkerPreset(preset, nibAngle)
    case 'brushPen': return shapingForBrushPenPreset(preset)
    case 'watercolor': return shapingForWatercolorPreset(preset, nibAngle)
    case 'digital': return shapingForDigitalBrush(definition.parameters.brush, definition.parameters.pressure)
    case 'charcoal': return charcoalNibFromPreset(preset) !== 'chisel'
      ? CHARCOAL_SHAPING_BY_RESPONSE[tiltResponse]
      : charcoalChiselShaping(nibAngle?.angle ?? CHARCOAL_CHISEL_ANGLE_DEFAULT, nibAngle?.anchor ?? DEFAULT_NIB_ANCHOR)
    default: return PENCIL_SHAPING_BY_RESPONSE[tiltResponse]
  }
}
