import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HOTKEY_ACTIONS } from '../../lib/hotkeys'
import { useClipboardStore } from '../../stores/clipboardStore'
import { resetRoomStore, useRoomStore } from '../../stores/roomStore'
import { handleEditorKey, type EditorKeyContext } from './editorHotkeys'

/** (#493) The editor's keyboard, one press at a time. The order of the
 *  checks in handleEditorKey is the design — an open gesture owns Enter and
 *  Esc, the clipboard keys act only on something, the registry comes last —
 *  and until the routing moved out of Room's effect nothing tested it. */

const DEFAULTS = Object.fromEntries(HOTKEY_ACTIONS.map(a => [a.id, a.default]))

interface Press { key?: string; code?: string; ctrlKey?: boolean; shiftKey?: boolean }

function press(init: Press) {
  const e = {
    key: init.key ?? '', code: init.code ?? '',
    ctrlKey: !!init.ctrlKey, metaKey: false, shiftKey: !!init.shiftKey, altKey: false,
    preventDefault: vi.fn(),
  }
  return e
}

function setup(patch: Partial<EditorKeyContext> = {}) {
  const ctx: EditorKeyContext = {
    tool: 'pencil', drawingTool: 'pencil', hotkeys: DEFAULTS,
    isTransformOpen: () => false, transformAvailable: true,
    commitTransform: vi.fn(), resetTransform: vi.fn(),
    commitShape: vi.fn(), cancelShape: vi.fn(),
    finishSelection: vi.fn(), cancelLasso: vi.fn(), clearSelection: vi.fn(),
    copySelection: vi.fn(), cutSelection: vi.fn(), pasteClipboard: vi.fn(), deleteSelectionContents: vi.fn(),
    undo: vi.fn(), redo: vi.fn(), zoomBy: vi.fn(), resetZoom: vi.fn(), rotateView: vi.fn(),
    toggleTool: vi.fn(), setTool: vi.fn(),
    setToolSetting: useRoomStore.getState().setToolSetting,
    ...patch,
  }
  const send = (init: Press) => {
    const e = press(init)
    handleEditorKey(e as unknown as KeyboardEvent, ctx)
    return e
  }
  return { ctx, send }
}

const SQUARE = { points: [0, 0, 10, 0, 10, 10, 0, 10] }

beforeEach(() => {
  resetRoomStore()
  useClipboardStore.getState().setMeta(null)
})

describe('Enter and Esc belong to whatever gesture is open', () => {
  it('an open transform session first — ahead of a shape and a lasso', () => {
    useRoomStore.getState().setShapeFrame({ x: 0, y: 0, width: 10, height: 10, angle: 0 })
    useRoomStore.getState().setPendingSelection([0, 0, 5, 5])
    const { ctx, send } = setup({ isTransformOpen: () => true })

    expect(send({ key: 'Enter' }).preventDefault).toHaveBeenCalled()
    send({ key: 'Escape' })
    expect(ctx.commitTransform).toHaveBeenCalledOnce()
    expect(ctx.resetTransform).toHaveBeenCalledOnce()
    expect(ctx.commitShape).not.toHaveBeenCalled()
    expect(ctx.finishSelection).not.toHaveBeenCalled()
  })

  it('then an open shape', () => {
    useRoomStore.getState().setShapeFrame({ x: 0, y: 0, width: 10, height: 10, angle: 0 })
    const { ctx, send } = setup()
    send({ key: 'Enter' })
    send({ key: 'Escape' })
    expect(ctx.commitShape).toHaveBeenCalledOnce()
    expect(ctx.cancelShape).toHaveBeenCalledOnce()
  })

  it('then an open lasso — Enter closes it with the points it has', () => {
    useRoomStore.getState().setPendingSelection([0, 0, 5, 5, 0, 5])
    const { ctx, send } = setup()
    send({ key: 'Enter' })
    expect(ctx.finishSelection).toHaveBeenCalledWith([0, 0, 5, 5, 0, 5])
    send({ key: 'Escape' })
    expect(ctx.cancelLasso).toHaveBeenCalledOnce()
    expect(ctx.clearSelection).not.toHaveBeenCalled()
  })

  it('Esc with nothing open puts a finished selection down', () => {
    useRoomStore.getState().setSelection(SQUARE)
    const { ctx, send } = setup()
    send({ key: 'Escape' })
    expect(ctx.clearSelection).toHaveBeenCalledOnce()
  })
})

describe('the clipboard keys act only on something', () => {
  it('Ctrl+C / Ctrl+X / Delete with a selection', () => {
    useRoomStore.getState().setSelection(SQUARE)
    const { ctx, send } = setup()
    send({ key: 'c', code: 'KeyC', ctrlKey: true })
    send({ key: 'x', code: 'KeyX', ctrlKey: true })
    send({ key: 'Delete' })
    expect(ctx.copySelection).toHaveBeenCalledOnce()
    expect(ctx.cutSelection).toHaveBeenCalledOnce()
    expect(ctx.deleteSelectionContents).toHaveBeenCalledOnce()
  })

  // A page-level copy (a room link, say) must never be swallowed by the canvas.
  it('are left to the page without one', () => {
    const { ctx, send } = setup()
    const copy = send({ key: 'c', code: 'KeyC', ctrlKey: true })
    send({ key: 'Delete' })
    expect(copy.preventDefault).not.toHaveBeenCalled()
    expect(ctx.copySelection).not.toHaveBeenCalled()
    expect(ctx.deleteSelectionContents).not.toHaveBeenCalled()
  })

  it('Ctrl+V only with something on the clipboard', () => {
    const { ctx, send } = setup()
    send({ key: 'v', code: 'KeyV', ctrlKey: true })
    expect(ctx.pasteClipboard).not.toHaveBeenCalled()
    useClipboardStore.getState().setMeta({ roomId: 'R', x: 0, y: 0, width: 1, height: 1, updatedAt: 0 })
    send({ key: 'v', code: 'KeyV', ctrlKey: true })
    expect(ctx.pasteClipboard).toHaveBeenCalledOnce()
  })
})

describe('the registry', () => {
  it('undo and redo, claimed from the browser', () => {
    const { ctx, send } = setup()
    expect(send({ key: 'z', code: 'KeyZ', ctrlKey: true }).preventDefault).toHaveBeenCalled()
    send({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })
    expect(ctx.undo).toHaveBeenCalledOnce()
    expect(ctx.redo).toHaveBeenCalledOnce()
  })

  // Not a flip of the setting from another tool — that would be a key that
  // appears to do nothing, since its switch is only on screen with the eraser.
  it('Shift+E from another tool takes the eraser with the mode on; with the eraser, flips it', () => {
    const first = setup()
    first.send({ key: 'E', code: 'KeyE', shiftKey: true })
    expect(first.ctx.setTool).toHaveBeenCalledWith('eraser')
    expect(useRoomStore.getState().toolSettings.eraser.throughLayers).toBe(true)

    const second = setup({ tool: 'eraser' })
    second.send({ key: 'E', code: 'KeyE', shiftKey: true })
    expect(useRoomStore.getState().toolSettings.eraser.throughLayers).toBe(false)
    expect(second.ctx.toggleTool).not.toHaveBeenCalled()
  })

  it('transform only with something to transform', () => {
    const none = setup({ transformAvailable: false })
    none.send({ key: 't', code: 'KeyT' })
    expect(none.ctx.toggleTool).not.toHaveBeenCalled()
    const some = setup()
    some.send({ key: 't', code: 'KeyT' })
    expect(some.ctx.toggleTool).toHaveBeenCalledWith('transform')
  })

  // The drawing tool, not the one in hand: with the ruler out there is no
  // size to step, and sizing the pencil you will go back to is the useful read.
  it('size steps the drawing tool behind the one in hand, clamped to its range', () => {
    useRoomStore.getState().setToolSetting('pencil', 'size', 1)
    const { send } = setup({ tool: 'ruler', drawingTool: 'pencil' })
    send({ key: '[', code: 'BracketLeft' })
    expect(useRoomStore.getState().toolSettings.pencil.size).toBe(1)
    send({ key: ']', code: 'BracketRight' })
    expect(useRoomStore.getState().toolSettings.pencil.size).toBe(2)
  })

  it('the liner steps its ladder instead of subtracting', () => {
    const before = useRoomStore.getState().toolSettings.liner.size
    const { send } = setup({ drawingTool: 'liner' })
    send({ key: ']', code: 'BracketRight' })
    const after = useRoomStore.getState().toolSettings.liner.size
    expect(typeof after).toBe('string')
    expect(after).not.toBe(before)
  })

  it('grades step along the ladder, and do nothing for a tool without one', () => {
    useRoomStore.getState().setToolSetting('pencil', 'grade', 'HB')
    const pencil = setup()
    pencil.send({ key: '.', code: 'Period' })
    expect(useRoomStore.getState().toolSettings.pencil.grade).not.toBe('HB')

    const before = useRoomStore.getState().toolSettings.charcoal
    const charcoal = setup({ drawingTool: 'charcoal' })
    charcoal.send({ key: '.', code: 'Period' })
    expect(useRoomStore.getState().toolSettings.charcoal).toEqual(before)
  })

  it('rotation turns the view and R puts it upright', () => {
    const { ctx, send } = setup()
    send({ key: '}', code: 'BracketRight', shiftKey: true })
    send({ key: 'r', code: 'KeyR' })
    expect(ctx.rotateView).toHaveBeenNthCalledWith(1, Math.PI / 12)
    expect(ctx.rotateView).toHaveBeenNthCalledWith(2, null)
  })
})
