import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import clsx from 'clsx'

import { Icon } from '../../../components/Icon'
import { Logo } from '../../../components/Logo'
import { Menu, type MenuAction } from '../../../components/Menu'
import { useConfirmDialog } from '../../../components/ConfirmDialog/useConfirmDialog'
import type { PencilEngineAPI } from '../../../engine'
import { useT } from '../../../i18n'
import { renameRoom } from '../../../lib/api/api'
import {
  isFullscreenSupported, subscribeFullscreenChange, toggleFullscreen as toggleFullscreenOn,
} from '../../../lib/browser/fullscreen'
import { formatHotkeyLabel } from '../../../lib/input/hotkeys'
import type { useDragToAdjust } from '../../../lib/input/useDragToAdjust'
import { useShareRoom } from '../../../components/RoomAccessControl/useShareRoom'
import { useRoomStore } from '../../../stores/roomStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { SyncIndicator } from '../status/SyncIndicator'
import type { Viewport } from '../viewport/useViewport'
import styles from '../Room.module.css'

type DragDown = ReturnType<typeof useDragToAdjust>['onPointerDown']

export interface RoomHeaderProps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** The lesson the name belongs to — the store's, or the URL's until it arrives. */
  lessonId: string | undefined
  isOwner: boolean
  /** Minimal UI's hidden chrome (#99). */
  uiHidden: boolean
  /** The header is too narrow for its toggles, which fold into the menu (#575). */
  narrowHeader: boolean
  /** The phone-sized "annotations only" shell (#512). */
  compact: boolean
  leaveRoom: () => Promise<void>
  connected: boolean
  /** Operations not yet confirmed — the sync indicator's number. */
  pending: number
  angleDeg: number
  onAngleDragDown: DragDown
  setVp: Dispatch<SetStateAction<Viewport>>
  zoomPercent: number
  onZoomDragDown: DragDown
  resetZoom: () => void
  fitCanvas: () => void
  handleUndo: () => void
  handleRedo: () => void
  toggleAnnotationMode: (on: boolean) => void
  handleAnnotationPeekDown: (e: React.PointerEvent<HTMLButtonElement>) => void
  handleAnnotationPeekUp: (e: React.PointerEvent<HTMLButtonElement>) => void
  handleAnnotationsToggle: () => void
  /** Whether the board strip can be shown at all (#176). */
  stripAvailable: boolean
  boardsOpen: boolean
  setBoardsOpen: Dispatch<SetStateAction<boolean>>
  /** The lesson id once it is known — class features wait for it. */
  knownLessonId: string | null
  myHandRaised: boolean
  setHandRaised: (raised: boolean) => void
  /** Minimal UI is on for this device (#321). */
  tapToHideEnabled: boolean
  toggleUI: () => void
  setSettingsOpen: (open: boolean) => void
}

/** (#493) The editor's header: the way out, the lesson's name (renamed in
 *  place by its owner, #216), whether work is reaching the server (#376),
 *  and the controls needed *while drawing* (#320) — rotation and its lock,
 *  zoom, undo/redo, annotations, the board strip, a raised hand, minimal UI,
 *  fullscreen — with the ≡ menu for everything reached for between strokes.
 *
 *  Out of Room's render with what only it uses: the rename draft, fullscreen,
 *  export and session save, the share action, and the toggles that fold into
 *  the menu when the header is narrow. */
export function RoomHeader({
  engineRef, lessonId, isOwner, uiHidden, narrowHeader, compact, leaveRoom, connected, pending,
  angleDeg, onAngleDragDown, setVp, zoomPercent, onZoomDragDown, resetZoom, fitCanvas,
  handleUndo, handleRedo,
  toggleAnnotationMode, handleAnnotationPeekDown, handleAnnotationPeekUp, handleAnnotationsToggle,
  stripAvailable, boardsOpen, setBoardsOpen, knownLessonId, myHandRaised, setHandRaised,
  tapToHideEnabled, toggleUI, setSettingsOpen,
}: RoomHeaderProps): React.JSX.Element | null {
  const t = useT()
  const { alert: showAlert } = useConfirmDialog()
  const config = useRoomStore(s => s.room)
  const boardId = useRoomStore(s => s.boardId)
  const hotkeys = useSettingsStore(s => s.hotkeys)
  const annotationMode = useRoomStore(s => s.annotationMode)
  const annotations = useRoomStore(s => s.annotations)
  const annotationsHidden = useRoomStore(s => s.annotationsHidden)
  const setAnnotationsHidden = useRoomStore(s => s.setAnnotationsHidden)

  // (#460) The header menu's "Share" — same helper the lesson list's ⋮ uses.
  const shareRoom = useShareRoom()

  // #93: fullscreen toggle for the whole page — removes tablet browser chrome
  // (address bar/nav), which eats real estate especially in landscape. iOS
  // Safari doesn't support the Fullscreen API for arbitrary elements, hence the
  // fullscreenEnabled gate below (hide rather than show a button that would
  // throw). What goes fullscreen is `document.documentElement`, not `editorRef`
  // — see toggleFullscreen for why that distinction is load-bearing (#357).
  const [isFullscreen, setIsFullscreen] = useState(false)
  // (#466) Asked through lib/browser/fullscreen rather than read off
  // `document.fullscreenEnabled` directly: on Safari below 16.4 that property
  // does not exist, so this was false and the button was never rendered — on
  // a browser that can do fullscreen perfectly well under the prefixed name.
  const fullscreenSupported = isFullscreenSupported()

  // (#458) The lock beside that readout. What it actually *enforces* lives in
  // useViewport (see holdAngleIfLocked) — a viewport that refuses to change its
  // angle, whoever asks. Here it only decides what the header offers: a locked
  // readout stops being a control and goes back to being a number, so the drag
  // and the quarter-turn click aren't handed a gesture that would do nothing.
  const rotationLocked = useRoomStore(s => s.rotationLocked)
  const setRotationLocked = useRoomStore(s => s.setRotationLocked)

  // (#211 epic, #216) The same owner-only rename the lesson list offers, in
  // the one place the name is already on screen: click the header label and
  // it becomes the field. Non-null draft *is* the editing state — there is no
  // separate boolean, so the two can't disagree. REST rather than a socket
  // event, same reasoning as reopenRoom above: the name is persisted room
  // metadata, not canvas content, and PATCH /api/rooms/:id is where it lives
  // (roomRoutes.ts, which re-checks ownership — the owner gate here is UI,
  // not a boundary). Deliberately not broadcast: everyone else keeps the name
  // they joined with until their next join, and nothing but this label and
  // the export filename reads it.
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  const submitRename = useCallback(async () => {
    const draft = renameDraft
    setRenameDraft(null)
    const name = draft?.trim()
    const previous = useRoomStore.getState().room?.name
    if (!lessonId || !name || name === previous) return
    // Optimistic: the field is already gone by now, so the label has to be
    // carrying the new name or the edit reads as having been dropped.
    useRoomStore.getState().setRoomName(name)
    try {
      await renameRoom(lessonId, name)
    } catch {
      if (previous !== undefined) useRoomStore.getState().setRoomName(previous)
      void showAlert({ message: t('room.error.rename') })
    }
  }, [lessonId, renameDraft, showAlert, t])

  // (#357) The document root goes fullscreen, not the editor element.
  //
  // A fullscreen element is rendered in the browser's *top layer*, above every
  // z-index in the page, and nothing outside it is painted at all. Everything
  // this app portals into `<body>` — the layer row's "⋮" menu, every Modal and
  // ConfirmDialog, the notice stack, the tool pickers — is a sibling of the
  // editor rather than a descendant, so with the editor fullscreened all of it
  // silently stopped existing on screen: the menu opened, held state, passed
  // `checkVisibility()`, and was neither visible nor clickable. On a tablet,
  // where fullscreen is the normal way to work, that was half the interface.
  // Fullscreening `documentElement` keeps every portal inside the fullscreen
  // element, including ones added later, and changes nothing about layout —
  // the editor already fills the page.
  //
  // (#466) Both calls go through lib/browser/fullscreen, which fills in the
  // `webkit`-prefixed spelling Safari below 16.4 is limited to.
  const toggleFullscreen = useCallback(() => { void toggleFullscreenOn() }, [])

  // Fullscreen can also be exited by the browser/OS itself (Esc, system
  // gesture) without going through toggleFullscreen — listen rather than
  // trust the button's own click to keep the icon in sync.
  useEffect(() => subscribeFullscreenChange(setIsFullscreen), [])

  const handleExport = useCallback(async () => {
    const engine = engineRef.current
    const blob = await engine?.exportPNG(); if (!blob) return
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}.png`; a.click()
    URL.revokeObjectURL(url)
  }, [config, engineRef])

  // (#329) The transparent-PNG variant (#15) is gone along with its header
  // button: a second export button for a rarely-wanted variant, sitting
  // permanently in the panel #320 is trying to empty. `exportPNG` still takes
  // the flag, so it can come back as an option inside a real export dialog if
  // it's ever actually missed.

  // #15: serializes the operation log as-is (same shape appendOperation/
  // getOperations already deal in) so the exact same JSON could later be
  // replayed back through appendOperation('remote') to restore the session.
  const handleSaveSession = useCallback(() => {
    const engine = engineRef.current
    const ops = engine?.getOperations(); if (!ops) return
    const blob = new Blob([JSON.stringify(ops, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}-session.json`; a.click()
    URL.revokeObjectURL(url)
  }, [config, engineRef])

  if (!config) return null

  // (#575) The header's mode toggles, when it is too narrow to hold them —
  // the same conditions as their buttons, the same order, and a tick for the
  // pressed state the buttons showed. The notes button's peek-on-hold stays
  // with the button: a menu item is gone the moment it is pressed, so there is
  // nothing to hold, and a plain toggle is what's left.
  const foldedHeaderToggles: MenuAction[] = !narrowHeader ? [] : [
    ...(!compact ? [{
      label: t('room.annotationMode'),
      icon: 'edit_note' as const,
      checked: annotationMode,
      onClick: () => toggleAnnotationMode(!annotationMode),
    }] : []),
    ...(annotations.order.length > 0 ? [{
      label: t('room.annotationsHide'),
      icon: 'visibility_off' as const,
      checked: annotationsHidden,
      onClick: () => setAnnotationsHidden(!annotationsHidden),
    }] : []),
    ...(stripAvailable ? [{
      label: t('boards.open'),
      icon: 'auto_stories' as const,
      checked: boardsOpen,
      onClick: () => setBoardsOpen(o => !o),
    }] : []),
    ...(!isOwner && knownLessonId ? [{
      label: t(myHandRaised ? 'class.lowerHand' : 'class.raiseHand'),
      icon: 'pan_tool' as const,
      checked: myHandRaised,
      onClick: () => setHandRaised(!myHandRaised),
    }] : []),
    ...(fullscreenSupported ? [{
      label: t('room.fullscreen'),
      icon: 'fullscreen' as const,
      checked: isFullscreen,
      onClick: toggleFullscreen,
    }] : []),
  ]

  return (
    <header className={clsx(styles.header, uiHidden && styles.uiHidden, styles.strokeBlockable)}>
      {/* The wordmark is the way out of the editor, same as on every other
          page — it replaced an arrow_back that went to /create rather than
          anywhere back, and left without asking. */}
      <button
        className={clsx(styles.headerLogoBtn, narrowHeader && styles.headerLogoBtnMark)}
        onClick={() => void leaveRoom()}
        title={t('room.home')}
        aria-label={t('room.home')}
      >
        <Logo variant={narrowHeader ? 'mark' : 'full'} />
      </button>
      {/* Same divider the control clusters use on the right (#329) — the
          wordmark is a button that leaves the room, and without a break
          between them it and the name beside it read as one label. */}
      <div className={styles.headerDivider} />
      {renameDraft !== null ? (
        <input
          className={clsx(styles.roomName, styles.roomNameInput)}
          autoFocus
          value={renameDraft}
          aria-label={t('room.rename')}
          onFocus={e => e.currentTarget.select()}
          onChange={e => setRenameDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); void submitRename() }
            if (e.key === 'Escape') { e.preventDefault(); setRenameDraft(null) }
          }}
          onBlur={() => void submitRename()}
        />
      ) : isOwner ? (
        <button
          className={clsx(styles.roomName, styles.roomNameBtn)}
          onClick={() => setRenameDraft(config.name)}
          title={t('room.rename')}
        >
          {config.name}
        </button>
      ) : (
        <span className={styles.roomName}>{config.name}</span>
      )}
      {/* (#376) Beside the name, because what it reports is the state of
          the thing the name refers to. Took over from the connection
          banner's "Saving N strokes…", which flashed on and off with every
          stroke. */}
      <SyncIndicator connected={connected} pending={pending} dotOnly={narrowHeader} />

      {/* (#329) Four sections, divider-separated, in the order they're
          reached for: rotation | zoom + fit | undo/redo | fullscreen | ≡.
          Everything that isn't a per-second viewport or history action moved
          out — export/save/settings into the ≡ menu, Clear into the layer's
          own "⋮" (it always cleared *a layer*, never the canvas), the
          participants list and room freeze into the side panel (#328), and
          the transparent-PNG export and the two rotate-by-15° buttons are
          gone: the first was a second export button for a rarely-wanted
          variant, the second is what dragging the rotation readout does now.
          The rule this panel is held to from here on (#320): a control earns
          a place here by being needed *while drawing*. */}
      <div className={styles.headerRight}>
        {/* Rotation: drag up/down to turn the canvas by fine degrees, click
            to snap to the next quarter turn. (#106) If the angle is already
            exactly one of 0/90/180/270, a click advances to the next one,
            wrapping 270 back to 0; from any other angle (a free rotation
            gesture, or a drag) it resets straight to 0 rather than rounding
            up to the next multiple. */}
        <button
          className={clsx(
            styles.angleLabel,
            angleDeg !== 0 && styles.angleLabelActive,
            rotationLocked && styles.angleLabelLocked,
          )}
          onPointerDown={rotationLocked ? undefined : onAngleDragDown}
          // `aria-disabled`, not `disabled`: a disabled button shows no
          // tooltip in any browser, and the tooltip is the only place the
          // readout gets to say *why* it stopped responding.
          aria-disabled={rotationLocked}
          onClick={() => {
            if (rotationLocked) return
            setVp(v => {
              const deg = Math.round(v.angle * 180 / Math.PI)
              const normalizedDeg = ((deg % 360) + 360) % 360
              const isAtCanonicalAngle = normalizedDeg % 90 === 0
              const nextDeg = isAtCanonicalAngle ? (normalizedDeg + 90) % 360 : 0
              return { ...v, angle: nextDeg * Math.PI / 180 }
            })
          }}
          title={rotationLocked
            ? t('room.rotationLockedHint', { angle: String(angleDeg) })
            : t('room.rotation', { hotkey: formatHotkeyLabel(hotkeys.resetRotation) })}
        >
          <Icon name="screen_rotation_alt" />
          {angleDeg}°
        </button>
        {/* (#458) Beside the number it pins, not in the ⋮ menu: on a tablet
            the canvas gets turned by accident — a two-finger pan almost
            always carries a little twist with it — so the way to stop that
            has to be reachable in the moment it happens, which is the same
            "needed while drawing" test the rest of this panel is held to
            (#320). It is also where the person is already looking, because
            the angle they didn't ask for is displayed right there. */}
        <button
          className={clsx(styles.rotationLockBtn, rotationLocked && styles.rotationLockBtnOn)}
          onClick={() => setRotationLocked(!rotationLocked)}
          aria-pressed={rotationLocked}
          title={t(rotationLocked ? 'room.rotationUnlock' : 'room.rotationLock')}
          aria-label={t(rotationLocked ? 'room.rotationUnlock' : 'room.rotationLock')}
        >
          <Icon name={rotationLocked ? 'lock' : 'lock_open'} />
        </button>

        <div className={styles.headerDivider} />

        {/* Infinite rooms display (and reset to) zoom relative to the
            device-native 1-world-unit-per-physical-pixel scale, so "100%"
            means the drawing's actual 1:1 resolution on every screen —
            see deviceNativeZoom's doc comment. Bounded rooms keep vp.zoom
            as-is (their canvas backing is the fixed document size, so
            vp.zoom already is the document scale). Both the number and the
            reset come from `zoomPercent`/`resetZoom` above, shared with
            #362's toast — this readout used to compute the same expression
            twice inline, and a third copy in the toast is how the four
            notice banners ended up needing #343. */}
        <button
          className={styles.zoomLabel}
          onPointerDown={onZoomDragDown}
          onClick={resetZoom}
          title={t('room.zoom')}
        >
          {zoomPercent}%
        </button>
        <button className={styles.headerIconBtn} title={t('room.fitCanvas')} aria-label={t('room.fitCanvas')} onClick={fitCanvas}>
          <Icon name="fit_screen" />
        </button>

        <div className={styles.headerDivider} />

        <button
          className={styles.headerIconBtn}
          onClick={handleUndo}
          title={t('room.undoTitle', { hotkey: formatHotkeyLabel(hotkeys.undo) })}
          aria-label={t('room.undo')}
        >
          <Icon name="undo" />
        </button>
        <button
          className={styles.headerIconBtn}
          onClick={handleRedo}
          title={t('room.redoTitle', { hotkey: formatHotkeyLabel(hotkeys.redo) })}
          aria-label={t('room.redo')}
        >
          <Icon name="redo" />
        </button>

        {/* (#509 v4) Annotations, as a pair: the mode toggle and the local
            hide. Up here rather than in the rail because neither is a tool —
            one decides *which* tools the rail offers, the other decides
            whether anyone's remarks are on screen at all — and because this
            panel is where the editor's modes already live.

            The toggle is absent in the compact shell: there the whole
            interface is annotation mode and there is nothing to switch to.

            (#575) In a narrow header both live in the ≡ menu instead — as do
            the boards and fullscreen toggles below. */}
        {!narrowHeader && (!compact || annotations.order.length > 0) && <div className={styles.headerDivider} />}
        {!narrowHeader && !compact && (
          <button
            className={clsx(styles.headerIconBtn, annotationMode && styles.headerIconBtnActive)}
            onClick={() => toggleAnnotationMode(!annotationMode)}
            title={t('room.annotationModeTitle')}
            aria-label={t('room.annotationMode')}
            aria-pressed={annotationMode}
          >
            <Icon name="edit_note" />
          </button>
        )}
        {/* Shown only once there is something to hide — a control that
            provably does nothing is worse than no control. */}
        {!narrowHeader && annotations.order.length > 0 && (
          <button
            className={clsx(styles.headerIconBtn, annotationsHidden && styles.headerIconBtnActive)}
            title={annotationsHidden ? t('room.annotationsShow') : t('room.annotationsHide')}
            aria-label={annotationsHidden ? t('room.annotationsShow') : t('room.annotationsHide')}
            aria-pressed={annotationsHidden}
            onPointerDown={handleAnnotationPeekDown}
            onPointerUp={handleAnnotationPeekUp}
            onPointerCancel={handleAnnotationPeekUp}
            onClick={handleAnnotationsToggle}
          ><Icon name={annotationsHidden ? 'visibility_off' : 'visibility'} /></button>
        )}

        {/* (#321) A second way into minimal UI, next to the tap that is
            otherwise its only entrance — a tap on the canvas is easy to
            discover by accident and hard to discover on purpose. Only shown
            while the setting is on: it hides the chrome, so it cannot be
            the thing that brings it back (that is still the tap), and
            offering it to someone who hasn't asked for the mode would be a
            button that makes the interface vanish with no visible way to
            return. */}
        {/* (#176) The board strip's toggle. Here by the same rule as the
            rest of this panel: turning the page is something a teacher does
            mid-explanation, between one stroke and the next. */}
        {!narrowHeader && stripAvailable && (
          <>
            <div className={styles.headerDivider} />
            <button
              className={clsx(styles.headerIconBtn, boardsOpen && styles.headerIconBtnActive)}
              onClick={() => setBoardsOpen(o => !o)}
              title={t('boards.open')}
              aria-label={t('boards.open')}
              aria-pressed={boardsOpen}
            >
              <Icon name="auto_stories" />
            </button>
          </>
        )}
        {/* (#595) A student's raised hand — done *during* a lesson, between
            strokes, the test this panel holds every control to (#320). There
            for the whole lesson, not only an assignment: a question is not an
            assignment-only thing. The teacher sees it in the Class tab. */}
        {!narrowHeader && !isOwner && knownLessonId && (
          <button
            className={clsx(styles.headerIconBtn, myHandRaised && styles.headerIconBtnActive)}
            onClick={() => setHandRaised(!myHandRaised)}
            title={t(myHandRaised ? 'class.lowerHand' : 'class.raiseHand')}
            aria-label={t(myHandRaised ? 'class.lowerHand' : 'class.raiseHand')}
            aria-pressed={myHandRaised}
          >
            <Icon name="pan_tool" />
          </button>
        )}

        {tapToHideEnabled && (
          <>
            <div className={styles.headerDivider} />
            <button
              className={styles.headerIconBtn}
              onClick={toggleUI}
              title={t('room.minimalUi')}
              aria-label={t('room.minimalUi')}
            >
              <Icon name="visibility_off" />
            </button>
          </>
        )}

        {!narrowHeader && fullscreenSupported && (
          <>
            <div className={styles.headerDivider} />
            <button
              className={styles.headerIconBtn}
              onClick={toggleFullscreen}
              title={t(isFullscreen ? 'room.exitFullscreen' : 'room.fullscreen')}
              aria-label={t(isFullscreen ? 'room.exitFullscreen' : 'room.fullscreen')}
            >
              <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} />
            </button>
          </>
        )}

        <div className={styles.headerDivider} />

        {/* Everything you reach for between strokes rather than during
            one. Same shared Menu as every other dropdown in the app
            (#328), with icons (#329). */}
        <Menu
          triggerClassName={styles.headerIconBtn}
          triggerLabel={t('room.menu')}
          trigger={<Icon name="menu" />}
          actions={[
            ...foldedHeaderToggles,
            // (#460) First of the menu's own items: inviting someone into
            // the project you already have open is the one thing here that
            // is about other people. Disabled until the room itself has
            // arrived — there is no link to hand out before we know which
            // room this is.
            {
              label: t('share.action'),
              icon: 'share',
              onClick: () => { if (config) shareRoom(config) },
              disabled: config === null,
              separatorBefore: foldedHeaderToggles.length > 0,
            },
            {
              label: t('share.review'),
              icon: 'share',
              onClick: () => { if (config) shareRoom({ ...config, id: boardId ?? config.id }, true) },
              disabled: config === null,
            },
            { label: t('room.export'), icon: 'download', onClick: handleExport, title: t('room.exportTitle') },
            { label: t('room.saveSession'), icon: 'save', onClick: handleSaveSession, title: t('room.saveSessionTitle') },
            { label: t('room.settings'), icon: 'settings', onClick: () => setSettingsOpen(true) },
            // The same exit as the wordmark, confirmation dialog included —
            // the logo only reads as "leave" once you already know it does.
            { label: t('room.leave'), icon: 'logout', onClick: () => void leaveRoom() },
          ]}
        />
      </div>
    </header>
  )
}
