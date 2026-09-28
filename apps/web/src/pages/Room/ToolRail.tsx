import type { RefObject } from 'react'
import clsx from 'clsx'

import type { ShapeKind } from '@grafetto/shared'

import { ColorWell } from '../../components/ColorWell'
import { TOOL_DISPLAY } from '../../components/FloatingToolPanel/tools'
import { Icon } from '../../components/Icon'
import type { PickerOption } from '../../components/OptionPicker/types'
import { ToolGroupButton } from '../../components/ToolGroupButton'
import { useT } from '../../i18n'
import { formatHotkeyLabel } from '../../lib/input/hotkeys'
import { useRoomStore } from '../../stores/roomStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { EditorTool, PrimaryDrawingTool } from '../../stores/slices/toolSlice'
import type { ColorWellState } from './colorWell'
import { isShapeTool, SHAPE_KIND_ICONS, SHAPE_KIND_LABEL_KEYS } from './toolSchemas'
import styles from './Room.module.css'

export interface ToolRailProps {
  uiHidden: boolean
  /** The rail shows the annotation tools instead of the drawing ones — the
   *  compact shell, or annotation mode (#509). */
  annotationRail: boolean
  /** The phone-sized "annotations only" shell (#512). */
  compact: boolean
  /** Whether the room's toolset offers a tool (#548). */
  toolOffered: (tool: EditorTool) => boolean
  selectTool: (tool: EditorTool) => void
  /** The pinned colour well (#542) and the surface it opens. */
  railWellRef: RefObject<HTMLButtonElement | null>
  well: ColorWellState
  wellLabel: string
  colorExpanded: boolean
  openRailColorSurface: () => void
  /** The drawing group's button (#544) — shared with the floating panel,
   *  so Room computes it once for both. */
  drawingGroupTool: PrimaryDrawingTool
  drawingGroupOptions: PickerOption[]
  drawingGroupActive: boolean
  gradeHotkeyLabels: string
  /** The shape group's button — the same, for the shape tool's `kind`. */
  shapeKind: ShapeKind
  shapeKindOptions: PickerOption[]
  /** Something to transform — the transform button is disabled without it,
   *  except while it is the tool in hand. */
  hasTransformTargets: boolean
  clearAllAnnotations: () => void
}

/** (#493) The tool rail on the left: the pinned colour, one button per
 *  verb — the drawing group, eraser, smudge, hand, eyedropper, ruler,
 *  transform, selection, fill, the shape group, grid — or, in annotation
 *  mode and the compact shell, the annotation tools.
 *
 *  Out of Room's render. Which tool is in hand, the hotkeys its titles quote
 *  and the annotations it counts are read from the stores; the two groups
 *  come in, because the floating panel is built from the same values. */
export function ToolRail({
  uiHidden, annotationRail, compact, toolOffered, selectTool,
  railWellRef, well, wellLabel, colorExpanded, openRailColorSurface,
  drawingGroupTool, drawingGroupOptions, drawingGroupActive, gradeHotkeyLabels,
  shapeKind, shapeKindOptions, hasTransformTargets, clearAllAnnotations,
}: ToolRailProps): React.JSX.Element {
  const t = useT()
  const tool = useRoomStore(s => s.tool)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const annotations = useRoomStore(s => s.annotations)
  const hotkeys = useSettingsStore(s => s.hotkeys)
  const eyedropperActive = tool === 'eyedropper'
  const rulerActive = tool === 'ruler'
  const transformActive = tool === 'transform'
  const selectionActive = tool === 'selection'
  const fillActive = tool === 'fill'
  const shapeActive = isShapeTool(tool)
  const annotateTextActive = tool === 'annotateText'
  const annotatePenActive = tool === 'annotatePen'
  const annotateEraserActive = tool === 'annotateEraser'

  return (
    <aside className={clsx(styles.toolbar, uiHidden && styles.uiHidden, styles.strokeBlockable)}>

      {/* (#542) The colour, pinned. It sits above the tool buttons and
          outside the schema-driven column to the right, which is the whole
          change: as an ordinary quickAccess field its place in that column
          was wherever the active tool's schema happened to list it — fourth
          for the pencil, third for the liner, eighth for the watercolour,
          absent for the eraser — so the one control a person reaches for
          most moved every time they changed tools.

          Above the buttons rather than below them because which buttons are
          there depends on the room's toolset (#548) and the column grows
          downwards: only the top edge is fixed.

          Present for every tool, including the ones that own no colour —
          `colorTool` falls back to the last drawing tool, so with a rubber
          in hand this still shows and edits the colour the next stroke will
          use, which is what the picker has always done in that state. */}
      <ColorWell
        ref={railWellRef}
        fill={well.fill}
        stroke={well.stroke}
        highlight={well.highlight}
        size={40}
        className={styles.railColorWell}
        label={wellLabel}
        expanded={colorExpanded}
        onClick={openRailColorSurface}
      />
      <div className={styles.railColorWellDivider} aria-hidden="true" />

      {/* (#512) Everything that draws *on* the picture is absent from the
          compact shell. Not disabled — absent: a phone is here to react to
          someone else's work, and a column of tools that cannot be used on
          a screen this size is worse than no column. Undo/redo, the view
          controls and the annotation tools below stay. */}
      {!annotationRail && (<>
      {/* (#544) One button for every drawing material, with the chooser
          behind it — see components/ToolGroupButton. There used to be
          seven buttons here, one per material, and the rail grew by one
          with every material this app learned; the research in #544 found
          that none of the seven editors surveyed does that. A rail is
          verbs. What you draw *with* is a choice inside the verb.

          The button wears the current material's own icon rather than a
          fixed brush, so the rail still answers "what is in my hand"; the
          corner mark is what says there is a choice behind it.

          gradeHotkeyLabels and the per-material hotkeys are untouched by
          this: `,`/`.` still step the pencil's grade, and C/L/M/B/W/D
          still take their material directly, which is what keeps the
          chooser optional rather than a toll on every switch. */}
      <ToolGroupButton
        className={styles.toolIconBtn}
        activeClassName={styles.toolIconBtnActive}
        active={drawingGroupActive}
        icon={TOOL_DISPLAY[drawingGroupTool].icon}
        title={t(
          // The pencil's grade keys have nowhere else to be announced, so
          // its own variant of the sentence carries them; every other
          // material reads the plain one.
          drawingGroupTool === 'pencil' ? 'tool.drawingTitlePencil' : 'tool.drawingTitle',
          { tool: t(TOOL_DISPLAY[drawingGroupTool].labelKey), hotkeys: gradeHotkeyLabels },
        )}
        label={t('tool.drawing')}
        options={drawingGroupOptions}
        value={drawingGroupTool}
        onSelect={value => selectTool(value as EditorTool)}
        onActivate={() => selectTool(drawingGroupTool)}
      />

      {toolOffered('eraser') && (
        <button
          className={clsx(styles.toolIconBtn, tool === 'eraser' && styles.toolIconBtnActive)}
          title={t('tool.eraserTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleEraser) })}
          aria-label={t('tool.eraserTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleEraser) })}
          onClick={() => selectTool('eraser')}
        ><Icon name="ink_eraser" /></button>
      )}
      {toolOffered('smudge') && (
        <button
          className={clsx(styles.toolIconBtn, tool === 'smudge' && styles.toolIconBtnActive)}
          title={t('tool.smudgeTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleSmudge) })}
          aria-label={t('tool.smudge')}
          onClick={() => selectTool('smudge')}
        ><Icon name="smudge" /></button>
      )}

      <div className={styles.toolDivider} />

      {/* Hand (#319, ADR 007) — the only way to move the canvas with
          nothing in hand but a stylus: a pen has no middle button, and
          Space needs a free second hand.
          (#443) Selected like every other button here, with the same fill.
          It used to be a modifier with an outline of its own, lit *beside*
          whichever tool was selected — the one button on the panel that
          needed a paragraph to explain, and the reason it looked wrong is
          that two things were on at once, which is precisely what #405
          set out to remove everywhere else. */}
      {toolOffered('hand') && (
        <button
          className={clsx(styles.toolIconBtn, tool === 'hand' && styles.toolIconBtnActive)}
          title={t('tool.handTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleHand) })}
          aria-label={t('tool.hand')}
          aria-pressed={tool === 'hand'}
          onClick={() => selectTool('hand')}
        ><Icon name="pan_tool" /></button>
      )}

      {/* (#405) The four tools below the divider select like every button
          above it — one tool is in hand at a time, and pressing the same
          one again hands the canvas back to the drawing tool. They used to
          be mode toggles laid over whichever pencil was current, which is
          what let a transform session and a pencil both be "selected".

          Eyedropper (#82) picks a color from the canvas, writes it into
          the tool it hands back to, and opens the ColorPicker tab of the
          unified right-side SidePanel (see .layerPanelWrap below) to
          refine it. */}
      {toolOffered('eyedropper') && (
        <button
          className={clsx(styles.toolIconBtn, eyedropperActive && styles.toolIconBtnActive)}
          title={t('tool.eyedropperTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleEyedropper) })}
          aria-label={t('tool.eyedropper')}
          aria-pressed={eyedropperActive}
          onClick={() => selectTool('eyedropper')}
        ><Icon name="colorize" /></button>
      )}
      {toolOffered('ruler') && (
        <button
          className={clsx(styles.toolIconBtn, rulerActive && styles.toolIconBtnActive)}
          title={t('tool.rulerTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleRuler) })}
          aria-label={t('tool.ruler')}
          aria-pressed={rulerActive}
          onClick={() => selectTool('ruler')}
        ><Icon name="square_foot" /></button>
      )}
      {toolOffered('transform') && (
        <button
          className={clsx(styles.toolIconBtn, transformActive && styles.toolIconBtnActive)}
          title={t('tool.transformTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleTransform) })}
          aria-label={t('tool.transform')}
          aria-pressed={transformActive}
          // (#405) Stays clickable while it is the selected tool even with
          // nothing to transform — see the hotkey's own note: disabling the
          // only way out of a tool is how you get stuck in it.
          disabled={!transformActive && !hasTransformTargets}
          onClick={() => selectTool('transform')}
        ><Icon name="free-transform" /></button>
      )}
      {/* (#446) Next to transform because that is what it is for: mark a
          region, then move it with the gizmo. Never disabled — with
          nothing selectable the gestures simply do not start, and a
          disabled tool button is a dead end rather than an explanation. */}
      {toolOffered('selection') && (
        <button
          className={clsx(styles.toolIconBtn, selectionActive && styles.toolIconBtnActive)}
          title={t('tool.selectionTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleSelection) })}
          aria-label={t('tool.selection')}
          aria-pressed={selectionActive}
          onClick={() => selectTool('selection')}
        ><Icon name="highlight_alt" /></button>
      )}
      {/* (#453) Next to the selection rather than among the brushes: it
          addresses a region and stamps pixels into it, which is what the
          two tools beside it do. It is not a brush and does not emit a
          stroke (see NON_DRAWING_TOOLS). */}
      {toolOffered('fill') && (
        <button
          className={clsx(styles.toolIconBtn, fillActive && styles.toolIconBtnActive)}
          title={t('tool.fill')}
          aria-label={t('tool.fill')}
          aria-pressed={fillActive}
          onClick={() => selectTool('fill')}
        ><Icon name="format_color_fill" /></button>
      )}

      {/* (#525) The shape tool, next to the fill for the same reason the
          fill sits next to the selection: it is not a brush, and it puts a
          region of pixels down in one gesture rather than laying a stroke.

          One button rather than four (Ilya, 05.09). The four shapes are
          four ways of doing one thing, so which one it draws is a modifier
          in the quick column — the same call the selection tool makes about
          its three ways of marking a region.

          (#541, revised in #544) It wore a composite glyph for a while,
          and the reason was sound at the time: wearing the current shape
          read as "this is the rectangle tool" and hid the fact that there
          are four. What answers that now is the corner mark, which says
          "there is a choice here" without spending the icon on it — so the
          icon goes back to doing the job every other button in this rail
          does, naming what is in hand.

          The one way this button differs from the drawing group above:
          choosing here changes a *setting* of one tool rather than which
          tool is in hand. So the chooser also takes the tool — picking a
          star from the rail while the ruler is in hand means "draw a
          star", not "remember that I like stars".

          (#548) Behind the room's toolset like every other button here.
          It was the one that wasn't, because the toolset and this tool were
          built in parallel branches and neither knew about the other. */}
      {toolOffered('shape') && (
        <ToolGroupButton
          className={styles.toolIconBtn}
          activeClassName={styles.toolIconBtnActive}
          active={shapeActive}
          icon={SHAPE_KIND_ICONS[shapeKind]}
          title={t('tool.shapeTitle', { shape: t(SHAPE_KIND_LABEL_KEYS[shapeKind]) })}
          label={t('tool.shape')}
          options={shapeKindOptions}
          value={shapeKind}
          onSelect={value => {
            setToolSetting('shape', 'kind', value)
            selectTool('shape')
          }}
          onActivate={() => selectTool('shape')}
        />
      )}

      <div className={styles.toolDivider} />

      {/* (#405) Selects the grid tool; whether the grid is *drawn* is its
          own `show` setting in the column to the right, which is what lets
          it stay up under every other tool. Selecting it currently does
          nothing but put those settings on screen — the grid has no canvas
          gesture of its own until #406 gives it move and rotate. */}
      {toolOffered('grid') && (
        <button
          className={clsx(styles.toolIconBtn, tool === 'grid' && styles.toolIconBtnActive)}
          title={t('tool.gridTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleGrid) })}
          aria-label={t('tool.grid')}
          aria-pressed={tool === 'grid'}
          onClick={() => selectTool('grid')}
        ><Icon name="grid_on" /></button>
      )}
      </>)}
      {/* (#512) The hand, in the compact shell only — its full-layout twin
          is inside the block above. Here it is not a convenience but the
          answer to a gesture the shell took away: while an annotation tool
          is in hand the first finger draws, so one-finger panning is gone,
          and two fingers is a lot to ask for "move the page a bit". Picking
          up the hand gives the finger back to the canvas, because with no
          annotation tool selected nothing reserves it. */}
      {compact && toolOffered('hand') && (
        <button
          className={clsx(styles.toolIconBtn, tool === 'hand' && styles.toolIconBtnActive)}
          title={t('tool.hand')}
          aria-label={t('tool.hand')}
          aria-pressed={tool === 'hand'}
          onClick={() => selectTool('hand')}
        ><Icon name="pan_tool" /></button>
      )}
      {/* (#509/#510, эпик #87) The annotation tools. They used to sit at
          the bottom of the full toolbar, under the drawing tools, and read
          as three more brushes — which is the opposite of what they are.
          Now they are a mode: the rail shows these *or* the drawing tools,
          never both, and the header says which. */}
      {annotationRail && (<>
      <button
        className={clsx(styles.toolIconBtn, annotateTextActive && styles.toolIconBtnActive)}
        title={t('tool.annotateTitle')}
        aria-label={t('tool.annotateText')}
        aria-pressed={annotateTextActive}
        onClick={() => selectTool('annotateText')}
      ><Icon name="text_fields" /></button>
      <button
        className={clsx(styles.toolIconBtn, annotatePenActive && styles.toolIconBtnActive)}
        title={t('tool.annotatePenTitle')}
        aria-label={t('tool.annotatePen')}
        aria-pressed={annotatePenActive}
        onClick={() => selectTool('annotatePen')}
      ><Icon name="draw" /></button>
      <button
        className={clsx(styles.toolIconBtn, annotateEraserActive && styles.toolIconBtnActive)}
        title={t('tool.annotateEraserTitle')}
        aria-label={t('tool.annotateEraser')}
        aria-pressed={annotateEraserActive}
        onClick={() => selectTool('annotateEraser')}
      ><Icon name="ink_eraser" /></button>
      {/* Not a tool, so it sits below a divider and selects nothing. One
          operation for the whole set, so a single undo brings every remark
          back — which is also why it asks no confirmation. Absent while
          there is nothing to remove, like the header's hide toggle. */}
      {annotations.order.length > 0 && (<>
        <div className={styles.toolDivider} />
        <button
          className={styles.toolIconBtn}
          title={t('tool.annotationsClearTitle')}
          aria-label={t('tool.annotationsClear')}
          onClick={clearAllAnnotations}
        ><Icon name="delete_sweep" /></button>
      </>)}
      </>)}


    </aside>
  )
}
