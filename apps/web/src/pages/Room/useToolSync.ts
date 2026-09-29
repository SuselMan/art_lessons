import { useEffect, useMemo, type RefObject } from 'react'

import { pressureMapOf } from '../../lib/input/pressureCalibration'
import {
  charcoalPresetString, DEFAULT_CHARCOAL_TYPE, DEFAULT_NIB_ANCHOR, DEFAULT_TILT_RESPONSE, digitalBrushFromPreset,
  digitalBrushPreset, isCharcoalNib, isCharcoalType, isNibAnchor, isPressureResponse, isTiltResponse,
  isWatercolorNib, watercolorPresetString,
  type PencilEngineAPI, type PencilGradeName,
} from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { linerSizeToPx } from '../../lib/tools/toolSchemas'

export interface ToolSyncDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** Bumped when a new engine exists to sync to — see engineEpoch in Room. */
  engineEpoch: number
}

/** (#493) The tool in hand, pushed into the engine: preset, tool, size and
 *  opacity, nib angle and anchor, tilt response, pen calibration — each an
 *  effect keyed on exactly the settings it reflects, plus `engineEpoch` so a
 *  freshly built engine is brought up to date. The store is the source; the
 *  engine is always a reflection of it (CLAUDE.md → State).
 *
 *  Out of Room — the first step #493's own plan names. What comes back is
 *  what the brush-ring cursor draws with. */
export function useToolSync({ engineRef, engineEpoch }: ToolSyncDeps) {
  const toolSettings = useRoomStore(s => s.toolSettings)
  const drawingTool = useRoomStore(s => s.drawingTool)
  // (#405) `drawingTool`, not `tool`: these are the size/opacity/colour the
  // engine is configured with, and while the ruler or the gizmo is selected
  // `tool` names something that has no such fields at all.
  const activeCfg = toolSettings[drawingTool]
  const pencilGrade = toolSettings.pencil.grade as PencilGradeName
  const linerSize = toolSettings.liner.size as string
  const markerNib = toolSettings.marker.nib as string
  const markerSize = toolSettings.marker.size as number
  const charcoalType = toolSettings.charcoal.type as string
  // #501 — the stick's own preset slot carries which nib it is cut to, after
  // the type it is made of (`willow:chisel`). Same trick the marker plays with
  // `${nib}:${size}` and watercolor with its five fields, for the reason given
  // just below: a slot that already exists costs no bytes per operation.
  const charcoalNib = toolSettings.charcoal.nib as string
  const charcoalPreset = charcoalPresetString(
    isCharcoalType(charcoalType) ? charcoalType : DEFAULT_CHARCOAL_TYPE,
    isCharcoalNib(charcoalNib) ? charcoalNib : undefined,
  )
  // #454: the brush pen's preset slot carries its pressure response, since the
  // tool has no nib list or size ladder to spend that slot on — see
  // brushPenPresets.ts's brushPenResponseFromPreset on why the setting rides
  // the existing per-stroke string rather than a new Operation field.
  const brushPenResponse = toolSettings.brushPen.pressureResponse as string
  // #547, ADR 013 §7 — the brush's id *and* its version, assembled here rather
  // than stored: the settings layer remembers which brush is selected and has no
  // business knowing about versions, while the recorded stroke must carry the
  // one it was actually drawn with so a later retune of that brush cannot
  // repaint it. digitalBrushFromPreset resolves a bare id for exactly this
  // hand-off.
  const digitalBrushId = toolSettings.digitalBrush.brush as string
  // #547, #573 — the two pressure switches ride the same token as modifiers.
  // They change the mark, so they have to be recorded: a peer replaying the
  // stroke has their own switches in whatever position they left them.
  const digitalBrushSizeFromPressure = toolSettings.digitalBrush.sizeFromPressure as boolean
  const digitalBrushOpacityFromPressure = toolSettings.digitalBrush.opacityFromPressure as boolean
  const digitalBrushPresetName = (() => {
    const brush = digitalBrushFromPreset(digitalBrushId)
    return digitalBrushPreset(brush.id, brush.version, {
      size: digitalBrushSizeFromPressure, opacity: digitalBrushOpacityFromPressure,
    })
  })()
  // #468 v4 — the whole watercolor mix rides the one preset slot as
  // `response:water:pigment` (watercolorPresetString). Same trick the marker
  // plays with `${nib}:${size}`, and for the same reason: #366 exists to shrink
  // operation payloads, so a new Operation field is paid for by every operation
  // in every room forever, while a slot that already exists is free.
  const watercolorResponse = toolSettings.watercolor.pressureResponse as string
  const watercolorWater = toolSettings.watercolor.water as number
  const watercolorPigment = toolSettings.watercolor.pigment as number
  // #489 — and which brush, as a fifth field. Absent from every stroke recorded
  // before it, which is why they replay as the round nib they were drawn with.
  const watercolorNib = toolSettings.watercolor.nib as string
  const watercolorPreset = watercolorPresetString(
    isPressureResponse(watercolorResponse) ? watercolorResponse : 'normal',
    { water: watercolorWater, pigment: watercolorPigment },
    // (#536) The paint code rides the preset string as its fourth field, but
    // the choice of a tube is gone from the UI: the colour comes from the
    // ordinary picker like every other tool's, and every stroke records the
    // default paint's behavioural numbers. A stroke recorded with another
    // code still replays with it.
    undefined,
    isWatercolorNib(watercolorNib) ? watercolorNib : undefined,
  )

  // Same preset string engine.setPencil below records (`${nib}:${size}` for
  // marker, the size label for liner, the charcoal type for charcoal, the
  // grade name otherwise) — only marker's own dispatch (bullet/chisel)
  // actually reads it (shapingForTool -> shapingForMarkerPreset), but
  // BrushCursor takes the same shape every tool's real stroke would, not a
  // marker-only special case.
  const cursorPresetName = drawingTool === 'marker' ? `${markerNib}:${markerSize}`
    : drawingTool === 'liner' ? linerSize
    : drawingTool === 'charcoal' ? charcoalPreset
    : drawingTool === 'brushPen' ? brushPenResponse
    : drawingTool === 'watercolor' ? watercolorPreset
    : drawingTool === 'digitalBrush' ? digitalBrushPresetName
    : pencilGrade
  // #278/#279 → #482, ADR 012 §3. The frame the chisel's angle is measured in
  // is now named and lives on the tool, so the engine resolves it (dabShaping's
  // anchoredAngleShaping) instead of the UI pre-baking it.
  //
  // What this replaced: the angle was always converted to canvas space up here,
  // which for the "stay visually fixed on screen" mode meant continuously
  // subtracting the live `vp.angle` — a per-rotate-frame effect re-pushing a
  // derived number into the engine, to express something the engine could not
  // say. It can now: `screen` is one subtraction inside the shaping function,
  // where the camera angle already is.
  //
  // #489: read off whichever tool is in hand rather than off the marker, now
  // that two tools wear a chisel. Same boundary as the tilt response just
  // below, and the same care about it: a tool with no angle field at all must
  // land on the defaults instead of pushing `undefined` into the engine, so
  // both values go through a guard rather than a cast.
  const nibAngleDeg = typeof toolSettings[drawingTool]?.angle === 'number'
    ? toolSettings[drawingTool].angle as number
    : 45
  const storedAnchor = toolSettings[drawingTool]?.anchor
  const nibAnchor = typeof storedAnchor === 'string' && isNibAnchor(storedAnchor)
    ? storedAnchor
    : DEFAULT_NIB_ANCHOR
  const nibCanvasAngleRadians = (nibAngleDeg * Math.PI) / 180
  useEffect(() => {
    const engine = engineRef.current
    engine?.setNibAngle(nibCanvasAngleRadians, nibAnchor)
  }, [nibCanvasAngleRadians, nibAnchor, engineEpoch, engineRef])
  // #409: the tilt-response setting of whichever tool is in hand. The engine
  // holds one active response rather than a table (see setTiltResponse), so the
  // lookup is here — and it goes through `isTiltResponse` rather than a cast:
  // the value is a schema-validated string on the way out of localStorage, but
  // the schemas are what decides which tools even have the field, and a tool
  // without one (liner, marker) must land on the default instead of pushing
  // `undefined` into the engine.
  const tiltResponse = useMemo(() => {
    const stored = toolSettings[drawingTool]?.tiltResponse
    return typeof stored === 'string' && isTiltResponse(stored) ? stored : DEFAULT_TILT_RESPONSE
  }, [toolSettings, drawingTool])
  useEffect(() => {
    const engine = engineRef.current
    engine?.setTiltResponse(tiltResponse)
  }, [tiltResponse, engineEpoch, engineRef])
  // #475: this device's pen calibration. Unlike the tilt response above it is
  // not per tool and not read from the room's tool settings — it describes the
  // stylus and driver in front of this person, so it lives in settingsStore
  // (per browser) and applies to every tool at once. Re-pushed on change so the
  // settings panel's curve can be dragged and felt without leaving the room.
  const pressureCalibration = useSettingsStore(s => s.pressureCalibration)
  useEffect(() => {
    const engine = engineRef.current
    engine?.setPressureMap(pressureMapOf(pressureCalibration))
  }, [pressureCalibration, engineRef])
  useEffect(() => {
    const engine = engineRef.current
    // engine.setPencil's argument is a generic preset-name string
    // (StrokeOperation.preset) — pencil's own grade normally, but the
    // liner's own size label while it's the active tool. _resolvePreset in
    // engine/index.ts ignores this string for 'liner' rendering (liner has
    // one flat preset regardless of size, see LINER_PRESET's own comment),
    // but the recorded Operation should still reflect what was actually
    // selected, not silently keep whatever pencil's grade happened to be.
    // Marker (#252) piggybacks on this same free-form string rather than
    // needing a new Operation field: `_resolvePreset` has no 'marker' branch
    // yet (that's #249-251, the actual dab-shaping/compositing work), so an
    // unrecognized presetName like this just falls back to PENCIL_PRESETS
    // ['HB'] — the intended, explicitly-fine placeholder rendering until
    // then — while nib+size are still faithfully recorded/replicated on the
    // wire via the existing preset string for whenever the engine side is
    // ready to actually read them back out of it.
    // Charcoal's string was the type name alone until #501 ('vine'/'willow'/
    // 'compressed'), because all three types shared one dab geometry (ADR 005
    // §2) — they still do, but the nib no longer does, so the same slot now
    // carries both halves and _resolvePreset reads the type out of field 0.
    const markerPreset = `${markerNib}:${markerSize}`
    engine?.setPencil(
      drawingTool === 'liner' ? linerSize
        : drawingTool === 'marker' ? markerPreset
        : drawingTool === 'charcoal' ? charcoalPreset
        : drawingTool === 'brushPen' ? brushPenResponse
        : drawingTool === 'watercolor' ? watercolorPreset
        : drawingTool === 'digitalBrush' ? digitalBrushPresetName
        : pencilGrade,
    )
  }, [drawingTool, pencilGrade, linerSize, markerNib, markerSize, charcoalPreset, brushPenResponse, watercolorPreset, digitalBrushPresetName, engineEpoch, engineRef])
  // (#405) Every line in this block reads `drawingTool` rather than the
  // selection: `setTool` takes a `ToolType`, and the four non-painting tools
  // are deliberately not one (toolSlice). Leaving the engine configured with
  // the last real drawing tool is also what makes switching back to it
  // instant — nothing to re-push, since nothing was ever unset. What actually
  // stops paint while the ruler or the gizmo is selected is `engine.setLocked`
  // (see the layer-state sync effect), one gate rather than a second copy of
  // "which tools can draw" living in here.
  useEffect(() => {
    const engine = engineRef.current
    engine?.setTool(drawingTool)
  }, [drawingTool, engineEpoch, engineRef])
  // Liner's own 'size' field is a fixed-label enum (ADR 003), not a plain px
  // number like every other tool's (marker included, since it dropped its
  // own ladder for a plain px slider) — see linerSizeToPx's own comment for
  // why the mm→px mapping lives in the UI layer. Hoisted out of the
  // engine-sync effect below (not effect-local) so BrushCursor can read the
  // same physical-px value for its hover preview without recomputing it.
  const sizePx = drawingTool === 'liner' ? linerSizeToPx(activeCfg.size as string)
    : (activeCfg.size as number)
  useEffect(() => {
    const engine = engineRef.current
    engine?.setSize(sizePx)
    // (#468 v4) Watercolor has no opacity field: its Pigment slider *is* that
    // axis, and a second control for it would be two knobs over one quantity.
    // Falls back to 1 rather than passing undefined through to the engine.
    engine?.setOpacity((activeCfg.opacity as number | undefined) ?? 1)
  }, [sizePx, activeCfg, engineEpoch, engineRef])

  return { cursorPresetName, nibAnchor, nibCanvasAngleRadians, tiltResponse, sizePx }
}
