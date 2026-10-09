import {watercolorReviewSettings} from './diagnostics/watercolorReviewSettings'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import clsx from 'clsx'
import type {
  Operation,
  ClientToServerEvents, ServerToClientEvents,
} from '@grafetto/shared'
import { BACKGROUND_LAYER_ID } from '@grafetto/shared'
import {
  PencilEngine, type PencilEngineAPI, type PencilGradeName, WATERCOLOR_MIX_BY_PRESET, isWatercolorMixPreset, type AreaImage,
} from '../../engine'
import { FilterPanel } from '../../components/FilterPanel'
import { ColorFlyout } from '../../components/ColorFlyout'
import { ClassChrome } from './panels/ClassChrome'
import { SettingsPanel } from '../../components/SettingsPanel'
import { FloatingToolPanel, type PanelFlyout } from '../../components/FloatingToolPanel'
import { exposeEngineForDev, exposeMaterialReadinessForDev } from './diagnostics/devEngineHandle'
import { watercolorQaOptions } from './diagnostics/watercolorQaOptions'
import {
  eraseThroughTargets, isLayerLocked,
} from '../../lib/layers/layers'
import { hexToRgb } from '../../lib/browser/color'
import { floatingPanelVisible } from '../../lib/browser/uiPreferences'
import { diagLog } from '../../lib/observability/diagLog'
import { formatHotkeyLabel } from '../../lib/input/hotkeys'
import { useAuth } from '../../lib/api/authState'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewport } from './viewport/useViewport'
import { useViewportToast } from './viewport/useViewportToast'
import { useCommittableSession } from './shapes/useCommittableSession'
import { useShapeTool } from './shapes/useShapeTool'
import { useRulerTool } from './useRulerTool'
import { useFillTool } from './useFillTool'
import { useEyedropper } from './useEyedropper'
import { useEditorHotkeys } from './tools/editorHotkeys'
import { useTransformGizmoGestures } from './useTransformGizmoGestures'
import { createEngineNetworkCallbacks } from './engineNetwork'
import type { CreatorNavState } from './net/joinFlow'
import { toRoomConfig } from './net/roomConfig'
import { useOperationDispatch } from './useOperationDispatch'
import { useJoinGate } from './useJoinGate'
import { useCopyRoomEntry } from './useCopyRoomEntry'
import { usePaperReadiness } from './usePaperReadiness'
import { useOpenTimer } from './useOpenTimer'
import { useLeaveGuard } from './useLeaveGuard'
import { useToolSync } from './useToolSync'
import { useToolColor } from './useToolColor'
import { useToolChoice } from './useToolChoice'
import { useZoomControls } from './useZoomControls'
import { useRemoteOperations } from './useRemoteOperations'
import { useSnapshotPublishing } from './useSnapshotPublishing'
import { useLivePreviewBake } from './useLivePreviewBake'
import { useLostWork } from './useLostWork'
import { useBoardOutbox } from './useBoardOutbox'
import { useBoardStream } from './useBoardStream'
import { useEngineDevOptions } from './useEngineDevOptions'
import { useMinimalUi } from './useMinimalUi'
import { useLessonActions } from './useLessonActions'
import { useBoardActions } from './useBoardActions'
import { useClassView } from './useClassView'
import { useServerClockSync } from './net/useServerClockSync'
import { useLogDerivedState } from './useLogDerivedState'
import { useTrueOrder } from './useTrueOrder'
import { useSelection } from './useSelection'
import { DebugStack } from './panels/DebugStack'
import { usePencilSound } from './usePencilSound'
import { useCanvasViewport } from './useCanvasViewport'
import { useReviewImage } from './useReviewImage'
import { useAnnotations } from './useAnnotations'
import { useCursorBroadcast } from './useCursorBroadcast'
import { useLayerStateSync } from './useLayerStateSync'
import { useFilterTarget } from './useFilterTarget'
import { useLayerPanelBridge } from './useLayerPanelBridge'
import { useSpaceToPan } from './useSpaceToPan'
import { useDrawingActivity } from './useDrawingActivity'
import { CopyRoomGate, RoomLoadingOverlay } from './status/RoomLoadingOverlay'
import { OfflineRoomOverlay } from './status/OfflineRoomOverlay'
import { PaperFailedOverlay } from './status/PaperFailedOverlay'
import { RestoreFailedOverlay, type RestoreFailureReason } from './status/RestoreFailedOverlay'
import { notOpenScreen, useOfflineGrace } from './status/notOpenScreen'
import { RoomNotices } from './status/RoomNotices'
import { CanvasCatchers } from './editing/CanvasCatchers'
import { RoomHeader } from './panels/RoomHeader'
import { ToolRail } from './panels/ToolRail'
import { QuickSettingsBar } from './panels/QuickSettingsBar'
import { resolveDisplayName } from './participants/displayName'
import { cameraTransformCss } from './viewport/cameraMath'
import { connectRoomSocket } from './net/roomSocket'
import { useCursor, type ViewportCursor } from './overlays/cursorController'
import { CanvasOverlays } from './overlays/CanvasOverlays'
import { useCompactLayout } from './useCompactLayout'
import { useNarrowHeader } from '../../lib/input/useNarrowHeader'
import { RoomSidePanel } from './panels/RoomSidePanel'
import { useJoinQueue } from './net/joinQueue'
import { JoinGate } from './status/JoinGate'
import { NoWebGL } from './status/NoWebGL'
import { probeWebGL } from '../../lib/browser/webgl'
import {
  loadToolSettings, saveToolSettings,
  isShapeTool,
} from '../../lib/tools/toolSchemas'
import { loadPanelPosition, type PanelPosition } from '../../components/FloatingToolPanel/panelPosition'
import { loadActiveLayerId, saveActiveLayerId } from './editing/activeLayer'
import { ChiselAngleDial } from './overlays/ChiselAngleDial'
import { reportInvariant } from '../../lib/observability/reportInvariant'
import { pressureMapOf } from '../../lib/input/pressureCalibration'
import { createSnapshotGate } from './net/snapshotGate'
import type { RoomStatePayload } from './restoreRoomState'
import { useRoomRestore } from './useRoomRestore'
import { useTransformSession, type TransformSession } from './useTransformSession'
import { initLayersFromStore, openParkedRoomState, releaseOnPageHide, retireEngine, wireLocalStrokeEvents } from './engineWiring'
import { useRoomStore, resetRoomStore, resetBoardState } from '../../stores/roomStore'
import { useT } from '../../i18n'
import { isHandActive } from '../../stores/slices/viewportSlice'
import { createReplayGate } from './replayGate'
import { GlLostOverlay, useGlContextLost } from './status/GlLostOverlay'
import { useWatercolorDevFlags } from './useWatercolorDevFlags'
import styles from './Room.module.css'
// (#393) The one place a ViewportCursor becomes a class name. The decision
// itself is cursorController's; this is only the CSS-Modules lookup, kept
// exhaustive by the Record so a new cursor value cannot ship without one.
const VIEWPORT_CURSOR_CLASS: Record<ViewportCursor, string> = {
  crosshair: styles.viewportCursorCrosshair,
  grab: styles.viewportCursorGrab,
  default: styles.viewportCursorDefault,
}

/** (#570) The route component. The editor below assumes a WebGL context is
 *  there for the taking — `new PencilEngine` throws otherwise, from a mount
 *  effect, and nothing between that throw and the root's unmount used to say
 *  a word. Asked once, here, before a single one of the editor's hooks runs:
 *  no socket is opened and no join is attempted for a browser that could not
 *  draw the answer anyway. The probe result is state, not a re-run per
 *  render — the reader gets a reload button, and a reload is the re-probe. */
export function Room() {
  const [webgl] = useState(() => probeWebGL())
  if (!webgl.ok) return <NoWebGL reason={webgl.reason} />
  return <RoomEditor />
}

function RoomEditor() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const t        = useT()
  // `t` changes identity when the reader switches language, and listing it as a
  // dependency of the socket effect would tear the connection down and rebuild
  // it on a language switch — so the socket's handlers read it through this.
  const tRef = useRef(t)
  tRef.current = t
  // (#380) Only for the access cache the join queue lives in — see joinQueue.ts.
  const queryClient = useQueryClient()
  // (#310) In-app replacements for the window.confirm/window.alert this
  // editor used to reach for. `alert` is renamed on the way in so a reader
  // can't mistake it for the global it replaces.

  // (#24) The store is a module-level singleton — reset it before anything
  // below reads a selector, so a genuine unmount+remount (e.g. via an
  // intermediate /create stop between two different rooms) never leaks a
  // previous room's stale data into this fresh mount. See resetRoomStore's
  // own doc comment.
  useState(() => resetRoomStore(new URLSearchParams(location.search).has('preview') ? id : undefined))

  // (#176, ADR 014 §4) Two keys where there used to be one. The socket lives
  // per *lesson* — one `io()` for the whole visit, kept across page turns —
  // and the engine, the outbox and the snapshot load live per *board*.
  //
  // `sessionId` is the socket's key: the URL id at mount, moving only when the
  // URL names a genuinely different lesson (taking a copy of a closed room
  // navigates in place — see takeRoomCopy). It deliberately does *not* move
  // when handleRoomState replaces a board id in the URL with its lesson's: the
  // socket is already in that lesson, and rebuilding it would re-join from
  // scratch for a change that is cosmetic.
  const [sessionId, setSessionId] = useState(id)
  useEffect(() => {
    if (!id || id === sessionId) return
    if (id === useRoomStore.getState().lessonId) return
    setSessionId(id)
  }, [id, sessionId])
  /** The lesson every lesson-level call is addressed to — access, rename,
   *  close, boards. Falls back to the URL id before the first `room_state`,
   *  which is the lesson unless the link was a board's (then it is corrected
   *  the moment the server says so). */
  const lessonId = useRoomStore(s => s.lessonId) ?? id
  /** The board the engine holds — see roomSlice's own doc comment on when
   *  this moves. Null before the first `room_state`, so the engine effect
   *  below has nothing to build for until the server has seated us. */
  const boardId = useRoomStore(s => s.boardId)
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  /** A page turn in flight: the board we asked the server for and whose
   *  `room_state` has not arrived yet. Cleared by that arrival (or by a
   *  refusal). A second turn while one is pending simply replaces this, and
   *  the state for the board no longer wanted is ignored on arrival. */
  const wantedBoardRef = useRef<string | null>(null)
  /** The board the *server* currently has this socket on — as far as this
   *  client has been told. Set by every `room_state`, cleared the moment a
   *  `join_room` for another board is emitted. The outbox's send gate reads
   *  it: an operation may only leave for the board it was drawn on. */
  const socketBoardRef = useRef<string | null>(null)
  /** Published by the socket effect (it needs that effect's own socket and
   *  credentials) for the strip, the chip and the follow logic to call. */
  const switchBoardRef = useRef<((next: string) => void) | null>(null)

  // Captured once, at mount: CreateRoom hands the freshly-created room's
  // config off via navigation state. A second device opening the same room
  // link has no such state — that's the "joiner" branch, gated behind the
  // join-gate form below until a successful join_room tells us who we are.
  const [creatorDraft] = useState<CreatorNavState | undefined>(() => location.state as CreatorNavState | undefined)
  const isCreator = !!creatorDraft?.room
  // (#176) True until the creator's seeded board has had its first
  // `room_state` — the one case where the state for a board arrives with that
  // board's engine already built. See handleRoomState.
  const awaitingSeededBoardStateRef = useRef(isCreator)
  // Blocks pointer input on the canvas (see its style prop below) while a
  // join/reconnect's initial content restore is still in flight — a real
  // bug, not defensive: with #169's snapshot fast-join, that restore
  // includes an awaited network fetch (restoreLatestSnapshot), which — unlike
  // the old always-synchronous full-log replay loop — actually yields to
  // the event loop for a real, human-noticeable stretch (seconds). A stroke
  // drawn in that window paints onto a layer whose buffer
  // restoreLayerFromSnapshot then unconditionally overwrites wholesale with
  // the snapshot's own (older) pixels — silently wiping the stroke on this
  // client, while the operation itself still gets recorded server-side
  // (invisible until a later reconnect/backfill surfaces it, which is
  // exactly the "мерцает первый вариант потом перезатёртый" symptom).
  // Always starts blocked, creator included — a creator's own tab reloading
  // an already-drawn-on room looks identical, at mount time, to a genuinely
  // brand-new room (see handleRoomState's own doc comment on this exact
  // ambiguity); only handleRoomState's first room_state can actually tell
  // the two apart, so it alone gets to decide when this flips true, whether
  // that's "nothing to restore" (a real new room, decided quickly) or after
  // a full restore/replay (a reload). Optimistically starting `true` for
  // every creator used to mean the editor opened immediately, empty and
  // interactive, with the preloader only flashing on *afterward* if a
  // restore turned out to be needed — backwards from "preloader first, then
  // ready to draw." A joiner already started blocked the same way, via the
  // mount-engine effect's own replay / handleRoomState's reconnect branch.
  const [roomContentReady, setRoomContentReady] = useState(false)
  // (#429) Mirrored for the socket effect's live-stroke handler, which is
  // wired once per connection and must see the current value rather than
  // whatever it was when the listener was attached.
  const replayGateRef = useRef(createReplayGate<{ seq: number; operation: Operation }>())
  const roomContentReadyRef = useRef(roomContentReady)
  roomContentReadyRef.current = roomContentReady
  useEffect(() => {
    diagLog('roomContentReady changed to', roomContentReady)
  }, [roomContentReady])

  /** (#533) The room's stored pixels did not arrive, so this catch-up restored
   *  nothing. Same conclusion as `paperFailed` and for a stricter reason: the
   *  server withholds the history a snapshot claims to cover, so there is no
   *  second source for those pixels — a room opened in this state is not
   *  "missing the last few strokes", it is blank where a lesson should be. It
   *  stayed blank and unexplained for twenty minutes on 2026-09-04, which is
   *  what this flag is for. See RestoreFailedOverlay.
   *
   *  (#538) A reason rather than a boolean, and null rather than false: the
   *  same screen now also covers a restore whose pixels *did* arrive and threw
   *  on the way to the canvas, and the two get different sentences. One piece
   *  of state, not a flag plus a variant beside it — those can disagree, and
   *  the disagreement would be a screen explaining the wrong failure. */
  const [restoreFailure, setRestoreFailure] = useState<RestoreFailureReason | null>(null)

  // (#493) The developer switches the engine is built with and the readouts
  // they report into — see useEngineDevOptions.
  const {
    engineDevOptions, debugEnabled, strokeStats, hapticGrainEnabled, hapticStats, pencilSoundTuningEnabled,
  } = useEngineDevOptions()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // The editor root — the stroke-active attribute goes on it, and the panels
  // measure against it. What goes fullscreen is `document.documentElement`,
  // not this — see RoomHeader's toggleFullscreen for why (#357).
  const editorRef = useRef<HTMLDivElement>(null)

  // (#157/#321) Where the floating tool cluster is allowed to appear, and the
  // device it is judged for.
  const floatingPanelMode = useSettingsStore(s => s.floatingPanel)
  const deviceType = useSettingsStore(s => s.deviceType)

  // #94's "a resting hand mid-stroke corrupts settings" guard used to be a
  // `useState` here, on the theory that two flips per stroke are too cheap to
  // matter. On a Tab S7+ they were not: #309 measured a median 55 ms (worst
  // 99 ms) from pen-down to the UI reacting, plus a 60–85 ms dropped frame at
  // every stroke start, all of it Room re-rendering its whole tree twice per
  // stroke to change `pointer-events` on four wrappers. It now lives in the
  // store as `strokeActive` (see strokeSlice for the full rule) and reaches
  // the DOM without a render at all — see the projection effect below.

  // (#24) Backed by the store now — same one-shot seeding timing the old
  // useState(() => creatorDraft?.room ? toRoomConfig(...) : null) had.
  useState(() => {
    if (creatorDraft?.room) {
      // The mode is a sibling of `room` in the navigation state, not a field
      // of it (it rides on `create_room` itself, see CreatorNavState) — so it
      // is folded in here rather than being read off the draft room.
      useRoomStore.setState({
        room: toRoomConfig({ ...creatorDraft.room, accessMode: creatorDraft.accessMode }),
        // (#176) A room just created is a lesson with one board, and the
        // creator is on it: known synchronously for the same reason `room`
        // is. Its first `room_state` then arrives for this very board.
        lessonId: creatorDraft.room.id,
        boardId: creatorDraft.room.id,
        boards: [{ id: creatorDraft.room.id, name: creatorDraft.room.name, order: 0 }],
        // (#595) Picked on the create form; room_state confirms it shortly.
        classVisibility: creatorDraft.room.classVisibility ?? 'teacher_only',
      })
    }
  })
  const config = useRoomStore(s => s.room)
  // (#548) Which tools this room offers — `undefined` for all of them, which
  // is what every room says until someone restricts it. Read straight off the
  // room rather than mirrored into a field of its own: it arrives inside
  // `room_state` and is patched by `room_tools_changed`, and a second copy
  // would only be a second thing to keep in step.
  const enabledTools = useRoomStore(s => s.room?.enabledTools)
  // (#493) The toolset gate, every way a tool gets into a hand, and the two
  // groups the rail and the floating panel show — see useToolChoice.
  const {
    toolOffered, selectTool, selectGroupMember, toggleTool, drawingGroupOptions, drawingGroupTool,
    drawingGroupActive, shapeKind, shapeKindOptions, panelGroups, floatingSlotTool,
  } = useToolChoice(id)
  // (#405) The one selected tool — a drawing tool, or one of the four that
  // paint nothing (eyedropper, ruler, transform, grid). Exactly one at a time:
  // there is no second "mode" axis over it any more.
  const tool = useRoomStore(s => s.tool)
  const setTool = useRoomStore(s => s.setTool)
  // (#405) The drawing tool the engine, the brush cursor and the sound are
  // configured from — `tool` itself while a drawing tool is selected, the last
  // one selected otherwise, so picking up the ruler never leaves the engine
  // holding a tool that isn't one. Also where the eyedropper goes back to.
  const drawingTool = useRoomStore(s => s.drawingTool)
  // Unified per-tool settings (#196) — grade/size/opacity/color for every
  // registered tool (TOOL_SCHEMAS in toolSchemas.ts), persisted per room
  // (#156). Backed by the store (#23): seeded once up front from this
  // room's localStorage — same one-shot timing the old
  // `useState(() => loadToolSettings(...))` had (id is stable for the
  // component's lifetime; a room switch remounts it), just done as a side
  // effect inside a throwaway useState initializer so it still runs
  // synchronously during the first render, before initialToolRef below
  // reads the store. Color used to be its own top-level `color` state
  // shared by whatever tool happened to be active; it now lives at
  // `toolSettings.pencil.color` — the schema's per-tool slot — same value,
  // same behavior, just no longer a second parallel place settings live.
  useState(() => {
    const review = watercolorReviewSettings(loadToolSettings(localStorage, id ?? ''), location.search, import.meta.env.DEV)
    useRoomStore.setState({ toolSettings: review.settings })
    if (review.enabled) useRoomStore.getState().setTool('watercolor')
  })
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  // Floating tool panel's dragged-to position (#157) — same load-once-up-
  // front pattern as toolSettings above; null until the panel's
  // ever been dragged in this room, in which case it renders at its
  // CSS-anchored default corner instead (see FloatingToolPanel).
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(
    () => loadPanelPosition(localStorage, id ?? ''),
  )
  // Which of that panel's two fans — the palette, or the drawing tools its top
  // slot can hold — is out, if either. Lives here rather than inside
  // FloatingToolPanel because ChiselAngleDial, a sibling orbiting the same
  // panel at nearly the same radius, has to stand down while one of them is
  // open; see that component's own doc comment.
  const [panelFlyout, setPanelFlyout] = useState<PanelFlyout | null>(null)
  // Desktop keyboard shortcuts (#174) — global (per-browser, not per-room): a
  // rebound key is a habit of whoever's typing, not a property of this
  // drawing. A store subscription rather than a load-once-at-mount read
  // (#321): the settings panel applies a rebind immediately now, so this has
  // to see it without the page reload that used to carry it.
  const hotkeys = useSettingsStore(s => s.hotkeys)
  const gradeHotkeyLabels = ['gradeHarder', 'gradeSofter']
    .map(id => formatHotkeyLabel(hotkeys[id])).join('/')
  // (#405) The four non-painting tools, as plain "is this the selection?"
  // reads. They used to be an `OverlayMode` union in a slice of their own —
  // modes laid *on top of* whichever drawing tool was selected (#393) — which
  // is why two things could be "current" at once and why the cursor could
  // never be answered from `tool`. None of them may become a recorded
  // ToolType: three paint nothing at all, and transform produces an operation
  // of its own kind (layer_transform) via the engine's live preview +
  // dispatchOp rather than through engine.setTool(); see toolSlice.
  const eyedropperActive = tool === 'eyedropper'
  const transformActive = tool === 'transform'
  // (#446) The selection tool. Unlike the four above it leaves something
  // behind that outlives having it in hand: the selection itself, which the
  // transform tool then operates through and which cut/copy/paste act on. So
  // "is it selected" and "is there a selection" are two different questions
  // here, and both get asked below.
  const selectionActive = tool === 'selection'
  // (#509/#510, эпик #87) The two annotation tools. Both stay in hand after a
  // gesture like the fill does — remarks come in groups, one per thing worth
  // saying — and neither ever touches a layer: what they produce lives in the
  // annotation overlay, above the composite.
  const annotateTextActive = tool === 'annotateText'
  const annotatePenActive = tool === 'annotatePen'
  const annotateEraserActive = tool === 'annotateEraser'
  const annotationMode = useRoomStore(s => s.annotationMode)
  const annotateActive = annotateTextActive || annotatePenActive || annotateEraserActive
  // What the tool in hand may pick up — see AnnotationOverlay's `hitTargets`.
  // The pen picks up nothing, the note tool everything but ink (so a remark can
  // be pinned on top of a mark), the eraser everything.
  const annotationHitTargets = annotateEraserActive ? 'all' : annotateTextActive ? 'notes' : 'none'
  // (#512) The compact shell: a phone gets annotations and nothing else. Live,
  // not measured once — see useCompactLayout.
  const compact = useCompactLayout()
  // (#575) Below 1200px the header packs tighter: the "g" instead of the
  // wordmark, the save status as a dot, and the mode toggles (annotations,
  // boards) folded into the ≡ menu as checkable items.
  const narrowHeader = useNarrowHeader()
  /** (#509 v4) Whether the left rail is showing annotation tools instead of
   *  drawing ones. Two routes in and they are deliberately different things:
   *  the compact shell *is* this and cannot leave it, while the full layout
   *  enters and leaves it through the header's own toggle. */
  const annotationRail = compact || annotationMode
  // Finger-drawing is switched on by the compact shell and by nothing else.
  // On a tablet a finger still pans, so the annotation tools stay pen-and-mouse
  // there exactly like the fill and the selection — which is what keeps the
  // most-used gesture contract in the app from changing for a feature that did
  // not need it to. Where the finger *does* draw, two-finger pan follows
  // automatically rather than as a second setting: see toolActiveRef below.
  const annotateWithFinger = compact && annotateActive
  // The session itself. Authoritative (the store copy exists to drive
  // rendering), and a ref rather than state so the drag handlers don't have to
  // list a value that changes on every animation frame among their deps.
  // `matrix` accumulates gestures; `targetIds` is frozen for the session so a
  // selection change ends it rather than silently re-aiming it mid-flight.
  const transformSessionRef = useRef<TransformSession | null>(null)
  // (#446) Handed to the next session the effect opens — the one moment a
  // session is created with pixels of its own rather than from a layer. Room
  // sets it, selects the transform tool, and the ordinary session-opening path
  // picks it up, so a floating paste needs no second lifecycle beside the one
  // that already handles Enter, Esc, tool changes, layer changes and the page
  // going away.
  const pendingPasteRef = useRef<AreaImage | null>(null)
  // (#446) The selection (selectionSlice.ts) — local to this participant: a
  // selection is what someone is about to do, and only what they did travels.
  const selection = useRoomStore(s => s.selection)
  const setSelection = useRoomStore(s => s.setSelection)
  const setPendingSelection = useRoomStore(s => s.setPendingSelection)
  // (#399) Throws the open session's uncommitted gestures away and re-opens an
  // empty one on whatever the layer holds now. Assigned further down, where
  // the pieces it needs exist; declared here because undo/redo — defined well
  // above those — is what calls it.
  //
  // Two callers, two readings of the same operation:
  //  - *after* a real undo/redo, to re-derive the gizmo's bounds from pixels
  //    the log just changed underneath it;
  //  - as the cancel itself (#405): Esc, and Ctrl+Z while a session carries
  //    gestures, both mean "throw away what I was just doing". Nothing was
  //    committed, so there is no undo entry to leave behind — discarding *is*
  //    the whole of the undo.
  const resetTransformSessionRef = useRef<() => void>(() => {})
  // (#395/#399) A committed transform session whose operation hasn't reached
  // the layer yet, and the teardown that's waiting on it.
  //
  // Only the optimistic dispatch path paints a layer_transform locally, and
  // it covers just this client's own not-yet-confirmed layers (see
  // isLocalIslandSafe). For every other layer — i.e. any real drawing — the
  // op is sent and only lands when operation_confirmed comes back, a full
  // server round trip later. Dropping the gizmo preview at pointerup
  // therefore left the content sitting at its pre-drag position for that
  // whole trip, which is exactly what "слой прыгает на исходную позицию"
  // was. The preview is now held until the transform is genuinely resolved:
  // applied (applyRemoteOp), refused by the server (Outbox onSettled), or
  // given up on by the queue (onStalled) — whichever happens first.
  const pendingTransformCommitRef = useRef<{ opId: string; finish: () => void } | null>(null)
  const resolveTransformCommit = useCallback((opId: string) => {
    const pending = pendingTransformCommitRef.current
    if (!pending || pending.opId !== opId) return
    pendingTransformCommitRef.current = null
    pending.finish()
  }, [])
  // (#21) Backed by the store now — layerState is still a *derived cache*
  // of the engine's operation log (ADR 002), never independently mutable
  // content state; see syncFromLog below and roomStore's layerSlice.
  const layerState = useRoomStore(s => s.layerState)
  // (#506) The one field of that cache which is *not* derived from the log:
  // `activeId` is per-user view state, so a reload has nothing to rebuild it
  // from and every room used to open on its top layer regardless of what the
  // user was working on. Seeded here from this device's storage, in a
  // throwaway useState initializer so it lands during the first render —
  // before the join replay, which is the point: `overlayLocalFields` carries
  // `activeId` from the *current* state onto each freshly replayed one, so
  // the seeded id survives the replay the same way a mid-session selection
  // survives a peer's stroke.
  //
  // A stored id whose layer is gone (deleted, or never in this room) needs no
  // handling of its own: until the replay it selects nothing — the layer-state
  // → engine sync below reads `isEffectivelyVisible` as false and locks the
  // engine, so it cannot take a stroke — and the replay's `sanitizeSelection`
  // then drops it back to the top non-background layer, which is exactly the
  // behavior that existed before this was stored at all.
  useState(() => {
    const storedActiveId = loadActiveLayerId(localStorage, id ?? '')
    if (storedActiveId) useRoomStore.setState(prev => ({ layerState: { ...prev.layerState, activeId: storedActiveId } }))
  })
  // (#542) 'color' is back in this list, but it is no longer a tab with its own
  // contents — it renders the very same body the colour popover does.
  const [activePanel, setActivePanel] = useState<'layers' | 'color' | 'participants' | 'toolSettings' | null>('layers')

  // ── realtime state (#84/#37/#38) ────────────────────────────────────────────
  const [connected,   setConnected]   = useState(false)
  // Whether the socket has ever completed a connection on this mount. The
  // distinction `connected` alone cannot make: "still opening" and "was open,
  // dropped" both read as false, and only the second is worth warning about
  // (see ConnectionBanner, which is what this is for). Latches once true — a
  // later drop is a drop, not a return to the opening state.
  const [everConnected, setEverConnected] = useState(false)
  // (#346) Same shape, same reason: `requestFullResync` is defined inside the
  // socket-wiring effect (it needs that effect's own `socket`), and the paper
  // retry below — a UI callback with no socket of its own — is what has to
  // call it.
  const requestFullResyncRef = useRef<(() => void) | null>(null)
  // (#24) Backed by the store now — applyParticipantAction still just
  // folds each socket event through the same pure participantsReducer
  // (participants.ts), reused unchanged.
  const participants = useRoomStore(s => s.participants)
  const dispatchParticipants = useRoomStore(s => s.applyParticipantAction)
  // (#254 epic) `userId` is normally read only non-reactively via getState()
  // at "moment of action" call sites (see its own doc comment on
  // roomSlice.ts) — this is the one legitimate exception: owner-only UI
  // (the freeze toggle, the ownerLocked control) and the frozen-self banner
  // both need to know, on every render, who "I" am relative to the live
  // `participants` list below.
  const myUserId = useRoomStore(s => s.userId)
  const myParticipant = participants.find(p => p.userId === myUserId)
  const isOwner = myParticipant?.role === 'owner'
  // (#518) `dispatchOp` has to ask "may I paint here" at the moment of
  // action, and the owner lock makes that question depend on who is asking.
  // Through a ref so the answer can change without rebuilding `dispatchOp` —
  // half the page depends on its identity, and a role that arrives with the
  // participant list would otherwise re-key all of it.
  const isOwnerRef = useRef(isOwner)
  isOwnerRef.current = isOwner

  // (#493) Who is drawing right now — the timestamps, both ways they are
  // written, and the interval that turns them into a list. See
  // useDrawingActivity.
  const {
    drawingIds, markActive, markLayerActive, forget: forgetDrawingActivity, reset: resetDrawingActivity,
  } = useDrawingActivity()
  // (#380) Who is knocking. Owner-only (the hook fetches nothing otherwise),
  // read here rather than inside ParticipantsPanel because the SidePanel tab's
  // badge needs the same count while that panel is collapsed.
  const joinQueue = useJoinQueue(lessonId, isOwner)
  // (#328) What this user is called in the room — their account name if they
  // have one, otherwise the per-device guest name (see resolveDisplayName).
  // `me` is prefetched before the app tree mounts (main.tsx), so this is
  // already the final answer on the first render rather than a guest name that
  // later flips. Mirrored into a ref because the socket effect below emits
  // create_room/join_room and must not re-subscribe when the auth query
  // settles.
  const { me } = useAuth()
  const myDisplayName = resolveDisplayName(me, localStorage)
  const myDisplayNameRef = useRef(myDisplayName)
  myDisplayNameRef.current = myDisplayName
  // Room-wide freeze (#256) OR this participant's own point freeze (#257) —
  // independent mechanisms, either one alone is enough to block input. The
  // owner is structurally exempt from both (see rooms.ts's
  // isOperationAllowed/setParticipantFrozen), so this only ever gates
  // non-owners, matching the server's own enforcement exactly — this is a
  // client-side UX gate, not a security boundary (see dispatchOp/handleUndo/
  // handleRedo below and the canvas's own pointerEvents for where it's
  // actually applied).
  const roomFrozen = useRoomStore(s => s.roomFrozen)
  const isBlockedByFreeze = !isOwner && (roomFrozen || !!myParticipant?.frozen)

  // ── boards and class mode (#176, #595) ─────────────────────────────────
  // Hoisted from the engine refs below: both hooks send over it, and a ref
  // named in a hook's arguments has to exist before the hook is called.
  const socketRef        = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  // The store's own facts about the lesson, read where the markup uses them.
  const knownLessonId = useRoomStore(s => s.lessonId)
  const classVisibility = useRoomStore(s => s.classVisibility)
  // (#493) The strip's page turns and edits — see useBoardActions.
  const boardActions = useBoardActions({ socketRef, switchBoardRef, isOwnerRef })
  const { boardsOpen, setBoardsOpen, selectBoard } = boardActions
  // (#493) Where each board goes on screen, and the class-mode requests — see
  // useClassView.
  const classView = useClassView({
    socketRef, switchBoardRef, isOwnerRef, selectBoard, boardId, participants, myUserId, isOwner, compact,
  })
  const {
    onPersonalBoard, readOnlyBoard, myHandRaised, bakesPreviewHere, stripAvailable, setHandRaised, setClassVisibility,
  } = classView
  // (#432) The latency meter's clock — see useServerClockSync.
  useServerClockSync(socketRef, connected)
  // (#222) Closed for editing — the lesson has been handed out and stopped
  // changing. Deliberately *not* `!isOwner`: the server binds the owner too
  // (see getOperationRejectReason in rooms.ts), and a client gate that let
  // them draw anyway would produce exactly the "drawing into the void" the
  // freeze gate below exists to prevent.
  const roomClosed = useRoomStore(s => s.room?.closedAt !== undefined)
  // Everything that would write to the room goes through this one condition.
  // (#595) A classmate's work opened to look at is closed to this pen too.
  const editingBlocked = isBlockedByFreeze || roomClosed || readOnlyBoard
  const [filterLayerId, setFilterLayerId] = useFilterTarget(editingBlocked, compact)
  // (#429) Mirrored into a ref because the engine's own callbacks are wired
  // once, when the engine is constructed, and would otherwise close over
  // whatever this was at mount — a freeze arriving mid-lesson would never
  // reach them. Every other reader of `editingBlocked` is inside a hook with
  // it in the dependency list and needs no such mirror.
  const editingBlockedRef = useRef(editingBlocked)
  editingBlockedRef.current = editingBlocked
  // (#152) Cursor *positions* used to live here (setPeerCursors on every
  // incoming peer_cursor packet — up to ~30Hz per peer, summed across
  // however many peers are moving a pointer at once, all landing on this
  // ~1600-line component and reconciling its whole tree). PeerCursors now
  // owns that state itself, subscribing to the socket directly (see its own
  // component) — Room only needs to hand it the socket and participants.

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const engineRef     = useRef<PencilEngineAPI | null>(null)
  // Bumped once per engine construction, and depended on by every effect that
  // pushes a setting into the engine.
  //
  // Those effects were written as "run when the setting changes", which is
  // only half of what they need: the engine is built by an effect that returns
  // early until the paper and the canvas element are both there (see "mount
  // engine" below), so on a fresh room it does not exist yet when they first
  // run. `engineRef.current?.` swallows that, and a setting nobody touches
  // afterwards is then never pushed at all — the engine keeps its own
  // constructor default forever.
  //
  // That is not hypothetical. The pencil has shipped with tiltResponse
  // 'restrained' since 18.08 (toolSchemas.ts) while the engine's own default is
  // 'smooth', and every stroke drawn on an untouched device came out 'smooth':
  // measured live (store said 'restrained', `__engine._tiltResponse` said
  // 'smooth'), and confirmed against real strokes in three rooms — the one
  // device that drew 'restrained' was the one where the control had been
  // touched by hand, which is exactly the shape this bug has.
  //
  // #475 met the same trap for the pen calibration and solved it locally, by
  // handing that one value over at construction. This is the general form of
  // the same fix, so the next setting added here inherits it instead of
  // rediscovering it.
  const [engineEpoch, setEngineEpoch] = useState(0)
  const glLost = useGlContextLost(canvasRef, engineEpoch) // (#536, §17.50) see GlLostOverlay
  const initialToolRef = useRef({
    pencil: toolSettings.pencil.grade as PencilGradeName,
    size: toolSettings.pencil.size as number,
    opacity: toolSettings.pencil.opacity as number,
    tool,
  })

  // (#24) userId lives in the store now (roomSlice) but is deliberately
  // never read reactively — it's only ever needed at "moment of action"
  // (e.g. stamping an operation), same non-reactive-ref-like usage as
  // before, just via useRoomStore.getState().userId instead of a ref.
  // Stamped by every create_room/join_room ack (#41) with the server's
  // cookie-resolved identity — stable across reconnects, unlike socket.id.
  const applyIdentity = useCallback((userId: string) => {
    useRoomStore.getState().setUserId(userId)
    engineRef.current?.setUserId(userId)
  }, [])
  // (#537) Own operations' place in the room's order, and the #480 counter.
  const { noteOperationSeq, resetLayerSeqs, confirmOwnOperation, discardOwnOperation, syncFromLogRef } = useTrueOrder({ engineRef })
  // (#148, #169, #386, #508) The store's layer state and annotations, derived
  // from the engine's log — coalesced per burst, or now — see
  // useLogDerivedState.
  const { restoredLayerStateRef, syncFromLog, syncFromLogNow } = useLogDerivedState({ engineRef })
  syncFromLogRef.current = syncFromLog
  // (#289 §17, #312) Work the server refused as `target_gone`, brought back on
  // fresh layers and reported — see useLostWork.
  const { lostWork, setLostWork, scheduleLostWorkRecovery, resetLostWork } =
    useLostWork({ engineRef, restoredLayerStateRef, syncFromLog })
  // (#493) Per-board operation stream — see useBoardStream.
  const { stream, resetStream } = useBoardStream()
  const { appliedOpIdsRef, pendingIdsRef, latestKnownSeqRef, deferredOpsQueueRef, pendingPreviewsRef } = stream
  const strokeActiveRef   = useRef(false)
  // A joiner's first room_state can arrive before the engine exists — we need
  // that very event to learn `config` in the first place, and the engine only
  // mounts once `config` is set (see the mount-engine effect below). Its
  // operations/participants are stashed here and replayed once the engine is
  // up, instead of being dropped.
  const pendingSnapshotRef = useRef<RoomStatePayload | null>(null)
  // True once this session's `handleRoomState` has processed its very first
  // `room_state` — governs "initial handshake" vs. "genuine reconnect" there.
  // Deliberately a dedicated ref rather than checking `!useRoomStore.getState().room`:
  // that field is seeded synchronously for the *creator* (from navigation
  // state, before any socket round-trip — see the `useState` near this
  // component's top), so it doesn't distinguish "have we had our first
  // room_state yet" the way it does for a joiner (whose `room` is only ever
  // learned from that same first event).
  const firstRoomStateReceivedRef = useRef(false)
  // (#493) Snapshot publisher and restore gate — see useSnapshotPublishing.
  const {
    snapshotUploader, snapshotUploaderRef, snapshotGateRef, replayIncompleteRef, checkSnapshotBoundary,
    markJoinRestoreDone,
  } = useSnapshotPublishing({ boardId, engineRef, latestKnownSeqRef, pendingPreviewsRef, pendingIdsRef })
  // (#595) The class grid's live picture of this board — see useLivePreviewBake.
  const previewScheduleRef = useLivePreviewBake({
    engineRef, boardId, active: bakesPreviewHere,
    canBake: () => roomContentReadyRef.current && snapshotGateRef.current.ready() && !replayIncompleteRef.current
      && !pendingSnapshotRef.current && Array.from(pendingPreviewsRef.current.commitSeqs()).length === 0,
  })
  // (#487) The open's own measurement and its slow-open alarm — see
  // useOpenTimer.
  const { openTimerRef, startOpenTimer, finishOpenTimer } = useOpenTimer({ id, engineRef })

  // Tracks whether create_room/join_room has ever succeeded on this socket
  // connection's lineage, so a later auto-reconnect (socket.io's default
  // behavior on a dropped connection) rejoins rather than re-creating the
  // room or re-showing the join gate to an already-joined user.
  const hasJoinedRef = useRef(false)
  // (#537) The ack's reading of a confirmation — see useTrueOrder. Its own
  // callback so the outbox, which is rebuilt when any verdict changes
  // identity, is not rebuilt every render by an inline arrow.
  const confirmOwnOperationFromAck = useCallback(
    (op: Operation, seq: number) => confirmOwnOperation(op, seq, false),
    [confirmOwnOperation],
  )
  // (#289 §9, #176, #313) The board's outgoing queue, its retirement on a page
  // turn and its live size — see useBoardOutbox.
  const { outbox, outboxRef, outboxState } = useBoardOutbox({
    boardId: boardId ?? id ?? '', socketRef, hasJoinedRef, socketBoardRef,
    verdicts: {
      pendingIdsRef, latestKnownSeqRef, checkSnapshotBoundary,
      confirmOperation: confirmOwnOperationFromAck, discardOperation: discardOwnOperation,
      resolveTransformCommit, scheduleLostWorkRecovery, setLostWork,
    },
  })
  // The credentials a joiner's gate submission used, replayed verbatim on a
  // later reconnect (a fresh socket id always means a fresh join — see the
  // handleConnect reconnect branch below).
  const lastJoinAttemptRef = useRef<{ name: string; password?: string } | null>(null)

  // #468 v4 — the named mix is a *shortcut* for the two sliders, not a fourth
  // independent setting: choosing one writes water and pigment, and moving
  // either slider afterwards simply leaves the named value stale rather than
  // fighting it. Keeping the presets as the only writers of the pair would mean
  // a user could never depart from them; keeping them independent would mean
  // two sources of truth for one brush.
  const watercolorMixName = toolSettings.watercolor.mix as string
  useEffect(() => {
    if (!isWatercolorMixPreset(watercolorMixName)) return
    const next = WATERCOLOR_MIX_BY_PRESET[watercolorMixName]
    setToolSetting('watercolor', 'water', next.water)
    setToolSetting('watercolor', 'pigment', next.pigment)
  }, [watercolorMixName, setToolSetting])
  // Review seed follows the mount-time named-mix shortcut; later user choices remain free.
  useEffect(() => {
    const review = watercolorReviewSettings(useRoomStore.getState().toolSettings, location.search, import.meta.env.DEV)
    if (!review.enabled) return
    setToolSetting('watercolor', 'water', 1)
    setToolSetting('watercolor', 'pigment', 1)
  }, [id, location.search, setToolSetting])

  // Read directly inside useViewport's native pointerdown listener — see
  // that hook's doc comment for why a ref (checked synchronously, before
  // React ever re-renders) is required here instead of just having the
  // catcher call e.stopPropagation() itself. The ruler shares that catcher but
  // is pen-only (see handleRulerDown), so it never reserves a touch here — a
  // finger always pans/zooms while the ruler is in hand, exactly like it does
  // while drawing with the pencil.
  const toolActiveRef = useRef(false)
  // (#512) The annotation tools join the eyedropper here while the compact
  // shell is on, and that one line is the whole of "one finger draws, two
  // fingers pan". The mechanism already existed for the eyedropper: the first
  // touch is reserved for the tool and never enters the pan/pinch bookkeeping,
  // while a second finger landing behind it pans normally. Nothing about the
  // gesture had to be invented, and nothing about it changes anywhere the
  // finger does not draw.
  toolActiveRef.current = eyedropperActive || annotateWithFinger

  // (#362) Declared before useViewport because it feeds it: the pinch/rotate
  // edges the toast lives by are only observable from inside that hook's own
  // gesture handlers.
  const { toastVisible: viewportToastVisible, onPinchPhase, hide: hideViewportToast } = useViewportToast()

  const { vp, setVp, vpRef, setVpNode, vpEl, canvasWrapRef, fitCanvas, zoomBy, angleDeg, canvasTransform } =
    useViewport(config, toolActiveRef, config?.infinite ?? false, onPinchPhase)

  // (#493) What "100%" means, the resets, and the drag gestures on the zoom
  // and angle readouts — see useZoomControls.
  const { zoomPercent, resetZoom, resetZoomAndRotation, onZoomDragDown, onAngleDragDown } =
    useZoomControls({ vp, setVp, infinite: config?.infinite ?? false })

  // Hand (#319, #443) — the drag itself lives in useViewport; Room owns the
  // ways in and out and what it looks like. Two routes, one meaning: the hand
  // *selected* (an ordinary member of `tool` since #443) and Space *held* over
  // whatever else is selected. Everything downstream wants the union, which is
  // what `isHandActive` names.
  const handHeld = useRoomStore(s => s.handHeld)
  const handActive = isHandActive({ tool, handHeld })
  // (#405) Read inside a native pointerdown listener that must not be torn
  // down and rebuilt every time Space goes up and down — see the click-past-
  // the-gizmo effect below.
  const handActiveRef = useRef(handActive)
  handActiveRef.current = handActive
  // (#407) Read by the tap-past-the-gizmo listener, which is registered once
  // per transform session and must not be torn down and rebuilt every time the
  // drawing tool underneath it changes — same reason handActiveRef exists.
  const drawingToolRef = useRef(drawingTool)
  drawingToolRef.current = drawingTool

  // (#393) What the pointer looks like right now — the whole decision, made
  // once, in one module, from the tool plus every mode laid on top of it.
  // Nothing else in this file (or in BrushCursor/TransformGizmo/RulerOverlay,
  // or in Room.module.css) decides any part of it.
  const cursor = useCursor()


  // (#408) A tap on the canvas belongs to the transform tool while the gizmo is
  // up, which reads it as "I'm done here" (see the click-past-the-gizmo
  // effect). Both listeners sit on `.viewport` and neither can see what the
  // other made of the same touch, so leaving the chrome toggle armed too meant
  // one finger dismissing the gizmo *and* stripping the chrome in the same
  // instant — two answers to a gesture that asked one question. The rule is
  // kept here, where the conflict is, rather than inside the hook; and it
  // costs nothing: the tap puts the transform tool down, so by the next tap
  // the toggle is armed again and hides the chrome as it always did.
  //
  // (#519) The selection tool claims the same tap for the same kind of reason,
  // with one difference: it claims it only while there is a selection on
  // screen to put down (see clearSelectionOnTap). With none, a tap means
  // nothing to that tool, so the chrome toggle keeps it — unlike the gizmo,
  // which is either up or the tool is not in hand at all.
  const canvasTapClaimed = transformActive || (selectionActive && selection !== null)
  // (#99, #189, #321, #509) Minimal UI: the tap that hides the chrome, and the
  // annotation gestures' side of it — see useMinimalUi.
  const { uiHidden, tapDebug, tapDebugEnabled, doubleTapArmedRef, pendingNoteRef } =
    useMinimalUi({ vpEl, canvasTapClaimed, debugEnabled, hideViewportToast })

  // ── require a room id ────────────────────────────────────────────────────────
  // Config itself no longer loads here: the creator's is known synchronously
  // from navigation state (see the `config` initializer above); a joiner's
  // arrives asynchronously from the server once they submit the join gate and
  // room_state comes back (see the socket-wiring effect below).
  useEffect(() => {
    if (!id) navigate('/create')
  }, [id, navigate])

  // (#346, #464) Whether the paper texture arrived, the retry when it did not,
  // and the download's progress — see usePaperReadiness.
  const { paperProgress, paperFailed, paperRetrying, awaitPaper, retryPaper } =
    usePaperReadiness({ engineRef, requestFullResyncRef })

  // (#313, #346, #533) Which screen covers a room that has not opened — see
  // notOpenScreen for the order and why.
  const offlineGraceElapsed = useOfflineGrace(connected)
  const reviewImage = useReviewImage(engineRef, roomContentReady, connected, vpEl, setVp)
  const notOpen = reviewImage ? null : notOpenScreen({ roomContentReady, connected, offlineGraceElapsed, paperFailed, restoreFailure })

  /** (#533) Ask for the room's content again.
   *
   *  The same full resync the paper retry ends with, and for the same reason:
   *  the `room_state` that would have restored this room was consumed by the
   *  attempt that failed, so there is nothing left to re-run locally — the
   *  server has to be asked again. Clearing the flag first is what puts the
   *  loading overlay back up; if this attempt fails the same way, the catch-up
   *  sets it again and this screen returns. */
  const retryRestore = useCallback(() => {
    setRestoreFailure(null)
    requestFullResyncRef.current?.()
  }, [])

  // (#493) How the network's operations reach the engine — once each, deferred
  // until their target arrives, restored from a snapshot and backfilled behind
  // it — see useRemoteOperations.
  const { applyRemoteOp, restoreFromSnapshot, backfillHistory, repairSnapshotHistory } = useRemoteOperations({
    engineRef, appliedOpIdsRef, deferredOpsQueueRef, restoredLayerStateRef, markActive, resolveTransformCommit,
    confirmOwnOperation, noteOperationSeq, syncFromLog, checkSnapshotBoundary,
    boardId: boardId ?? id ?? '', onHistoryRepairFailure: () => setRestoreFailure('transfer'),
  })

  // (#461) The three room fields the engine is actually built from, pulled out
  // as scalars so that they — and nothing else about the room — are what can
  // cost a WebGL context. The mount effect below used to depend on `config`
  // itself, and `room` is patched in place by a growing list of actions that
  // each write a *new* object (setRoomName, setRoomClosedAt,
  // setRoomAccessMode): to that effect a new object reads as "the room
  // changed", so it tore the engine down and built a fresh one — empty, because
  // nothing re-restores content on a remount (the first room_state consumed
  // pendingSnapshotRef long ago), taking the operation log and all of undo with
  // it. Renaming from the header (#216) wiped the canvas outright; closing the
  // room mid-lesson (#222) and switching access mode (#460) stood on the same
  // mine. handleRoomState already dodges it by hand — setRoomInfo only on the
  // first room_state, see firstRoomStateReceivedRef — and this removes the mine
  // rather than adding a third dodge. Paper, paper color and infinite-ness are
  // the ones that genuinely cannot change without a rebuild, and nothing in the
  // app changes them mid-session: they are picked once, on the create form.
  //
  // `undefined` here means only "no room known yet" (`config` is null until the
  // join lands), which is why the effects below can gate on the paper alone
  // instead of on `config` — referencing the object at all is what would put it
  // back in their dependency lists.
  const enginePaper = config?.paper
  // (#493) The sound's whole lifetime, out of line — see usePencilSound.
  const pencilSoundRef = usePencilSound(enginePaper)
  const enginePaperColor = config?.paperColor
  const engineInfinite = config?.infinite ?? false
  // (#470) Captured alongside the other engine options rather than read off
  // `config` inside the effect: the effect's deps are these primitives, and
  // reaching through a possibly-null config there is what the narrowing above
  // exists to avoid.
  const enginePageW = config?.width
  const enginePageH = config?.height

  // (#345) Remember this room's paper so the *next* launch can start
  // downloading the right ~4 MB texture before anything is opened (see
  // App's usePaperPrefetch). Recorded on every room, not just the first: the
  // useful guess is the paper the person actually works on, and a teacher who
  // always uses one grain should never pay for the texture twice.
  useEffect(() => {
    if (enginePaper) useSettingsStore.getState().setLastPaperType(enginePaper)
  }, [enginePaper])

  // (#176) `navigate` changes identity with the location, and the socket
  // effect — which replaces a board id in the URL with its lesson's — must not
  // be rebuilt by the very navigation it performs.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const fitCanvasRef = useRef(fitCanvas)
  fitCanvasRef.current = fitCanvas

  /** (#176, ADR 014 §4) Takes this client onto `board`: everything that
   *  described the previous board's content is put back to zero, the board's
   *  own `room_state` is stashed for the engine that is about to be built,
   *  and `boardId` is moved — which is what tears the old engine down (its
   *  cleanup bakes that board's thumbnail) and mounts a fresh one that
   *  replays the stash, exactly the path a joiner's first `room_state` has
   *  always taken.
   *
   *  Runs for every way of arriving on a board: the first entry, a page turn
   *  this client asked for, the teacher's move when following, the server
   *  moving us off a deleted board, and a navigation into another lesson.
   *
   *  What is *not* reset here, on purpose: `replayIncompleteRef` and
   *  `snapshotGateRef` are per engine mount and are reset at the top of the
   *  mount effect instead — the outgoing engine's cleanup reads the first to
   *  decide whether its canvas may be published as the board's preview, and
   *  React runs that cleanup before the next mount's body. */
  const enterBoard = useCallback((board: string, stash: NonNullable<typeof pendingSnapshotRef.current>) => {
    resetStream()
    resetLayerSeqs()
    resetDrawingActivity()
    restoredLayerStateRef.current = null
    resetLostWork()
    setRestoreFailure(null)
    // Blocked until the new engine's replay says otherwise — the same gate a
    // first join sits behind (see roomContentReady's own doc comment).
    setRoomContentReady(false)
    resetBoardState()
    // A new page is looked at whole, the way a sketchbook page is. The
    // camera itself survives resetBoardState (see SURVIVES_PAGE_TURN) so a
    // *reconnect* to the same board keeps the person's zoom; this is the one
    // moment the page genuinely changes under them.
    fitCanvasRef.current()
    pendingSnapshotRef.current = stash
    wantedBoardRef.current = null
    socketBoardRef.current = board
    useRoomStore.getState().setBoardId(board)
  // (#493) Stable: a `useCallback` with no dependencies inside useDrawingActivity,
  // so naming it keeps this callback exactly as stable as it was with the
  // bare state setter it replaces.
  }, [resetStream, resetDrawingActivity, restoredLayerStateRef, resetLayerSeqs, resetLostWork])

  // (#493) restoreRoomState with what its two callers — the mount effect and
  // the socket's catch-up — share bound once. See useRoomRestore.
  const restoreRoom = useRoomRestore({
    restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone, dispatchParticipants,
    setRestoreFailure, setRoomContentReady, latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef,
    replayGate: replayGateRef.current,
  })

  // ── mount engine ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // (#176) No board, no engine: a joiner has nothing to build for until the
    // first `room_state` says which board they are on.
    if (enginePaper === undefined || boardId === null || !canvasRef.current) return
    // Per mount, not per board — see enterBoard's doc comment on why these two
    // are reset here rather than there.
    replayIncompleteRef.current = false
    snapshotGateRef.current = createSnapshotGate(reportInvariant)
    const ownedSnapshotGate = snapshotGateRef.current
    const engine = new PencilEngine(canvasRef.current, {
      ...watercolorQaOptions(import.meta.env.DEV, import.meta.env.VITE_QA_JOINED_TOUCH, import.meta.env.VITE_QA_JOINED_FINISH_DEFERRED, window.location.search),
      diagLog,
      infinite: engineInfinite,
      // (#470) The sheet, in world units. The canvas is the viewport now, so
      // the engine can no longer read this off it the way it used to.
      pageWidth: engineInfinite ? undefined : enginePageW,
      pageHeight: engineInfinite ? undefined : enginePageH,
      paper: enginePaper,
      gradientFibres: true,
      paperColor: enginePaperColor ? hexToRgb(enginePaperColor) : undefined,
      pencilType: initialToolRef.current.pencil,
      size: initialToolRef.current.size,
      opacity: initialToolRef.current.opacity,
      userId: useRoomStore.getState().userId,
      // (#493) Local operations out, peer reveals committed, the live stroke
      // channel — see engineNetwork.ts.
      ...createEngineNetworkCallbacks({
        engineRef, appliedOpIdsRef, pendingIdsRef, outbox, markActive, pendingPreviewsRef,
        applyRemoteOp, syncFromLog, checkSnapshotBoundary, editingBlockedRef,
        sendLive: data => { socketRef.current?.emit('stroke_live', data) },
        sendLiveEnd: data => { socketRef.current?.emit('stroke_live_end', data) },
      }),
      onSnapshotHistoryRepairNeeded: repairSnapshotHistory,
      // (#480) Движку некому докладывать самому — см. PencilEngineOptions.onInvariant.
      onInvariant: reportInvariant,
      // (#493) The developer switches — see useEngineDevOptions.
      ...engineDevOptions,
    })
    engineRef.current = engine
    exposeEngineForDev(engine)
    const unexposeMaterialReadiness = exposeMaterialReadinessForDev(() => {
      const owner = engineRef.current === engine
      const contentReady = roomContentReadyRef.current
      const snapshotReady = ownedSnapshotGate.ready()
      const incomplete = replayIncompleteRef.current
      return { owner, contentReady, snapshotReady, incomplete, latestKnownSeq: latestKnownSeqRef.current,
        ready: owner && contentReady && snapshotReady && !incomplete }
    })
    // Tells every engine-sync effect below that there is now an engine to sync
    // to — see engineEpoch's own comment for what silently did not happen
    // before this existed.
    setEngineEpoch(n => n + 1)
    // (#475) The pen calibration this device already has, handed over at
    // birth: useToolSync pushes later changes only when the *setting* changes,
    // so a freshly built engine (a paper change, every room mount) would draw
    // uncalibrated until the person touched it again. Read off the store, not
    // through a dependency: a calibration in this list would rebuild the WebGL
    // context every time the curve is dragged.
    engine.setPressureMap(pressureMapOf(useSettingsStore.getState().pressureCalibration))

    // (#493) What happens around this person's own strokes, and the layer
    // structure the store already holds — see engineWiring.
    wireLocalStrokeEvents(engine, { strokeActiveRef, markActive, pencilSoundRef })
    initLayersFromStore(engine)

    // (#493) The `room_state` parked for this engine, or the paper wait for a
    // room with none — see openParkedRoomState.
    void openParkedRoomState(engine, {
      pendingSnapshotRef, isCreator, openTimerRef, latestKnownSeqRef, awaitPaper, setRoomContentReady, finishOpenTimer,
      restore: pending => restoreRoom(engine, pending, { mode: 'join', alreadyHadSeq: 0 }, {
        boardId, finishOpenTimer, getSnapshotUploader: () => snapshotUploader,
      }),
    })

    const unhookPageHide = releaseOnPageHide(engine) // (§17.73)
    return () => {
      unexposeMaterialReadiness()
      const materialPublishable = engineRef.current === engine && roomContentReadyRef.current && ownedSnapshotGate.ready()
      if (engineRef.current === engine) engineRef.current = null
      // Publish only this engine's completed material, never an initial StrictMode canvas.
      retireEngine(engine, boardId, replayIncompleteRef, unhookPageHide, materialPublishable)
    }
  }, [
    boardId, enginePaper, enginePaperColor, engineInfinite,
    markActive, applyRemoteOp, syncFromLog, engineDevOptions, checkSnapshotBoundary, restoreRoom, finishOpenTimer,
    isCreator, snapshotUploader, outbox,
    awaitPaper,
    // (#493) The ref *object* — stable for the component's life, so naming it
    // costs nothing. Never `.current`: that would rebuild the engine every
    // time the sound instance changed. openTimerRef likewise (useOpenTimer).
    pencilSoundRef, openTimerRef, appliedOpIdsRef, snapshotGateRef, replayIncompleteRef,
    pendingIdsRef, pendingPreviewsRef, latestKnownSeqRef,
  ])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  // (#493) Every engine.setX that reflects the tool in hand — see useToolSync.
  const { cursorPresetName, nibAnchor, nibCanvasAngleRadians, tiltResponse, sizePx } =
    useToolSync({ engineRef, engineEpoch })
  useWatercolorDevFlags(engineRef, engineEpoch) // (#536) dev views and A/B switches
  // (#493) Whose colour the controls edit, what the engine draws with, the
  // well, the room palette and the flyout — see useToolColor.
  const {
    applyToolColor, colorTool, pickedColorTool, well, wellLabel, colorPair, palette, addPaletteColor,
    colorContent, colorFlyoutAt, openPanelColorSurface, railWellRef, panelWellRef, closeColorFlyout,
    openRailColorSurface, expandColorField,
  } = useToolColor({ engineRef, engineEpoch, socketRef })
  // Global, not per room — see settingsStore's own comment for why the panel's
  // layout and the panel's position part company on that.
  const floatingPanelLayout = useSettingsStore(s => s.floatingPanelLayout)
  const setFloatingPanelLayout = useSettingsStore(s => s.setFloatingPanelLayout)
  // (#493) The owner's live switches and the two ways out of a closed lesson
  // — see useLessonActions.
  const {
    toggleRoomFrozen, setRoomTools, closedBusy, reopenRoom, takeRoomCopy, toggleParticipantFrozen,
  } = useLessonActions({ socketRef, roomId: id, lessonId })

  // Persist last-used settings per room (#156/#196) — mirrors the pattern
  // above (derived state -> engine), just targeting storage instead.
  useEffect(() => {
    if (!id) return
    saveToolSettings(localStorage, id, toolSettings)
  }, [id, toolSettings])

  // (#506) Same, for the selected layer — including the case where the
  // selection was not made by hand: a `sanitizeSelection` fallback (the active
  // layer was deleted, here or by a peer) is the new selection and is stored
  // as such, so the next reload doesn't try to restore a layer this session
  // already watched disappear.
  useEffect(() => {
    if (!id) return
    saveActiveLayerId(localStorage, id, layerState.activeId)
  }, [id, layerState.activeId])

  // ── sync layer state → engine ─────────────────────────────────────────────────
  // (#493) Active layer, composite order, and the one gate that decides
  // whether a stroke may start at all — see useLayerStateSync.
  useLayerStateSync(engineRef, isOwner)

  // (#520) Which layers the eraser goes through, when it is set to go through
  // them at all. Pushed from here rather than decided in the engine because the
  // rule is made of things the engine has no business knowing — folder
  // nesting, the two kinds of lock, and whether this participant is the owner;
  // `eraseThroughTargets` is where it is written down.
  //
  // An empty list whenever the toggle is off, which is what restores the plain
  // single-layer eraser exactly. Deliberately *not* gated on the eraser being
  // the tool in hand: the engine reads this at pen-down and only for an eraser
  // stroke, so gating here would buy nothing and add a way for the list to be
  // stale at the moment it is read.
  const eraseThroughLayers = toolSettings.eraser.throughLayers as boolean
  useEffect(() => {
    engineRef.current?.setEraseThroughLayers(
      eraseThroughLayers ? eraseThroughTargets(layerState, isOwner) : [],
    )
  }, [eraseThroughLayers, layerState, isOwner, engineEpoch])

  // ── sync viewport → engine ────────────────────────────────────────────────────
  // (#493) Both effects — where the camera looks and how big the surface it
  // looks through is — live in useCanvasViewport now. They were never two
  // topics: #470 replaced a bounded room's CSS transform with a camera, and
  // these are the two halves of keeping that camera honest.
  useCanvasViewport({
    engineRef, vp, vpRef, vpEl,
    infinite: config?.infinite ?? false,
    pageW: enginePageW, pageH: enginePageH,
  })

  // ── local cursor broadcast (#37) ──────────────────────────────────────────────
  // (#493) One listener, its throttle clock and its cached rect — all of it in
  // useCursorBroadcast now.
  useCursorBroadcast({ vpRef, socketRef, strokeActiveRef })

  // ── operation log bridge ──────────────────────────────────────────────────────
  // (#493) How an operation leaves this client — optimistic, through the
  // outbox, or refused — and undo/redo, in useOperationDispatch.
  const { dispatchOp, handleUndo, handleRedo } = useOperationDispatch({
    roomContentReady, editingBlocked, connected, outbox, engineRef, pendingIdsRef, isOwnerRef,
    syncFromLog, transformSessionRef, resetTransformSessionRef,
  })

  // (#312) The banner's "undo" — drops the replacement layers again, for
  // when the deletion was right and the recovered strokes aren't wanted.
  // An ordinary layer_delete on this client's own new ids, so it goes
  // through every normal path (confirmation, undo history) rather than
  // reaching behind them.
  const undoLostWorkRecovery = useCallback(() => {
    const ids = lostWork?.restoredLayerIds ?? []
    setLostWork(null)
    if (ids.length) dispatchOp({ type: 'layer_delete', layerIds: ids })
  }, [lostWork, dispatchOp, setLostWork])

  // (#263/#608) LayerPanel has no direct engine access — the callbacks it
  // needs from the engine and the editor come through this bridge instead.
  const layerPanelBridge = useLayerPanelBridge(engineRef)

  // (#313, #377, #400) Every way out of the room — confirmed, guarded
  // against a reload with work unsent, and Back disarmed — see useLeaveGuard.
  const leaveRoom = useLeaveGuard()

  // (#309) The only place `strokeActive` reaches this component's own DOM:
  // one attribute on the editor root, from which CSS blocks pointer events on
  // the four chrome wrappers and the floating panel (`.strokeBlockable` in
  // Room.module.css / FloatingToolPanel.module.css). A store *subscription*,
  // not a selector — the point is that this runs without React re-rendering
  // anything, which is what a `useRoomStore(s => s.strokeActive)` here would
  // do to the whole tree twice per stroke.
  //
  // React never sets this attribute itself (it appears in no JSX), so it
  // can't be clobbered by an unrelated re-render the way a className toggled
  // behind React's back would be. It dies with the element on unmount, so
  // there is nothing to clean up beyond the subscription.
  useEffect(() => useRoomStore.subscribe((state, prev) => {
    if (state.strokeActive === prev.strokeActive) return
    editorRef.current?.toggleAttribute('data-stroke-active', state.strokeActive)
  }), [])

  // (#493) The eyedropper's pick — see useEyedropper.
  const handleEyedropperPick = useEyedropper({
    engineRef, vpRef, vp, handActive, applyToolColor, pickedColorTool, addPaletteColor,
  })

  // Active layer, or the current multi-select from LayerPanel — background
  // is never a legal transform target, same as merge/delete (#120).
  // useMemo'd (not just a plain const) so it has a stable reference to key
  // the bounds-refresh effect below on — without that it would refire every
  // render instead of only on an actual selection change.
  //
  // (#518) Locked layers drop out here, which is what makes the gizmo itself
  // refuse them: with no targets there are no bounds, and with no bounds
  // nothing is drawn to grab. Filtered rather than all-or-nothing on a mixed
  // multi-select — the frame then holds exactly the layers it can actually
  // move, which is both the honest readout and the only version that agrees
  // with what `dispatchOp` would let through.
  const transformTargetIds = useMemo(() => (
    (layerState.selectedIds.length > 0 ? layerState.selectedIds : [layerState.activeId])
      .filter((layerId): layerId is string => !!layerId && layerId !== BACKGROUND_LAYER_ID && layerState.items[layerId]?.kind === 'layer')
      .filter(layerId => !isLayerLocked(layerState, layerId, isOwner))
  ), [layerState, isOwner])

  // (#493) The gizmo's open session — start, commit, reset, and when each
  // happens — lives in useTransformSession. What comes back is what the rest
  // of the page reads: the region the gizmo frames, and the commit Enter uses.
  const { areaSelection, commitTransformSessionRef } = useTransformSession({
    engineRef, transformSessionRef, resetTransformSessionRef, pendingPasteRef,
    pendingTransformCommitRef, drawingToolRef, handActiveRef,
    transformTargetIds, dispatchOp, vpEl,
  })

  // (#493) The ruler — whether it shows, the engine sync, its gesture and
  // cursor — lives in useRulerTool.
  const { rulerVisible, rulerMeasuring, handleRulerDown, handleRulerHover, handleRulerEnter } =
    useRulerTool({ engineRef, vpRef, vp, handActive })

  // Which layer a pixel *action* would touch: the active one, refusing the
  // background (never a legal target for anything that paints, same rule as
  // transform/merge/delete). Null disables the actions — not the outline: a
  // region can be marked with the background active, it simply has nothing to
  // act on until a real layer is.
  //
  // (#453) Shared with the fill tool, which lands on exactly the same layer by
  // exactly the same rule — it was named for the selection only because that
  // was the first thing to need it.
  const paintTargetId = layerState.activeId
    && layerState.activeId !== BACKGROUND_LAYER_ID
    && layerState.items[layerState.activeId]?.kind === 'layer'
    ? layerState.activeId
    : null

  // (#518) Whether that target refuses paint right now. Kept apart from
  // `paintTargetId` itself rather than folded into it, because the two answer
  // different questions and one caller wants each: copying a region reads the
  // layer and is fine on a locked one, everything else here writes to it.
  const paintTargetLocked = !!paintTargetId && isLayerLocked(layerState, paintTargetId, isOwner)
  const paintTargetLockedRef = useRef(paintTargetLocked)
  paintTargetLockedRef.current = paintTargetLocked

  // Which layer the pixel actions act on (the selection's, the shape's, the
  // fill's), read when they run rather than captured: the selection outlives
  // any one layer, so "copy this region" means "from whatever is active right
  // now".
  const paintTargetIdRef = useRef(paintTargetId)
  paintTargetIdRef.current = paintTargetId

  // ── Selection (#446) ────────────────────────────────────────────────────
  // (#493) The gestures that draw an outline and the four things that can be
  // done with one live in useSelection; what comes back is what the markup,
  // the action buttons and the keyboard handler read.
  const {
    selectionShapeKind, selectionCursor, setSelectionCursor, selectionRectRef, finishSelection,
    handleSelectionDown, handleSelectionDoubleClick, handleSelectionHover,
    copySelection, deleteSelectionContents, cutSelection, pasteClipboard,
  } = useSelection({
    roomId: id, vpRef, vpEl, handActive, handActiveRef, engineRef, dispatchOp,
    paintTargetIdRef, paintTargetLockedRef, isOwnerRef, pendingPasteRef,
  })

  // (#530) The shape tool's own session. Everything it needs is already here
  // for the tools next to it: the same paint target, the same lock ref, the
  // same dispatch. What it adds is a frame that stays editable after the pen
  // comes up — see useShapeTool.
  const shapeActive = isShapeTool(tool)
  const shape = useShapeTool({
    active: shapeActive,
    config,
    vpEl,
    vpRef,
    engineRef,
    paintTargetIdRef,
    paintTargetLockedRef,
    handActiveRef,
    dispatchOp,
  })
  const shapeFrame = shape.frame
  // Read through a ref by the key handler, which is installed once: it must
  // see the current session, not the one that was open when it was bound.
  const shapeRef = useRef(shape)
  shapeRef.current = shape
  // The same three clauses the transform session gets, for the same reasons —
  // one mechanism, two tools (#528). A click past an open shape applies it and
  // leaves the tool in hand: unlike a transform, drawing shapes is something
  // you do several of in a row.
  useCommittableSession({
    active: shapeFrame !== null,
    commit: shape.commit,
    vpEl,
    handActiveRef,
    ownControlsSelector: '[data-transform-gizmo]',
    onClickPast: shape.commit,
  })

  // (#493) The fill's tap and its busy state — see useFillTool.
  const { fillBusy, handleFillTap } = useFillTool({
    engineRef, vpRef, handActive, paintTargetIdRef, paintTargetLockedRef, dispatchOp,
  })

  // ── Annotations (#509/#510, эпик #87) ───────────────────────────────────
  // (#493) Out of line in useAnnotations; what comes back is what the page's
  // markup and keyboard handling read.
  const {
    annotationDraftInputRef, annotationHover, annotationLayerRef, annotationTextCatcherRef, cancelAnnotationDraft, clearAllAnnotations, commitAnnotationDraft, erasingIds, handleAnnotationEraseDown, handleAnnotationHover, handleAnnotationPeekDown, handleAnnotationPeekUp, handleAnnotationPenDown, handleAnnotationsToggle, handleAnnotationTextTap, liveInk, pinDrag, setAnnotationHover, toggleAnnotationMode,
  } = useAnnotations({
    dispatchOp, selectTool, vpRef, handActive, compact, annotateWithFinger,
    onPersonalBoard, isOwner, doubleTapArmedRef, pendingNoteRef,
  })

  // (#493) The gizmo's pointer gestures — see useTransformGizmoGestures.
  const { handleTransformHandleDown, handleTransformCenterDown, handleTransformCenterReset } =
    useTransformGizmoGestures({ vpRef, vp, handActive, engineRef, transformSessionRef, pendingTransformCommitRef })

  // ── join gate (joiner path only) ──────────────────────────────────────────
  // (#493) The form, its screens and the attempt — see useJoinGate.
  const {
    joinName, setJoinName, joinPassword, setJoinPassword, joinError, joinSubmitting,
    joinState, setJoinState, joinPasswordAsked, handleJoinSubmit, retryJoin, retryJoinRef,
  } = useJoinGate({
    id, myDisplayName, socketRef, latestKnownSeqRef, lastJoinAttemptRef, hasJoinedRef,
    applyIdentity, outbox, startOpenTimer,
  })

  const copyingRoom = useCopyRoomEntry(location.state, roomContentReady, connected, retryJoin, config !== null)

  // ── socket wiring (#84/#37/#38/join-gate) ──────────────────────────────────────
  // Runs once per room id, independent of `config` — a joiner doesn't have a
  // config yet at connect time (that's the entire point of the join gate), so
  // the socket has to exist before it does. What gets emitted on 'connect'
  // branches on creator vs. joiner instead.
  //
  // (#176, ADR 014 §4) Keyed on the *lesson* (`sessionId`), not on the board:
  // a page turn is a `join_room` on this same socket, never a new one. Nothing
  // per-board may appear in the dependency list below — the outbox and the
  // snapshot uploader are reached through refs for exactly that reason.
  useEffect(() => {
    if (!sessionId) return
    // (#493) The socket itself, its revival and the whole `socket.on` table —
    // see connectRoomSocket. What stays here is what it is handed, and the
    // dependency list below that decides when it is rebuilt.
    return connectRoomSocket({
      sessionId, isCreator, creatorDraft,
      // Same-origin: the Vite dev server proxies /socket.io to apps/server
      // (see vite.config.ts) — works under both `npm run dev` (https, needed
      // for AudioWorklet-based sound experiments) and `npm run dev:http`.
      openSocket: () => io({ withCredentials: true }),
      onConnectionChange: next => {
        setConnected(next)
        if (next) setEverConnected(true)
      },
      ...stream, engineRef, socketRef, switchBoardRef, requestFullResyncRef, outboxRef,
      boardIdRef, wantedBoardRef, socketBoardRef, isOwnerRef, roomContentReadyRef,
      hasJoinedRef, lastJoinAttemptRef, myDisplayNameRef, tRef, retryJoinRef, setJoinState, queryClient,
      firstRoomStateReceivedRef, awaitingSeededBoardStateRef, pendingSnapshotRef, snapshotGateRef, previewScheduleRef,
      replaceUrl: path => navigateRef.current(path, { replace: true }),
      holdReviewArrivals: () => replayGateRef.current.begin(),
      applyIdentity, setRoomContentReady, enterBoard, awaitPaper, markJoinRestoreDone,
      clearRestoreFailure: () => setRestoreFailure(null),
      // Shared with the engine's mount effect — see useRoomRestore. The open
      // is not being timed any more, hence the no-op finisher: a real one here
      // would also be a new dependency of this effect, and this effect's
      // dependencies are what tear the socket down.
      restoreCatchup: async (engine, state, alreadyHadSeq, boardId) => {
        await restoreRoom(engine, state, { mode: 'catchup', alreadyHadSeq }, {
          boardId,
          finishOpenTimer: () => {},
          // Through the ref, and read when the bootstrap needs it: the uploader
          // is per board, and this effect does not re-run when the board does.
          getSnapshotUploader: () => snapshotUploaderRef.current,
        })
      },
      confirmOwnOperation: (op, seq) => confirmOwnOperation(op, seq, true),
      markActive, markLayerActive, forgetDrawingActivity, applyRemoteOp, syncFromLog, checkSnapshotBoundary,
      replayGate: replayGateRef.current,
    })
  }, [
    sessionId, isCreator, creatorDraft, syncFromLog, applyRemoteOp, applyIdentity, checkSnapshotBoundary, markJoinRestoreDone,
    restoreRoom, confirmOwnOperation, enterBoard,
    // (#429) Used by the live-stroke handler, markLayerActive too. Both are
    // useCallback with no dependencies (see their definitions), so they are
    // stable for this component's lifetime and can never tear the socket
    // down and rebuild it.
    markActive, markLayerActive,
    forgetDrawingActivity,
    awaitPaper,
    // Stable for the app's lifetime (one QueryClient, created outside React —
    // see lib/api/queryClient.ts), so listing it here can never tear the socket
    // down and rebuild it.
    queryClient,
    // (#493) From useJoinGate, useSnapshotPublishing, useLivePreviewBake,
    // useBoardOutbox and useBoardStream now, so the lint rule asks for them: a
    // useState setter, useRef objects and an object of refs, all stable for
    // the component's life — naming them can never tear the socket down.
    setJoinState, retryJoinRef, previewScheduleRef, snapshotGateRef, snapshotUploaderRef, outboxRef, stream,
    // (#176) Deliberately absent: `outbox` and `snapshotUploader` (per board,
    // read through refs), `navigate` (changes with the URL this effect itself
    // rewrites) and `boardId` (a page turn is not a new socket).
  ])

  // ── keyboard shortcuts (#174: bindings come from the `hotkeys` registry
  // loaded above, not hardcoded here — see lib/input/hotkeys.ts) ─────────────────
  // (#493) The routing, and the precedence it encodes, is editorHotkeys.ts.
  useEditorHotkeys({
    tool, drawingTool, hotkeys,
    isTransformOpen: () => transformSessionRef.current !== null,
    transformAvailable: transformActive || transformTargetIds.length > 0,
    commitTransform: () => commitTransformSessionRef.current(true),
    resetTransform: () => resetTransformSessionRef.current(),
    commitShape: () => shapeRef.current.commit(),
    cancelShape: () => shapeRef.current.cancel(),
    finishSelection,
    cancelLasso: () => { setPendingSelection(null); setSelectionCursor(null) },
    clearSelection: () => setSelection(null),
    copySelection: () => { void copySelection() },
    cutSelection: () => { void cutSelection() },
    pasteClipboard: () => { void pasteClipboard() },
    deleteSelectionContents,
    undo: () => { void handleUndo() },
    redo: () => { void handleRedo() },
    zoomBy, resetZoom,
    rotateView: radians => setVp(v => ({ ...v, angle: radians === null ? 0 : v.angle + radians })),
    toggleTool, setTool, setToolSetting,
  })

  // ── Space = hold to pan (#319, ADR 007 §4) ────────────────────────────────
  useSpaceToPan()

  // ── callbacks ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────

  if (!config) {
    if (isCreator) return null
    if (copyingRoom && !joinError && joinState === 'form' && !joinPasswordAsked) return <CopyRoomGate offline={notOpen === 'offline'} pending={outboxState.pending} />
    return (
      <JoinGate
        roomName={null}
        state={joinState}
        name={joinName}
        onNameChange={setJoinName}
        password={joinPassword}
        onPasswordChange={setJoinPassword}
        passwordAsked={joinPasswordAsked}
        error={joinError}
        submitting={joinSubmitting}
        onSubmit={handleJoinSubmit}
        onRetry={retryJoin}
        // Back to this room after signing in — the link they arrived with is
        // the only thing they have, and the lesson list would not contain it.
        returnTo={`/room/${id ?? ''}`}
      />
    )
  }

  // (#493) The overlays over the canvas — cursors, brush ring, grid, ruler,
  // gizmos, selection, annotations — written once. They ride the canvas-
  // space wrapper in a bounded room and the camera-transformed world wrapper
  // in an infinite one (#143); the two used to be the same hundred lines
  // twice, told apart only by a `config.infinite` guard on every element.
  const canvasOverlays = (
    <CanvasOverlays reviewImage={reviewImage}
      config={config} vp={vp} vpRef={vpRef} socket={socketRef.current}
      dabPreview={cursor.dabPreview}
      brush={{
        presetName: cursorPresetName, baseSize: sizePx, nibAngleRadians: nibCanvasAngleRadians, nibAnchor,
        tiltResponse,
      }}
      rulerVisible={rulerVisible} rulerMeasuring={rulerMeasuring}
      shapeFrame={shapeFrame} onShapeHandleDown={shape.onHandleDown}
      onTransformHandleDown={handleTransformHandleDown} onTransformCenterDown={handleTransformCenterDown}
      onTransformCenterReset={handleTransformCenterReset}
      selectionShapeKind={selectionShapeKind} selectionCursor={selectionCursor} areaSelection={areaSelection !== null}
      annotation={{
        onDraftCommit: commitAnnotationDraft, onDraftCancel: cancelAnnotationDraft, liveInk, erasingIds,
        dragPreview: pinDrag, hitTargets: annotationHitTargets, layerRef: annotationLayerRef,
        draftInputRef: annotationDraftInputRef,
      }}
    />
  )

  return (
    <div
      ref={editorRef}
      className={styles.editor}
      // #102: on a pen+touch tablet, a hand resting on the screen while
      // slowly dragging a slider/stroke can be read by the OS as "press and
      // hold" and synthesized into a right click — with nothing here
      // calling preventDefault(), that surfaces the browser's native
      // context menu (save/share/print) over the whole editor. Nothing in
      // this page uses a real contextmenu, so suppressing it outright is
      // safe; scoped to the editor root rather than `document` so it never
      // touches other pages (e.g. CreateRoom).
      onContextMenu={e => e.preventDefault()}
    >

      {/* ── Header ── (#493: RoomHeader) */}
      <RoomHeader
        roomContentReady={roomContentReady} engineRef={engineRef} lessonId={lessonId} isOwner={isOwner}
        uiHidden={uiHidden} narrowHeader={narrowHeader} compact={compact}
        leaveRoom={leaveRoom} connected={connected} pending={outboxState.pending}
        angleDeg={angleDeg} onAngleDragDown={onAngleDragDown} setVp={setVp}
        zoomPercent={zoomPercent} onZoomDragDown={onZoomDragDown} resetZoom={resetZoom} fitCanvas={fitCanvas}
        handleUndo={() => { void handleUndo() }} handleRedo={() => { void handleRedo() }}
        toggleAnnotationMode={toggleAnnotationMode}
        handleAnnotationPeekDown={handleAnnotationPeekDown} handleAnnotationPeekUp={handleAnnotationPeekUp}
        handleAnnotationsToggle={handleAnnotationsToggle}
        stripAvailable={stripAvailable} boardsOpen={boardsOpen} setBoardsOpen={setBoardsOpen}
        knownLessonId={knownLessonId} myHandRaised={myHandRaised} setHandRaised={setHandRaised}
        setSettingsOpen={setSettingsOpen}
      />

      {/* (#176, #595) The board strip, the teacher chip, the teacher's bar
          and the class grid — see ClassChrome. */}
      <ClassChrome
        uiHidden={uiHidden} isOwner={isOwner} compact={compact} classView={classView} boardActions={boardActions}
        wantedBoardRef={wantedBoardRef} toggleAnnotationMode={toggleAnnotationMode}
      />

      {/* (#230) roomId/isOwner are what the Access tab needs; the panel shows
          it only when both are present. */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          roomId={lessonId}
          isOwner={isOwner}
          enabledTools={enabledTools}
          onEnabledToolsChange={setRoomTools}
          classVisibility={classVisibility}
          onClassVisibilityChange={setClassVisibility}
        />
      )}

      <div className={styles.body}>

        {/* ── Left toolbar — tool selection only, fixed height per row ── */}
        {/* (#512) The two rails — tool buttons and the active tool's quick
            settings — are two side-by-side columns everywhere else, which is
            what keeps the buttons from reflowing when the field count changes
            between tools. On a phone that costs a third of the screen width
            for two nearly empty columns, so the wrapper stacks them into one
            instead. Everywhere else it is `display: contents` and changes
            nothing at all: both bars keep their own absolute positioning. */}
        <div className={clsx(
          styles.toolRail,
          compact && styles.toolRailCompact,
          // (#512) The wrapper carries the rail's surface in the compact shell,
          // so minimal UI has to fade *it* — fading only the two bars inside
          // left their background behind as a blank column over the drawing.
          compact && uiHidden && styles.uiHidden,
        )}>
        {/* (#493) The rail itself — see ToolRail. */}
        <ToolRail
          uiHidden={uiHidden} annotationRail={annotationRail} compact={compact}
          toolOffered={toolOffered} selectTool={selectTool}
          railWellRef={railWellRef} well={well} wellLabel={wellLabel}
          colorExpanded={colorFlyoutAt === 'rail'} openRailColorSurface={openRailColorSurface}
          drawingGroupTool={drawingGroupTool} drawingGroupOptions={drawingGroupOptions}
          drawingGroupActive={drawingGroupActive} gradeHotkeyLabels={gradeHotkeyLabels}
          shapeKind={shapeKind} shapeKindOptions={shapeKindOptions}
          hasTransformTargets={transformTargetIds.length > 0}
          clearAllAnnotations={clearAllAnnotations}
        />

        {/* (#493) The quick-settings column — see QuickSettingsBar. */}
        <QuickSettingsBar
          uiHidden={uiHidden} compact={compact} onShapeFrameChange={shape.setFrame}
          paintTargetId={paintTargetId} paintTargetLocked={paintTargetLocked}
          copySelection={() => { void copySelection() }} cutSelection={() => { void cutSelection() }}
          pasteClipboard={() => { void pasteClipboard() }} deleteSelectionContents={deleteSelectionContents}
          onWatercolorDry={() => { dispatchOp({ type: 'paper_dry' }) }}
        />
        </div>

        {/* ── Viewport ── */}
        {/* (#319) The grab cursor lives on .viewport rather than the canvas
            because the canvas is inert while the hand is on — a cursor set on
            an element that isn't hit-testable never shows. */}
        <div ref={setVpNode} className={clsx(styles.viewport, VIEWPORT_CURSOR_CLASS[cursor.viewportCursor])}>
          <div
            className={styles.canvasWrap}
            /* (#470) No CSS transform any more: the camera moves the view
               inside the engine, for both kinds of room. */
          >
            <canvas
              ref={canvasRef}
              // Infinite canvas (#133 Phase 1): no fixed backing-buffer size
              // to set here — the ResizeObserver effect above drives it via
              // engine.resizeCanvas() to track the viewport container's own
              // size instead, and the CSS size simply fills that container.
              // No fixed backing-buffer size to set here — the ResizeObserver
              // effect above drives it via engine.resizeCanvas() to track the
              // viewport container's own size, and the CSS size fills it.
              width={undefined}
              height={undefined}
              className={styles.canvas}
              // (#169 bug fix) pointerEvents 'none' while the initial
              // content restore is still in flight — see roomContentReady's
              // own doc comment. PointerInput binds pointerdown/move/up
              // directly on this element, so this fully blocks drawing
              // input (nothing to un-wire/re-wire in the engine itself).
              // (#254 epic, #222) editingBlocked gates it the same way —
              // the server would reject the resulting operation anyway
              // (#256/#257, #222), so this keeps anyone from drawing into
              // the void (see FrozenBanner/ClosedBanner for the visible
              // explanation of *why* input stopped responding).
              // (#319) The hand tool rides the same mechanism: with the
              // canvas inert, a press lands on .canvasWrap and bubbles to
              // .viewport's own drag handlers, so the view moves and nothing
              // paints — no second "is the hand on?" check inside the engine's
              // pointer path, which is where the two would drift apart.
              style={{
                width: '100%', height: '100%',
                pointerEvents: (roomContentReady && !editingBlocked && !handActive && !shapeActive) ? undefined : 'none',
              }}
            />
            {/* (#470) The transform moved here, off the canvas.
                These overlays work in canvas-pixel space and used to inherit
                pan/zoom/rotate for free from canvasWrap's own CSS transform.
                The canvas is not transformed any more — the camera moves the
                view inside the engine — but the overlays still want exactly
                that transform, and it is still exactly right for them: the
                string is unchanged, it simply applies to a layer that holds
                only overlays now.
                It also keeps the ref, so useViewport's per-event imperative
                write (updateVp) still lands on a real element and gestures
                stay as smooth as they were — writing it to the canvas wrapper
                would silently put the old CSS pan back on the canvas and
                double every movement. */}
            <div
              ref={canvasWrapRef}
              className={styles.worldOverlayWrap}
              style={{ transform: canvasTransform }}
            >
              {!config.infinite && canvasOverlays}
            </div>
          </div>
          {/* Infinite rooms (#143): the same five overlays, camera-aware —
              there's no canvasWrap CSS transform here for them to ride
              along with "for free" (content is redrawn under a camera
              instead of the DOM element being panned), so this wrapper
              applies the equivalent transform itself (cameraTransformCss —
              see its own doc comment for why it's a *separate* sibling of
              <canvas>, never applied to canvasWrap/canvas directly) and
              every point fed to the overlays below is genuine world-space
              (see the drag handlers above, all switched to
              clientToRoomPoint) — the same coordinate convention
              getContentBounds/Dab.x,y already use for infinite rooms, so
              e.g. TransformGizmo's bounds line up with the actual painted
              content, not an arbitrary placeholder space. Rendered as a
              sibling of canvasWrap (not inside it) purely for clarity —
              canvasWrap carries no transform in infinite mode anyway (see
              above), so nesting wouldn't change anything either way. */}
          {config.infinite && (
            <div className={styles.worldOverlayWrap} style={{ transform: cameraTransformCss(vp) }}>
              {canvasOverlays}
            </div>
          )}
          {/* (#405) The surface each press-on-the-canvas tool takes its
              gesture from — see CanvasCatchers. */}
          <CanvasCatchers
            onEyedropperPick={handleEyedropperPick}
            fill={{ busy: fillBusy, onTap: e => { void handleFillTap(e) } }}
            ruler={{ onDown: handleRulerDown, onHover: handleRulerHover, onEnter: handleRulerEnter }}
            selection={{
              onDown: handleSelectionDown, onHover: handleSelectionHover, onDoubleClick: handleSelectionDoubleClick,
              onEnter: () => { selectionRectRef.current = null },
            }}
            annotation={{
              textCatcherRef: annotationTextCatcherRef, hover: annotationHover, setHover: setAnnotationHover,
              onTextTap: handleAnnotationTextTap, onHover: handleAnnotationHover, onPenDown: handleAnnotationPenDown,
              onEraseDown: handleAnnotationEraseDown,
            }}
          />
        </div>

        {/* (#343, #364) The derived notices and the connection banner —
            siblings of `.viewport`, see RoomNotices for why. */}
        <RoomNotices
          isOwner={isOwner} isBlockedByFreeze={isBlockedByFreeze} classView={classView} selectBoard={selectBoard}
          closed={{ busy: closedBusy, onReopen: reopenRoom, onTakeCopy: takeRoomCopy }}
          lostWork={lostWork} onUndoLostWork={undoLostWorkRecovery} onDismissLostWork={() => setLostWork(null)}
          toast={uiHidden && viewportToastVisible ? { zoomPercent, angleDeg, onReset: resetZoomAndRotation } : null}
          connection={{ connected, everConnected, pending: outboxState.pending, stalled: outboxState.stalled }}
        />

        {/* (#574) Mounted only while its layer is a paintable layer: if the
            layer is deleted, or the room stops taking edits, the dialog goes
            away and takes its preview with it. */}
        {(() => {
          const item = filterLayerId ? layerState.items[filterLayerId] : undefined
          if (!filterLayerId || !item || item.kind !== 'layer' || editingBlocked || compact) return null
          const layerId = filterLayerId
          return (
            <FilterPanel
              key={layerId}
              layerName={item.name}
              onPreview={filter => engineRef.current?.previewLayerFilter(layerId, filter)}
              onApply={filter => {
                dispatchOp({ type: 'layer_filter', layerId, filter })
                setFilterLayerId(null)
              }}
              onClose={() => setFilterLayerId(null)}
            />
          )
        })()}

        {/* ── Side panel (layers, color, …) ── */}
        {/* (#512) Not rendered in the compact shell, like the drawing tools:
            layers are a property of the picture, and this shell does not edit
            the picture.

            Not rendered, and the distinction cost a debugging round: an HTML
            `hidden` attribute here does nothing, because `.layerPanelWrap` sets
            `display: flex` and a class beats the attribute's UA stylesheet
            rule. On a desktop that was invisible — the panel is a right-hand
            strip. At 390 px wide it covers the whole canvas, and every touch
            aimed at the drawing landed on the panel instead: no note, no mark,
            not even a two-finger pan. */}
        {!compact && (
          <RoomSidePanel
            uiHidden={uiHidden} active={activePanel} onSelect={setActivePanel}
            isOwner={isOwner} dispatchOp={dispatchOp} layerPanelBridge={layerPanelBridge}
            onOpenFilters={setFilterLayerId} colorContent={colorContent} joinQueue={joinQueue} drawingIds={drawingIds}
            classView={classView} selectBoard={selectBoard}
            toggleRoomFrozen={toggleRoomFrozen} toggleParticipantFrozen={toggleParticipantFrozen}
            onExpandColor={expandColorField} onShapeFrameChange={shape.setFrame}
          />
        )}

        {/* Draggable floating tool cluster (#157) — independent of the
            header/left-toolbar above, both of which stay as they are.
            (#321) When it shows is a setting now (Always / in minimal UI /
            Never) rather than "only while minimal UI has hidden the chrome",
            which is what it meant when it was that mode's replacement
            toolkit and nothing else — see lib/browser/uiPreferences. */}
        <FloatingToolPanel
          // See floatingSlotTool above for why this is narrowed rather than
          // folded: ruler/transform/grid/hand light neither slot.
          tool={floatingSlotTool}
          groups={panelGroups}
          onSelectGroupMember={selectGroupMember}
          // (#548) selectTool, not the raw store setter: it is the gate that
          // refuses a tool the room does not offer, and a slot assigned before
          // that happened is exactly the path with no button to hide.
          onSetTool={selectTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          // (#542) The same well the rail carries, at the panel's centre. It
          // reports the ring/core pair rather than one colour, so a shape's two
          // colours are as readable here as they are with the chrome up.
          wellRef={panelWellRef}
          wellFill={well.fill}
          wellStroke={well.stroke}
          wellHighlight={well.highlight}
          wellLabel={wellLabel}
          palette={palette}
          onSelectColor={v => applyToolColor(colorTool, v)}
          // Opens the flyout on the panel's own well, not on the rail's — the
          // rail may not be on screen at all, which is the case this panel
          // exists for.
          onOpenColorPicker={openPanelColorSurface}
          // The two service entries in the palette fan, present only for a tool
          // that carries two colours. Touch-sized where the glyph's own ring is
          // not, which is why the switch lives out here and not on the glyph.
          pair={colorPair}
          roomId={id ?? ''}
          position={panelPosition}
          onPositionChange={setPanelPosition}
          containerRef={editorRef}
          enabledTools={enabledTools}
          // (#512) Never in the compact shell, and this is the one place the
          // shell had to say so twice. The panel is a *replacement* toolkit —
          // its whole purpose is to hand you the drawing tools when the
          // toolbar is not there — so a shell that removes the drawing tools
          // from the toolbar and leaves this up has removed nothing at all.
          // Found exactly that way: the toolbar was clean and the panel was
          // still handing out a pencil.
          hidden={compact || !floatingPanelVisible(floatingPanelMode, deviceType, uiHidden)}
          layout={floatingPanelLayout}
          onLayoutChange={setFloatingPanelLayout}
          undoHotkeyLabel={formatHotkeyLabel(hotkeys.undo)}
          redoHotkeyLabel={formatHotkeyLabel(hotkeys.redo)}
          flyout={panelFlyout}
          onFlyoutChange={setPanelFlyout}
        />

        {/* (#542) The one colour surface: the picker and the palette together,
            hanging off whichever well opened it. */}
        <ColorFlyout
          open={colorFlyoutAt !== null}
          onDismiss={closeColorFlyout}
          anchorRef={colorFlyoutAt === 'panel' ? panelWellRef : railWellRef}
          {...colorContent}
        />

        {/* #277/#278: marker chisel-nib angle dial — orbits FloatingToolPanel
            the same way its own color flyout does, but as a continuously
            draggable ring instead of fixed swatch slots (see RadialDial's
            own doc comment for the interaction spec and why it deliberately
            differs from PrecisionSlider's no-tap-jump rule). Decides for
            itself whether to render (#309) — it is the one bit of chrome
            that unmounts mid-stroke instead of merely going unresponsive,
            and keeping that decision out here would put `strokeActive` back
            in Room's render path. */}
        <ChiselAngleDial
          panelPosition={panelPosition}
          containerRef={editorRef}
          uiHidden={uiHidden}
          flyoutOpen={panelFlyout !== null}
        />

        {/* #185: visible while the initial content restore (snapshot fetch
            + operation-log replay/backfill) is still in flight — a direct
            child of .editor (not .viewport), rendered last and with a
            z-index above every other child (.header 3, .toolbar/
            .layerPanelWrap 2) so it genuinely covers the whole screen, not
            just the canvas — an earlier version lived inside .viewport
            (z-index 1) and could never rise above those. */}
        {/* See notOpenScreen for the four and their order. */}
        {notOpen === 'offline' && <OfflineRoomOverlay pending={outboxState.pending} />}
        {notOpen === 'paperFailed' && <PaperFailedOverlay retrying={paperRetrying} onRetry={() => void retryPaper()} />}
        {notOpen === 'restoreFailed' && (
          <RestoreFailedOverlay reason={restoreFailure ?? 'transfer'} onRetry={retryRestore} />
        )}
        {notOpen === 'loading' && <RoomLoadingOverlay paper={paperProgress} copying={copyingRoom} />}
      </div>

      {glLost && <GlLostOverlay />}
      {/* (#493) The developer overlays — see DebugStack. */}
      <DebugStack
        debugEnabled={debugEnabled} hapticGrainEnabled={hapticGrainEnabled}
        tapDebugEnabled={tapDebugEnabled} pencilSoundTuningEnabled={pencilSoundTuningEnabled}
        strokeStats={strokeStats} hapticStats={hapticStats} tapDebug={tapDebug}
        engineRef={engineRef} pencilSoundRef={pencilSoundRef} tool={tool} drawingTool={drawingTool}
      />
    </div>
  )
}
