import { useBrushPreviewRefresh } from './useBrushPreviewRefresh'
import { currentBrushSelection, currentNativeBrushPreviews } from '../../lib/api/brushLibrary'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { isToolEnabledInRoom, SHAPE_KINDS } from '@grafetto/shared'

import { isFloatingPanelTool, TOOL_DISPLAY } from '../../components/FloatingToolPanel/tools'
import type { PanelGroups, SlotGroup } from '../../components/FloatingToolPanel/slots'
import type { PickerOption } from '../../components/OptionPicker/types'
import { shapeKindOf, SHAPE_KIND_ICONS, SHAPE_KIND_LABEL_KEYS } from '../../lib/tools/toolSchemas'
import { pickerImportedBrushes } from '../../lib/tools/brushCatalog'
import { TOOL_PHOTOS } from '../../lib/tools/toolTypeImages'
import { useT } from '../../i18n'
import { useRoomStore } from '../../stores/roomStore'
import { notifyWarning } from '../../stores/noticeStore'
import {
  isPrimaryDrawingTool, PRIMARY_DRAWING_TOOLS, type EditorTool, type PrimaryDrawingTool,
} from '../../stores/slices/toolSlice'
import { drawingGroupToolFor, toggledTool } from './tools/toolChoice'
import { useRememberedTool } from './useRememberedTool'

/** (#493) Which tools this room offers, every way a tool gets into a hand, and
 *  the two groups (materials, shapes) the rail and the floating panel show.
 *  Out of Room. Everything here is the store's — the room's toolset, the tool
 *  in hand, its settings — except the room id, which only the tool this device
 *  last held here needs (#682, see useRememberedTool).
 *
 *  (#548) `selectTool` and `toggleTool` are the one gate on the room's toolset:
 *  every way a tool gets into a hand routes through one of them, so refusing a
 *  tool the room does not offer is one check rather than fifteen. The toolbar
 *  does not render those buttons at all; this is the backstop for the paths
 *  with no button to hide — a hotkey, a floating-panel slot assigned before the
 *  tool was switched off. */
export function useToolChoice(roomId: string | undefined) {
  // (#682) First, before the reads below: a remembered tool has to be in the
  // store by the time this render — and Room's, which builds the engine from
  // it — reads `tool`.
  useRememberedTool(roomId)
  const t = useT()
  const [galleryOpen, setGalleryOpen] = useState(false)
  const moreBrushes = useMemo<PickerOption>(() => ({ value: 'more-brushes', icon: 'add', label: t('gallery.more'), action: () => setGalleryOpen(true) }), [t])
  // (#548) `undefined` for all tools, which is what every room says until
  // someone restricts it. Read straight off the room rather than mirrored into
  // a field of its own: it arrives inside `room_state` and is patched by
  // `room_tools_changed`, and a second copy would only be a second thing to
  // keep in step.
  const enabledTools = useRoomStore(s => s.room?.enabledTools)
  const tool = useRoomStore(s => s.tool)
  const drawingTool = useRoomStore(s => s.drawingTool)
  const lastDrawingTool = useRoomStore(s => s.lastDrawingTool)
  const setTool = useRoomStore(s => s.setTool)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const brushRevision = useRoomStore(s => s.brushLibraryRevision)
  useBrushPreviewRefresh(roomId, brushRevision)
  const brushSelection = currentBrushSelection()
  const nativeOffered = useCallback((id: string) => !brushSelection || brushSelection.includes(`native:${id}`), [brushSelection])
  const brushes = useMemo(() => ({ revision: brushRevision, selection: brushSelection, drawing: pickerImportedBrushes(), eraser: pickerImportedBrushes('eraser'), smudge: pickerImportedBrushes('smudge') }), [brushRevision, brushSelection])

  // Native digital presets are replay-only. A fresh selection uses the
  // standard Krita basic brush when available, otherwise the first paint preset.
  useEffect(() => {
    const paint = brushes.drawing
    const defaultId = (paint.find(b => b.source === 'b)_Basic-5_Size.kpp') ?? paint[0])?.descriptor.id
    const selected = toolSettings.digitalBrush.brush as string
    if (!selected.startsWith('imported-') && defaultId) setToolSetting('digitalBrush', 'brush', defaultId)
    if (tool !== 'digitalBrush') return
    for (const role of ['eraser', 'smudge'] as const) {
      if (brushes[role].some(b => b.descriptor.id === selected)) {
        if (!brushSelection && !isToolEnabledInRoom(enabledTools, role)) return
        setToolSetting(role, 'brush', selected)
        setToolSetting('digitalBrush', 'brush', defaultId ?? '')
        setTool(role)
        return
      }
    }
  }, [tool, toolSettings.digitalBrush.brush, brushes, brushSelection, enabledTools, setTool, setToolSetting])

  useEffect(() => {
    if (tool === 'digitalBrush') {
      const drawingBrushes = brushes.drawing
      if (!drawingBrushes.some(b => b.descriptor.id === toolSettings.digitalBrush.brush) && drawingBrushes[0]) setToolSetting('digitalBrush', 'brush', drawingBrushes[0].descriptor.id)
    }
    if (tool === 'eraser' || tool === 'smudge') {
      const selected = toolSettings[tool].brush
      if (selected === 'native' && !nativeOffered(tool) || selected !== 'native' && !brushes[tool].some(b => b.descriptor.id === selected)) setToolSetting(tool, 'brush', nativeOffered(tool) ? 'native' : brushes[tool][0]?.descriptor.id ?? 'native')
    }
  }, [tool, brushes, nativeOffered, toolSettings, setToolSetting])

  /** Whether the room offers this tool at all. The toolbar asks it per button
   *  (a tool the room does not offer has no button). */
  const toolOffered = useCallback(
    (candidate: EditorTool) => {
      if ((!brushSelection || !['pencil','liner','marker','charcoal','brushPen','digitalBrush','eraser','smudge'].includes(candidate)) && !isToolEnabledInRoom(enabledTools, candidate)) return false
      if (candidate === 'digitalBrush') return brushes.drawing.length > 0
      if (candidate === 'eraser' || candidate === 'smudge') return !brushSelection || brushSelection.includes(`native:${candidate}`) || brushes[candidate].length > 0
      if (PRIMARY_DRAWING_TOOLS.includes(candidate as PrimaryDrawingTool)) return !brushSelection || brushSelection.includes(`native:${candidate}`)
      return true
    },
    [enabledTools, brushSelection, brushes],
  )
  const fallbackTool = useMemo<PrimaryDrawingTool>(() => PRIMARY_DRAWING_TOOLS.find(id => toolOffered(id)) ?? 'pencil', [toolOffered])

  // (#405) Selecting a tool selects it. Pressing a toolbar button never hands
  // the canvas back to something else, however many times it is pressed: a
  // button that reads as "this tool is in hand" and answers a second press by
  // putting a *different* tool in hand contradicts the one thing this whole
  // change is for. It also could not be consistent — the toggle-back target
  // used to be `lastDrawingTool` for the eraser and smudge but a hardcoded
  // pencil for charcoal, liner and marker, so the same gesture landed
  // somewhere different depending on which button you pressed.
  const selectTool = useCallback((next: EditorTool) => {
    if (!toolOffered(next)) return
    if (next === 'eraser' || next === 'smudge') {
      const chosen = toolSettings[next].brush
      if (chosen === 'native' && !nativeOffered(next) || chosen !== 'native' && !brushes[next].some(b => b.descriptor.id === chosen)) setToolSetting(next, 'brush', nativeOffered(next) ? 'native' : brushes[next][0]?.descriptor.id ?? 'native')
    }
    setTool(next)
  }, [setTool, toolOffered, nativeOffered, brushes, toolSettings, setToolSetting])

  // (#544) Picking one member out of a group's fan in the floating panel. The
  // two groups differ exactly here and nowhere the panel can see: a material
  // *is* a tool, while a shape is a setting on a tool that then has to be
  // taken as well. Routed through `selectTool` like every other path into a
  // hand, so the toolset gate applies here too.
  const selectGroupMember = useCallback((group: SlotGroup, value: string) => {
    if (group === 'shape') { setToolSetting('shape', 'kind', value); selectTool('shape'); return }
    if (group === 'eraser' || group === 'smudge') {
      setToolSetting(group, 'brush', value === group ? 'native' : value)
      selectTool(group)
      return
    }
    if (value.startsWith('digital:')) {
      setToolSetting('digitalBrush', 'brush', value.slice(8))
      selectTool('digitalBrush')
    } else selectTool(value as EditorTool)
  }, [selectTool, setToolSetting])

  useEffect(() => {
    if (brushSelection || isToolEnabledInRoom(enabledTools, 'digitalBrush')) return
    for (const role of ['eraser', 'smudge'] as const) {
      if (toolSettings[role].brush !== 'native') setToolSetting(role, 'brush', 'native')
    }
  }, [enabledTools, brushSelection, toolSettings, setToolSetting])

  // The toggle survives, but only on the *keys*. "Press E, do a correction,
  // press E again" is a real one-handed affordance that a key can offer and a
  // button cannot: the finger is already there, and there is no visual state
  // claiming otherwise. Both halves route through here so a second press
  // always lands on the tool you were drawing with, whichever key it was.
  const toggleTool = useCallback((next: EditorTool) => {
    if (!toolOffered(next)) return
    setTool(prev => { const chosen = toggledTool(prev, next, drawingTool, enabledTools); return toolOffered(chosen) ? chosen : fallbackTool })
  }, [setTool, drawingTool, enabledTools, toolOffered, fallbackTool])

  // (#548) The hand that was holding a tool the room has just stopped
  // offering. Every other path is closed by `selectTool` above, but this one
  // is not a selection at all — the tool was already in hand when the toolset
  // moved under it.
  //
  // Silent on the first run: a room whose toolset excludes the pencil hands a
  // joiner something else before they have touched anything, and announcing
  // that would be telling someone their tool was taken when they never had it.
  // Only an actual change during the session is worth a word.
  //
  // (#682) "First run" means the first run with the room known. A joiner's
  // `room` is null until `room_state`, and null reads as "every tool" — so the
  // run at mount saw nothing, and the room's real toolset then arrived looking
  // like a change. That was invisible while every room opened on the pencil
  // (which a toolset can exclude, but rarely does); with the tool now restored
  // per room, the one the teacher has since switched off would be announced as
  // taken on every entry.
  const roomKnown = useRoomStore(s => s.room !== null)
  const toolsetSeenRef = useRef(false)
  useEffect(() => {
    if (!roomKnown) return
    const announce = toolsetSeenRef.current
    toolsetSeenRef.current = true
    if (toolOffered(tool)) return
    setTool(fallbackTool)
    if (announce) notifyWarning(t('toolset.withdrawn'), { key: 'toolset-withdrawn' })
  }, [roomKnown, enabledTools, tool, fallbackTool, setTool, t, toolOffered])

  // (#544) The three things the rail's one drawing button needs: its options,
  // what it wears (see drawingGroupToolFor), and whether it is lit.
  // The immutable brush registry is outside React; this revision is its subscription key.
  const drawingGroupOptions = useMemo<PickerOption[]>(() => {
    const native = PRIMARY_DRAWING_TOOLS.filter(id => id !== 'digitalBrush' && toolOffered(id)).map(id => ({
      value: id, label: t(TOOL_DISPLAY[id].labelKey), photo: TOOL_PHOTOS[id], image: currentNativeBrushPreviews()[id],
    }))
    if (!brushSelection && !isToolEnabledInRoom(enabledTools, 'digitalBrush')) return [...native, moreBrushes]
    return [...native, ...brushes.drawing.map(b => ({
      value: 'digital:' + b.descriptor.id, label: b.name,
      thumbnail: b.preview, image: b.strokePreview,
    })), moreBrushes]
  }, [toolOffered, t, moreBrushes, brushes, enabledTools, brushSelection])
  const roleOptions = (role: 'eraser' | 'smudge'): PickerOption[] => toolOffered(role) ? [
    ...(nativeOffered(role) ? [{ value: role, label: t(TOOL_DISPLAY[role].labelKey), photo: TOOL_PHOTOS[role], image: currentNativeBrushPreviews()[role], photoTipScale: role === 'smudge' ? 1.15 : 1.7 }] : []),
    ...((brushSelection || isToolEnabledInRoom(enabledTools, 'digitalBrush')) ? brushes[role] : []).map(b => ({ value: b.descriptor.id, label: b.name,
      thumbnail: b.preview, image: b.strokePreview })), moreBrushes,
  ] : []
  const eraserGroupOptions = roleOptions('eraser')
  const smudgeGroupOptions = roleOptions('smudge')
  const eraserGroupValue = toolSettings.eraser.brush === 'native' ? 'eraser' : toolSettings.eraser.brush as string
  const smudgeGroupValue = toolSettings.smudge.brush === 'native' ? 'smudge' : toolSettings.smudge.brush as string
  const drawingGroupTool = useMemo<PrimaryDrawingTool>(
    () => toolOffered(lastDrawingTool) ? brushSelection ? lastDrawingTool : drawingGroupToolFor(lastDrawingTool, enabledTools) : fallbackTool,
    [lastDrawingTool, enabledTools, toolOffered, fallbackTool, brushSelection],
  )
  // Lit when any material is in hand — not when `tool` happens to equal the
  // one the button is wearing. The eraser and the smudge are their own buttons
  // beside it and must not light this one.
  const drawingGroupActive = isPrimaryDrawingTool(tool)
  const drawingGroupValue = drawingGroupTool === 'digitalBrush' ? 'digital:' + toolSettings.digitalBrush.brush : drawingGroupTool
  // (#544) The same three things for the shapes, with one difference that
  // matters: these options are values of one tool's `kind` setting, not tools.
  // The chooser therefore reads and writes the setting — and the labels and
  // icons come from that setting's own schema, so the rail cannot come to
  // disagree with the settings panel about what a polystar is called.
  const shapeKind = shapeKindOf(toolSettings)
  const shapeKindOptions = useMemo<PickerOption[]>(
    () => SHAPE_KINDS.map(kind => ({
      value: kind,
      label: t(SHAPE_KIND_LABEL_KEYS[kind]),
      icon: SHAPE_KIND_ICONS[kind],
    })),
    [t],
  )
  // (#544) The same two groups again, in the shape the floating panel wants
  // them. Built from the values above rather than beside them, so the panel
  // and the rail cannot come to disagree about what is in hand — which is the
  // whole reason the panel stopped keeping its own answer (a role) in the
  // first place.
  //
  // The shape group is empty when the room does not offer shapes; the panel
  // reads that as "withdrawn" and draws the slot dim. The drawing group can
  // never be empty — a toolset always keeps one material.
  const panelGroups = useMemo<PanelGroups>(() => ({
    drawing: {
      tool: drawingGroupTool,
      icon: TOOL_DISPLAY[drawingGroupTool].icon,
      value: drawingGroupValue,
      members: drawingGroupOptions.map(option => ({
        value: option.value,
        label: option.label,
        icon: TOOL_DISPLAY.digitalBrush.icon,
        photo: option.photo, thumbnail: option.thumbnail, group: option.group, action: option.action, image: option.image,
      })),
    },
    eraser: { tool: 'eraser', icon: 'ink_eraser', value: eraserGroupValue, members: eraserGroupOptions.map(o => ({ ...o, icon: 'ink_eraser' as const })) },
    smudge: { tool: 'smudge', icon: 'smudge', value: smudgeGroupValue, members: smudgeGroupOptions.map(o => ({ ...o, icon: 'smudge' as const })) },
    shape: {
      tool: 'shape',
      icon: SHAPE_KIND_ICONS[shapeKind],
      value: shapeKind,
      members: toolOffered('shape')
        ? shapeKindOptions.map(option => ({
          value: option.value,
          label: option.label,
          icon: option.icon ?? 'shapes',
        }))
        : [],
    },
  }), [drawingGroupTool, drawingGroupValue, drawingGroupOptions, eraserGroupValue, smudgeGroupValue, eraserGroupOptions, smudgeGroupOptions, shapeKind, shapeKindOptions, toolOffered])
  // Which slots light up. Deliberately null for the tools no slot can name —
  // which, now that every toolbar tool can sit in a slot, means only the
  // annotation set, and the panel is not on screen alongside those anyway.
  const floatingSlotTool = isFloatingPanelTool(tool) ? tool : null

  return {
    galleryOpen, openGallery: () => setGalleryOpen(true), closeGallery: () => setGalleryOpen(false),
    toolOffered, selectTool, selectGroupMember, toggleTool,
    drawingGroupOptions, drawingGroupTool, drawingGroupValue, drawingGroupActive, eraserGroupOptions, smudgeGroupOptions, eraserGroupValue, smudgeGroupValue, shapeKind, shapeKindOptions,
    panelGroups, floatingSlotTool,
  }
}
