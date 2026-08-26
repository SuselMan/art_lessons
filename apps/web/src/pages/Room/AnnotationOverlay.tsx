import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { MAX_ANNOTATION_TEXT_LENGTH } from '@grafetto/shared'

import { Icon } from '../../components/Icon'
import { inkPathData, type AnnotationState } from '../../lib/annotations'
import type { AnnotationDraft } from '../../stores/slices/annotationSlice'
import { ANNOTATION_ID_ATTR, ANNOTATION_PART_ATTR } from './annotationHitTest'
import styles from './Room.module.css'

/** Pin radius in screen pixels. Constant on screen, like the note it holds —
 *  the pin marks a point, and a point does not get bigger when you zoom in. */
const PIN_RADIUS_PX = 7

/** The pin's *target*, which is deliberately much larger than the pin. 14px of
 *  dot is a fifth of a fingertip: the dot is the right size to look at and the
 *  wrong size to hit, so what gets hit is a transparent square around it. Same
 *  split the ink marks use (a fat invisible twin of a thin line), and the same
 *  44px the rest of this project sizes touch targets to. */
const PIN_HIT_PX = 44

/** Gap between the pin and the note hanging off it, in screen pixels. */
const BUBBLE_OFFSET_PX = 10

/** How wide a note may get before it wraps, in screen pixels. Wide enough for a
 *  sentence, narrow enough not to cover the drawing it is about. */
const BUBBLE_MAX_WIDTH_PX = 210

interface AnnotationOverlayProps {
  annotations: AnnotationState
  /** (#511) The local hide toggle. Rendered as "draw nothing" rather than
   *  `visibility: hidden`, so a hidden note is also un-hit-testable — an
   *  invisible thing that still answers a press is the trap #405 pulled the
   *  ruler out of. */
  hidden: boolean
  /** (#509 v2) Notes this reader has folded down to their pin. Local state:
   *  see the slice. */
  collapsedIds: Record<string, true>
  /** (#510 v2) What the eraser has swept over but not yet removed — faded, so
   *  a sweep across several remarks shows what it is taking while the finger is
   *  still down. Empty between gestures. */
  erasingIds: ReadonlySet<string>
  /** (#509 v3) The pin being dragged, at its live position. The annotation is
   *  only really moved when the finger lifts — one operation per gesture, not
   *  one per pointermove — so until then this is where it is drawn. */
  dragPreview: { annotationId: string; x: number; y: number } | null
  /** The open text draft, if the caret is in one. */
  draft: AnnotationDraft | null
  onDraftChange: (text: string) => void
  onDraftCommit: () => void
  onDraftCancel: () => void
  /** The ink gesture in progress, in world coordinates — drawn here so the
   *  mark appears under the finger before it is ever recorded. Null between
   *  gestures. */
  liveInk: { points: number[]; color: string; size: number } | null
  /** Camera zoom and angle, to counter-scale the pins and notes. Everything
   *  that is *interface* rather than *mark* cancels the wrapper's transform
   *  with these — the same thing RulerOverlay's distance label does. */
  zoom: number
  angle: number
  /** Whether an annotation tool is in hand. Drives `pointer-events` on the
   *  pieces below, which is what lets Room's catcher hit-test them (see
   *  annotationAt) while leaving them completely transparent to a stroke
   *  aimed at the paper under any other tool. */
  interactive: boolean
  layerRef?: RefObject<HTMLDivElement | null>
}

/** (#508, эпик #87) Draws every annotation over the composite.
 *
 *  Placement convention is the one GridOverlay/RulerOverlay/SelectionOverlay
 *  already use: a child of whichever ancestor carries the viewport transform,
 *  so world coordinates are written straight out and pan/zoom/rotate come for
 *  free with no inverse math here.
 *
 *  Two kinds of thing live in here and they behave differently on purpose:
 *
 *   - an **ink mark** is drawn *on* the paper. It scales and turns with the
 *     drawing, because that is what a mark does.
 *   - a **note** is a pin stuck in the paper with a bubble hanging off it. The
 *     pin's *position* is world space; its size, and the whole bubble, cancel
 *     the wrapper's scale and rotation so they stay screen-sized and upright.
 *     A remark that shrinks out of legibility when you zoom out to look at the
 *     whole picture is useless exactly when you want it.
 *
 *  Purely presentational, like RulerOverlay and SelectionOverlay: every press
 *  is caught by Room's `.canvasCatcher` and hit-tested against these elements,
 *  never delivered to them. It could not be otherwise — the catcher sits above
 *  this layer in a stacking context this layer cannot climb out of. */
export function AnnotationOverlay({
  annotations, hidden, collapsedIds, erasingIds, dragPreview, draft,
  onDraftChange, onDraftCommit, onDraftCancel,
  liveInk, zoom, angle, interactive, layerRef,
}: AnnotationOverlayProps) {
  if (hidden) return null

  const items = annotations.order.map(id => annotations.items[id]).filter(Boolean)
  const counter = 1 / (zoom || 1)
  const events = interactive ? 'auto' : 'none'

  /** The transform that puts a screen-sized element at a world point: undo the
   *  wrapper's scale and rotation, then offset in what are now screen pixels. */
  const pinned = (x: number, y: number, dx: number, dy: number) =>
    `translate(${x}px, ${y}px) scale(${counter}) rotate(${-angle}rad) translate(${dx}px, ${dy}px)`

  return (
    <div className={styles.annotationLayer} ref={layerRef}>
      <svg className={styles.annotationInkSvg}>
        {items.map(a => a.kind === 'ink' && (
          <g key={a.id}>
            {/* A transparent, deliberately fat twin of the mark, purely to be
                hit. A 2px line is 2px of target, which is not something anyone
                can put an eraser on; this gives it a finger-sized one without
                changing what is drawn. Only present while it can be used. */}
            {interactive && (
              <path
                d={inkPathData(a.points)}
                {...{ [ANNOTATION_ID_ATTR]: a.id, [ANNOTATION_PART_ATTR]: 'ink' }}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(a.size, 22 * counter)}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'stroke' }}
              />
            )}
            <path
              d={inkPathData(a.points)}
              fill="none"
              stroke={a.color}
              strokeWidth={a.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none', opacity: erasingIds.has(a.id) ? 0.25 : undefined }}
            />
          </g>
        ))}
        {liveInk && (
          <path
            d={inkPathData(liveInk.points)}
            fill="none"
            stroke={liveInk.color}
            strokeWidth={liveInk.size}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {items.map(a => {
        if (a.kind !== 'text') return null
        const dragging = dragPreview?.annotationId === a.id
        const editing = draft?.annotationId === a.id
        const x = dragging ? dragPreview.x : a.x
        const y = dragging ? dragPreview.y : a.y
        return (
          <div key={a.id}>
            <Pin
              annotationId={a.id}
              transform={pinned(x, y, -PIN_HIT_PX / 2, -PIN_HIT_PX / 2)}
              color={a.color}
              events={events}
              faded={erasingIds.has(a.id)}
              active={editing || dragging}
            />
            {/* Folded down to just the pin, or open. The note being edited is
                not drawn twice — the editor stands in for it. Hidden while
                dragging too: the point of dragging is to see where the pin
                lands, and a bubble swinging around it is in the way. */}
            {!collapsedIds[a.id] && !editing && !dragging && (
              <Bubble
                annotationId={a.id}
                text={a.text}
                color={a.color}
                fontSize={a.size}
                pinned={pinned}
                zoom={zoom}
                angle={angle}
                x={x}
                y={y}
                interactive={interactive}
                events={events}
                faded={erasingIds.has(a.id)}
              />
            )}
          </div>
        )
      })}

      {draft && (
        <>
          <Pin
            annotationId={draft.annotationId ?? 'draft'}
            transform={pinned(draft.x, draft.y, -PIN_HIT_PX / 2, -PIN_HIT_PX / 2)}
            color={draft.color}
            events="none"
            faded={false}
            active
          />
          <DraftEditor
            draft={draft}
            pinned={pinned}
            zoom={zoom}
            angle={angle}
            onChange={onDraftChange}
            onCommit={onDraftCommit}
            onCancel={onDraftCancel}
          />
        </>
      )}
    </div>
  )
}

/** Keeps a bubble on screen by hanging it off the other side of its pin when it
 *  would overflow the right edge.
 *
 *  Shared by the committed note and the open editor, and the editor is why this
 *  became a hook: written for the committed one first, it left every note
 *  pinned in the right half of a phone screen with its tick and its bin off
 *  screen — the two controls the editor cannot be finished with.
 *
 *  Measured after layout rather than predicted, because predicting means
 *  projecting a world point into screen coordinates, and that projection is
 *  different for bounded and infinite rooms. The browser has already done it by
 *  the time this runs.
 *
 *  `deps` is whatever moves or resizes the box: position, camera, content. */
function useEdgeFlip(gapPx: number, deps: unknown[]): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [flipped, setFlipped] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Decided from where the *pin* is, never from which edge the box currently
    // overhangs. That distinction is the whole of it: this first tested "does
    // it overflow right → flip" and "does it overflow left → unflip", which
    // loops forever for any note whose bubble fits on neither side — flip,
    // overhang left, unflip, overhang right, flip. React caught it as
    // "Maximum update depth exceeded" and blanked the editor.
    //
    // Recovering the pin's position from the box makes the answer a pure
    // function of (pin, width), which is the same in both states, so it
    // settles after at most one extra pass. Staying put when neither side fits
    // is deliberate: overhanging the right edge of a phone screen is bad, and
    // overhanging the left one — where the tool rail is — is worse.
    const pinX = flipped ? rect.right + gapPx : rect.left - gapPx
    const fitsRight = pinX + gapPx + rect.width <= window.innerWidth
    const fitsLeft = pinX - gapPx - rect.width >= 0
    const next = !fitsRight && fitsLeft
    if (next !== flipped) setFlipped(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, flipped, gapPx])

  return [ref, flipped]
}

interface PinProps {
  annotationId: string
  transform: string
  color: string
  events: 'auto' | 'none'
  faded: boolean
  active: boolean
}

/** The marker stuck in the drawing: a large invisible target with a small
 *  visible dot at its centre. What a finger has to land on is 44px across while
 *  what the eye sees stays a dot — one is a control and the other is a mark on
 *  a picture, and they have no reason to be the same size.
 *
 *  `active` is on while the note is open for editing or being dragged: both are
 *  states in which the next press means something other than it usually would,
 *  so the pin says which one it is in rather than leaving the only evidence to
 *  be a bubble that may be somewhere else entirely. */
function Pin({ annotationId, transform, color, events, faded, active }: PinProps) {
  return (
    <div
      {...{ [ANNOTATION_ID_ATTR]: annotationId, [ANNOTATION_PART_ATTR]: 'pin' }}
      className={styles.annotationPinHit}
      style={{ transform, width: PIN_HIT_PX, height: PIN_HIT_PX, pointerEvents: events }}
    >
      <span
        className={active ? `${styles.annotationPin} ${styles.annotationPinActive}` : styles.annotationPin}
        style={{
          width: PIN_RADIUS_PX * 2,
          height: PIN_RADIUS_PX * 2,
          background: color,
          opacity: faded ? 0.25 : undefined,
        }}
      />
    </div>
  )
}

interface BubbleProps {
  annotationId: string
  text: string
  color: string
  fontSize: number
  x: number
  y: number
  pinned: (x: number, y: number, dx: number, dy: number) => string
  /** Only as effect dependencies — the geometry itself comes through `pinned`.
   *  Named explicitly because `pinned` is a fresh closure every render, so
   *  depending on it would be the same as depending on nothing. */
  zoom: number
  angle: number
  interactive: boolean
  events: 'auto' | 'none'
  faded: boolean
}

/** One committed note. */
function Bubble({
  annotationId, text, color, fontSize, x, y, pinned, zoom, angle, interactive, events, faded,
}: BubbleProps) {
  const [ref, flipped] = useEdgeFlip(PIN_RADIUS_PX + BUBBLE_OFFSET_PX, [x, y, text, fontSize, zoom, angle])
  const dx = flipped ? -(PIN_RADIUS_PX + BUBBLE_OFFSET_PX) : PIN_RADIUS_PX + BUBBLE_OFFSET_PX

  return (
    <div
      ref={ref}
      {...{ [ANNOTATION_ID_ATTR]: annotationId, [ANNOTATION_PART_ATTR]: 'bubble' }}
      className={flipped ? `${styles.annotationBubble} ${styles.annotationBubbleFlipped}` : styles.annotationBubble}
      style={{
        transform: `${pinned(x, y, dx, -PIN_RADIUS_PX)}${flipped ? ' translateX(-100%)' : ''}`,
        maxWidth: BUBBLE_MAX_WIDTH_PX,
        fontSize,
        [flipped ? 'borderRightColor' : 'borderLeftColor']: color,
        pointerEvents: events,
        opacity: faded ? 0.25 : undefined,
      }}
    >
      <span className={styles.annotationBubbleText}>{text}</span>
      {interactive && (
        <span
          {...{ [ANNOTATION_ID_ATTR]: annotationId, [ANNOTATION_PART_ATTR]: 'delete' }}
          className={styles.annotationBubbleDelete}
          style={{ pointerEvents: events }}
        ><Icon name="delete" /></span>
      )}
    </div>
  )
}

interface DraftEditorProps {
  draft: AnnotationDraft
  pinned: (x: number, y: number, dx: number, dy: number) => string
  zoom: number
  angle: number
  onChange: (text: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** The open note: the same bubble, with a `<textarea>` and its two controls.
 *
 *  A real textarea, for one reason that outranks every other consideration: it
 *  is what raises the on-screen keyboard. A caret drawn onto the canvas would
 *  look better and be unusable on the device this feature was asked for.
 *
 *  **Return breaks the line; it does not commit.** It used to, with Shift+Enter
 *  for a newline — the shape of a message box. That shape assumes a Shift key,
 *  and the device this was built for has none, so on a phone a remark could not
 *  be given a second line at all. Now Return does what its glyph says and
 *  finishing is the tick (or a tap anywhere else on the drawing, or Ctrl+Enter
 *  for anyone who reaches for it out of habit).
 *
 *  The editor is under the catcher in z-order and still receives keystrokes,
 *  because keyboard focus does not care about stacking: the press that opens a
 *  note lands on the catcher, and this then takes focus programmatically. Its
 *  two controls are hit-tested from that same catcher, like everything else in
 *  this overlay. */
function DraftEditor({ draft, pinned, zoom, angle, onChange, onCommit, onCancel }: DraftEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [boxRef, flipped] = useEdgeFlip(PIN_RADIUS_PX + BUBBLE_OFFSET_PX, [draft.x, draft.y, draft.text, draft.size, zoom, angle])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Caret at the end, not select-all: an existing note is opened to be added
    // to or corrected far more often than replaced wholesale, and select-all
    // makes the next keystroke destroy it.
    el.setSelectionRange(el.value.length, el.value.length)
  }, [draft.annotationId])

  // Grow to fit rather than scroll: a note is short, and an inner scrollbar on
  // a box floating over a drawing hides the very text being written.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.text, draft.size])

  const id = draft.annotationId ?? 'draft'
  const dx = flipped ? -(PIN_RADIUS_PX + BUBBLE_OFFSET_PX) : PIN_RADIUS_PX + BUBBLE_OFFSET_PX

  return (
    <div
      ref={boxRef}
      {...{ [ANNOTATION_ID_ATTR]: id, [ANNOTATION_PART_ATTR]: 'bubble' }}
      className={flipped
        ? `${styles.annotationBubble} ${styles.annotationBubbleEditing} ${styles.annotationBubbleFlipped}`
        : `${styles.annotationBubble} ${styles.annotationBubbleEditing}`}
      style={{
        transform: `${pinned(draft.x, draft.y, dx, -PIN_RADIUS_PX)}${flipped ? ' translateX(-100%)' : ''}`,
        maxWidth: BUBBLE_MAX_WIDTH_PX,
        fontSize: draft.size,
        [flipped ? 'borderRightColor' : 'borderLeftColor']: draft.color,
      }}
    >
      <textarea
        ref={inputRef}
        className={styles.annotationInput}
        value={draft.text}
        maxLength={MAX_ANNOTATION_TEXT_LENGTH}
        rows={1}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          // Never let the editor's keys reach the room: Room binds single-key
          // hotkeys on the document (editorKeys), so without this, typing a
          // note would also be switching tools.
          e.stopPropagation()
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit() }
        }}
      />
      <span className={styles.annotationEditorActions}>
        {/* Deleting from inside the editor, not only from a committed note: the
            moment someone decides a remark was a mistake is usually while still
            writing it, and the only way out of that used to be selecting the
            text and clearing it. Absent for a note that does not exist yet —
            there, "delete" is what Esc already means, and an empty draft
            records nothing anyway. */}
        {draft.annotationId !== null && (
          <span
            {...{ [ANNOTATION_ID_ATTR]: draft.annotationId, [ANNOTATION_PART_ATTR]: 'delete' }}
            className={styles.annotationBubbleDelete}
          ><Icon name="delete" /></span>
        )}
        <span
          {...{ [ANNOTATION_ID_ATTR]: id, [ANNOTATION_PART_ATTR]: 'done' }}
          className={styles.annotationBubbleDone}
        ><Icon name="check" /></span>
      </span>
    </div>
  )
}
