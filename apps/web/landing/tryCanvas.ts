import { BACKGROUND_LAYER_ID, INITIAL_LAYER_ID, type LayerState, type ToolType } from '@grafetto/shared'

import {
  PencilEngine, charcoalPresetString, DEFAULT_CHARCOAL_TYPE, isCharcoalNib, isCharcoalType, watercolorPresetString,
} from '../src/engine'
import { computeCompositeOrder } from '../src/lib/layers/layers'
import {
  defaultToolSettings, getToolColor, isColorCapableTool, linerSizeToPx, type ToolSettingsMap, type UiToolId,
} from '../src/pages/Room/tools/toolSchemas'

/** (#246) The landing's try-it sheet: the real engine on the real paper, the
 *  tools picked by a button and nothing else to set. Loaded only when someone
 *  presses "Try it" — the engine and a paper texture are a few megabytes, and
 *  the page must stay light for everyone who just reads it.
 *
 *  It never talks to the server. No room, no socket, no /api: the identity
 *  cookie is set only once someone enters the app (#246 §2.2, #323), and a
 *  sheet that exists for a minute in one tab has nothing to save anyway.
 *
 *  Tool presets are each tool's schema defaults, assembled into the engine's
 *  preset string the same way Room does it (pages/Room/index.tsx, "sync tool →
 *  engine"). Only the tools offered here are covered. */

export type TryTool = Extract<ToolType, 'pencil' | 'charcoal' | 'liner' | 'brushPen' | 'marker' | 'watercolor' | 'eraser'>

export interface TryCanvas {
  setTool(tool: TryTool): void
  undo(): void
  clear(): void
}

/** The engine preset string for a tool at its default settings. */
function presetFor(tool: TryTool, s: ToolSettingsMap): string {
  switch (tool) {
    case 'liner': return s.liner.size as string
    case 'marker': return `${s.marker.nib as string}:${s.marker.size as number}`
    case 'charcoal': {
      const type = s.charcoal.type as string
      const nib = s.charcoal.nib as string
      return charcoalPresetString(
        isCharcoalType(type) ? type : DEFAULT_CHARCOAL_TYPE,
        isCharcoalNib(nib) ? nib : undefined,
      )
    }
    case 'brushPen': return s.brushPen.pressureResponse as string
    case 'watercolor': return watercolorPresetString(
      'normal', { water: s.watercolor.water as number, pigment: s.watercolor.pigment as number },
    )
    default: return s.pencil.grade as string
  }
}

function sizeFor(tool: TryTool, s: ToolSettingsMap): number {
  return tool === 'liner' ? linerSizeToPx(s.liner.size as string) : (s[tool as UiToolId].size as number)
}

export function mountTryCanvas(canvas: HTMLCanvasElement): { canvas: TryCanvas; ready: Promise<void> } {
  // The sheet is sized once, from the box it is shown in. The page can be
  // resized afterwards and the canvas just scales with CSS; the engine's
  // pointer transform reads the on-screen rect, so strokes still land under
  // the pen. Capped so a 4K screen doesn't allocate a poster-sized sheet.
  const rect = canvas.getBoundingClientRect()
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.min(Math.round(rect.width * scale), 2400)
  const height = Math.round(width * (rect.height / rect.width))
  canvas.width = width
  canvas.height = height

  const settings = defaultToolSettings()
  const engine = new PencilEngine(canvas, {
    pageWidth: width,
    pageHeight: height,
    paper: 'medium',
    pencilType: presetFor('pencil', settings),
    size: sizeFor('pencil', settings),
  })

  const layers: LayerState = {
    items: {
      [BACKGROUND_LAYER_ID]: { kind: 'layer', id: BACKGROUND_LAYER_ID, name: 'Background', opacity: 1, visible: true },
      [INITIAL_LAYER_ID]: { kind: 'layer', id: INITIAL_LAYER_ID, name: 'Layer 1', opacity: 1, visible: true },
    },
    rootOrder: [INITIAL_LAYER_ID, BACKGROUND_LAYER_ID],
    activeId: INITIAL_LAYER_ID,
    selectedIds: [],
  }
  engine.initLayer(BACKGROUND_LAYER_ID)
  engine.initLayer(INITIAL_LAYER_ID)
  engine.setActiveLayer(INITIAL_LAYER_ID)
  engine.setCompositeOrder(computeCompositeOrder(layers))
  engine.resizeCanvas(width, height)
  // The whole sheet on screen, unrotated: world pixels are canvas pixels.
  engine.setInfiniteCamera(width / 2, height / 2, 1, 0)

  // The page scrolls under a canvas that keeps its size; see
  // invalidateCanvasRect on why the engine can't notice that by itself.
  const onMove = (): void => engine.invalidateCanvasRect()
  window.addEventListener('scroll', onMove, { passive: true })
  window.addEventListener('resize', onMove)

  const apply = (tool: TryTool): void => {
    engine.setTool(tool)
    engine.setPencil(presetFor(tool, settings))
    engine.setSize(sizeFor(tool, settings))
    engine.setOpacity((settings[tool as UiToolId].opacity as number | undefined) ?? 1)
    // The eraser has no colour of its own; the engine keeps whatever the
    // last drawing tool set, which is what the next stroke will use.
    if (isColorCapableTool(tool)) engine.setColor(getToolColor(settings, tool))
  }
  apply('pencil')

  return {
    canvas: {
      setTool: apply,
      undo: () => { engine.undo() },
      clear: () => { engine.clear() },
    },
    ready: engine.paperReady(),
  }
}
