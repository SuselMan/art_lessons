import { useCallback, useEffect, useMemo, useRef } from 'react'

import { isToolEnabledInRoom, SHAPE_KINDS } from '@grafetto/shared'

import { isFloatingPanelTool, TOOL_DISPLAY } from '../../components/FloatingToolPanel/tools'
import type { PanelGroups, SlotGroup } from '../../components/FloatingToolPanel/slots'
import type { PickerOption } from '../../components/OptionPicker/types'
import { shapeKindOf, SHAPE_KIND_ICONS, SHAPE_KIND_LABEL_KEYS } from '../../lib/tools/toolSchemas'
import { TOOL_PHOTOS } from '../../lib/tools/toolTypeImages'
import { useT } from '../../i18n'
import { useRoomStore } from '../../stores/roomStore'
import { notifyWarning } from '../../stores/noticeStore'
import {
  isPrimaryDrawingTool, PRIMARY_DRAWING_TOOLS, type EditorTool, type PrimaryDrawingTool,
} from '../../stores/slices/toolSlice'
import { drawingGroupToolFor, fallbackToolFor, toggledTool } from './tools/toolChoice'

/** (#493) Which tools this room offers, every way a tool gets into a hand, and
 *  the two groups (materials, shapes) the rail and the floating panel show.
 *  Out of Room. Everything here is the store's — the room's toolset, the tool
 *  in hand, its settings — so the hook takes no arguments at all.
 *
 *  (#548) `selectTool` and `toggleTool` are the one gate on the room's toolset:
 *  every way a tool gets into a hand routes through one of them, so refusing a
 *  tool the room does not offer is one check rather than fifteen. The toolbar
 *  does not render those buttons at all; this is the backstop for the paths
 *  with no button to hide — a hotkey, a floating-panel slot assigned before the
 *  tool was switched off. */
export function useToolChoice() {
  const t = useT()
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

  /** Whether the room offers this tool at all. The toolbar asks it per button
   *  (a tool the room does not offer has no button). */
  const toolOffered = useCallback(
    (candidate: EditorTool) => isToolEnabledInRoom(enabledTools, candidate),
    [enabledTools],
  )
  const fallbackTool = useMemo(() => fallbackToolFor(enabledTools), [enabledTools])

  // (#405) Selecting a tool selects it. Pressing a toolbar button never hands
  // the canvas back to something else, however many times it is pressed: a
  // button that reads as "this tool is in hand" and answers a second press by
  // putting a *different* tool in hand contradicts the one thing this whole
  // change is for. It also could not be consistent — the toggle-back target
  // used to be `lastDrawingTool` for the eraser and smudge but a hardcoded
  // pencil for charcoal, liner and marker, so the same gesture landed
  // somewhere different depending on which button you pressed.
  const selectTool = useCallback((next: EditorTool) => {
    if (!isToolEnabledInRoom(enabledTools, next)) return
    setTool(next)
  }, [setTool, enabledTools])

  // (#544) Picking one member out of a group's fan in the floating panel. The
  // two groups differ exactly here and nowhere the panel can see: a material
  // *is* a tool, while a shape is a setting on a tool that then has to be
  // taken as well. Routed through `selectTool` like every other path into a
  // hand, so the toolset gate applies here too.
  const selectGroupMember = useCallback((group: SlotGroup, value: string) => {
    if (group === 'drawing') { selectTool(value as EditorTool); return }
    setToolSetting('shape', 'kind', value)
    selectTool('shape')
  }, [selectTool, setToolSetting])

  // The toggle survives, but only on the *keys*. "Press E, do a correction,
  // press E again" is a real one-handed affordance that a key can offer and a
  // button cannot: the finger is already there, and there is no visual state
  // claiming otherwise. Both halves route through here so a second press
  // always lands on the tool you were drawing with, whichever key it was.
  const toggleTool = useCallback((next: EditorTool) => {
    if (!isToolEnabledInRoom(enabledTools, next)) return
    setTool(prev => toggledTool(prev, next, drawingTool, enabledTools))
  }, [setTool, drawingTool, enabledTools])

  // (#548) The hand that was holding a tool the room has just stopped
  // offering. Every other path is closed by `selectTool` above, but this one
  // is not a selection at all — the tool was already in hand when the toolset
  // moved under it.
  //
  // Silent on the first run: a room whose toolset excludes the pencil hands a
  // joiner something else before they have touched anything, and announcing
  // that would be telling someone their tool was taken when they never had it.
  // Only an actual change during the session is worth a word.
  const toolsetSeenRef = useRef(false)
  useEffect(() => {
    const announce = toolsetSeenRef.current
    toolsetSeenRef.current = true
    if (isToolEnabledInRoom(enabledTools, tool)) return
    setTool(fallbackTool)
    if (announce) notifyWarning(t('toolset.withdrawn'), { key: 'toolset-withdrawn' })
  }, [enabledTools, tool, fallbackTool, setTool, t])

  // (#544) The three things the rail's one drawing button needs: its options,
  // what it wears (see drawingGroupToolFor), and whether it is lit.
  const drawingGroupOptions = useMemo<PickerOption[]>(
    () => PRIMARY_DRAWING_TOOLS.filter(toolOffered).map(id => ({
      value: id,
      label: t(TOOL_DISPLAY[id].labelKey),
      photo: TOOL_PHOTOS[id],
    })),
    [toolOffered, t],
  )
  const drawingGroupTool = useMemo<PrimaryDrawingTool>(
    () => drawingGroupToolFor(lastDrawingTool, enabledTools),
    [lastDrawingTool, enabledTools],
  )
  // Lit when any material is in hand — not when `tool` happens to equal the
  // one the button is wearing. The eraser and the smudge are their own buttons
  // beside it and must not light this one.
  const drawingGroupActive = isPrimaryDrawingTool(tool)
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
      value: drawingGroupTool,
      members: drawingGroupOptions.map(option => ({
        value: option.value,
        label: option.label,
        icon: TOOL_DISPLAY[option.value as PrimaryDrawingTool].icon,
      })),
    },
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
  }), [drawingGroupTool, drawingGroupOptions, shapeKind, shapeKindOptions, toolOffered])
  // Which slots light up. Deliberately null for the tools no slot can name —
  // which, now that every toolbar tool can sit in a slot, means only the
  // annotation set, and the panel is not on screen alongside those anyway.
  const floatingSlotTool = isFloatingPanelTool(tool) ? tool : null

  return {
    toolOffered, selectTool, selectGroupMember, toggleTool,
    drawingGroupOptions, drawingGroupTool, drawingGroupActive, shapeKind, shapeKindOptions,
    panelGroups, floatingSlotTool,
  }
}
