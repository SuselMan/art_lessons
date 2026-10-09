// The UI's authoritative preset lists and curves, without the Engine runtime.
// Re-export existing objects/functions: mutable feel configs keep their identity.
export { PENCIL_GRADES, DEFAULT_GRAPHITE_COLOR, type PencilGradeName } from './src/presets/pencilPresets'
export { LINER_SIZES_MM, type LinerSizeMm } from './src/presets/linerPresets'
export { CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE, CHARCOAL_NIBS, DEFAULT_CHARCOAL_NIB, type CharcoalType, type CharcoalNib } from './src/presets/charcoalPresets'
export { CHARCOAL_FEEL } from './src/presets/charcoalFeel'
export { PENCIL_TILT } from './src/presets/pencilTilt'
export { TILT_RESPONSES, tiltResponseT, type TiltResponse } from './src/presets/tiltCurve'
export { PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, brushPenWidth, type PressureResponse } from './src/presets/brushPenPresets'
export { WATERCOLOR_MIX_PRESETS, WATERCOLOR_MIX_DEFAULT, WATERCOLOR_NIBS, DEFAULT_WATERCOLOR_NIB, type WatercolorMixPreset, type WatercolorNib } from './src/presets/watercolorPresets'
export { DIGITAL_BRUSHES, DIGITAL_BRUSH_IDS, DEFAULT_DIGITAL_BRUSH, type BrushCategory } from './src/presets/digitalBrushPresets'
export { NIB_ANCHORS, type NibAnchor } from './src/presets/dabShaping'
