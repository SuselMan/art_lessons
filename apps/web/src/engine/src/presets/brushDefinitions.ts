import { BRUSH_DEFINITION_FORMAT, type BrushDefinition, type ToolType } from '@grafetto/shared'

import { BRUSH_PEN_PRESET } from './brushPenPresets'
import { charcoalPresetFor } from './charcoalPresets'
import { digitalBrushFromPreset, digitalBrushPressureFromPreset } from './digitalBrushPresets'
import { LINER_PRESET } from './linerPresets'
import { markerNibFromPreset } from './markerPresets'
import { isPencilGrade, PENCIL_PRESETS } from './pencilPresets'
import { WATERCOLOR_PRESET } from './watercolorPresets'

const MARKER_BULLET = Object.freeze({ opacity: 0.45, hardness: 0.78, sizeMultiplier: 1 })
const MARKER_CHISEL = Object.freeze({ opacity: 0.36, hardness: 0.68, sizeMultiplier: 1 })
const cached = new Map<string, BrushDefinition>()

/** UI/old-log adapter only. Model execution consumes the same definition for
 * built-ins and imports. Keep historical tools/tokens readable, including
 * watercolor, even while a model is not offered for new drawing. */
export function brushDefinitionForTool(tool: ToolType, preset = ''): BrushDefinition {
  const key = JSON.stringify([tool, preset]), previous = cached.get(key)
  // Imported definitions can be installed after an earlier fallback lookup.
  // Their descriptor identity, rather than a UI revision, invalidates the cache.
  if (previous && (previous.model !== 'digital' || previous.parameters.brush === digitalBrushFromPreset(preset))) return previous
  const definition = resolveDefinition(tool, preset)
  if (cached.size >= 256) cached.delete(cached.keys().next().value!)
  cached.set(key, definition)
  return definition
}

function resolveDefinition(tool: ToolType, preset: string): BrushDefinition {
  if (tool === 'digitalBrush') {
    const brush = digitalBrushFromPreset(preset)
    return Object.freeze({ format: BRUSH_DEFINITION_FORMAT, id: brush.id, version: brush.version,
      model: 'digital', modelVersion: 1, parameters: Object.freeze({ preset, brush, pressure: Object.freeze({...digitalBrushPressureFromPreset(preset)}) }) })
  }
  const deposit = tool === 'liner' ? LINER_PRESET
    : tool === 'marker' ? markerNibFromPreset(preset) === 'chisel' ? MARKER_CHISEL : MARKER_BULLET
    : tool === 'brushPen' ? BRUSH_PEN_PRESET
    : tool === 'watercolor' ? WATERCOLOR_PRESET
    : tool === 'charcoal' ? charcoalPresetFor(preset)
    : PENCIL_PRESETS[isPencilGrade(preset) ? preset : 'HB']
  return Object.freeze({ format: BRUSH_DEFINITION_FORMAT, id: `grafetto:${tool}:${preset}`, version: 1,
    model: tool === 'pencil' ? 'graphite' : tool, modelVersion: 1,
    parameters: Object.freeze({ preset, deposit: Object.freeze({ ...deposit }) }) })
}
