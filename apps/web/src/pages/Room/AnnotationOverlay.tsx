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
  annotations, hidden, collapsedIds, erasingIds, draft, onDraftChange, onDraftCommit,
  onDraftCancel, liveInk, zoom, angle, interactive, layerRef,
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

      {items.map(a => a.kind === 'text' && (
        <div key={a.id}>
          {/* The pin. An SVG circle would have to live in the ink layer and be
              counter-scaled by hand; a div carries the same transform every
              other screen-sized piece here uses. */}
          <div
            {...{ [ANNOTATION_ID_ATTR]: a.id, [ANNOTATION_PART_ATTR]: 'pin' }}
            className={styles.annotationPin}
            style={{
              transform: pinned(a.x, a.y, -PIN_RADIUS_PX, -PIN_RADIUS_PX),
              width: PIN_RADIUS_PX * 2,
              height: PIN_RADIUS_PX * 2,
              background: a.color,
              pointerEvents: events,
              opacity: erasingIds.has(a.id) ? 0.25 : undefined,
            }}
          />
          {/* Folded down to just the pin, or open. The note being edited is not
              drawn twice — the editor below stands in for it. */}
          {!collapsedIds[a.id] && draft?.annotationId !== a.id && (
            <Bubble
              annotationId={a.id}
              text={a.text}
              color={a.color}
              fontSize={a.size}
              pinned={pinned}
              zoom={zoom}
              angle={angle}
              x={a.x}
              y={a.y}
              interactive={interactive}
              events={events}
              faded={erasingIds.has(a.id)}
            />
          )}
        </div>
      ))}

      {draft && (
        <>
          <div
            className={styles.annotationPin}
            style={{
              transform: pinned(draft.x, draft.y, -PIN_RADIUS_PX, -PIN_RADIUS_PX),
              width: PIN_RADIUS_PX * 2,
              height: PIN_RADIUS_PX * 2,
              background: draft.color,
              pointerEvents: 'none',
            }}
          />
          <DraftEditor
            draft={draft}
            transform={pinned(draft.x, draft.y, PIN_RADIUS_PX + BUBBLE_OFFSET_PX, -PIN_RADIUS_PX)}
            onChange={onDraftChange}
            onCommit={onDraftCommit}
            onCancel={onDraftCancel}
          />
        </>
      )}
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

/** One open note.
 *
 *  Its own component only because of the side-flip: a note pinned near the
 *  right edge would otherwise hang off the screen, and on a phone that is most
 *  of them — the paper fills the width, so half the points worth remarking on
 *  are in the right half. Measured after layout rather than predicted, because
 *  predicting it means projecting a world point to screen coordinates, and that
 *  projection is different for bounded and infinite rooms. The browser has
 *  already done it by the time this runs. */
function Bubble({
  annotationId, text, color, fontSize, x, y, pinned, zoom, angle, interactive, events, faded,
}: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [flipped, setFlipped] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // The two directions are tested against *different* edges, which is what
    // makes this settle instead of oscillating: it flips out of the right edge
    // and back only out of the left one. A note can only be caught between the
    // two if it is wider than the window, and it is capped at 210px.
    if (!flipped && rect.right > window.innerWidth) setFlipped(true)
    else if (flipped && rect.left < 0) setFlipped(false)
  }, [x, y, text, fontSize, zoom, angle, flipped])

  const dx = flipped
    ? -(PIN_RADIUS_PX + BUBBLE_OFFSET_PX)
    : PIN_RADIUS_PX + BUBBLE_OFFSET_PX

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
  transform: string
  onChange: (text: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** The open note: the same bubble, with a `<textarea>` in it.
 *
 *  A real textarea, for one reason that outranks every other consideration: it
 *  is what raises the on-screen keyboard. A caret drawn onto the canvas would
 *  look better and be unusable on the device this feature was asked for.
 *
 *  Enter commits and Shift+Enter breaks the line — the shape people expect from
 *  a message box rather than from a document, because a remark is a sentence
 *  and finishing it should not mean reaching for the pointer.
 *
 *  It is under the catcher in z-order and still receives its keystrokes,
 *  because keyboard focus does not care about stacking: the press that opens a
 *  note lands on the catcher, and this then takes focus programmatically. */
function DraftEditor({ draft, transform, onChange, onCommit, onCancel }: DraftEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
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
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.text, draft.size])

  return (
    <div
      className={clsxBubbleEditing()}
      style={{
        transform,
        maxWidth: BUBBLE_MAX_WIDTH_PX,
        fontSize: draft.size,
        borderLeftColor: draft.color,
      }}
    >
      <textarea
        ref={ref}
        className={styles.annotationInput}
        value={draft.text}
        maxLength={MAX_ANNOTATION_TEXT_LENGTH}
        rows={1}
        onChange={e => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => {
          // Never let the editor's keys reach the room: Room binds single-key
          // hotkeys on the document (editorKeys), so without this, typing a
          // note would also be switching tools.
          e.stopPropagation()
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit() }
        }}
      />
    </div>
  )
}

/** The editing bubble wears the same two classes as a committed one, minus the
 *  hover affordances. Extracted only to keep the JSX above readable. */
function clsxBubbleEditing(): string {
  return `${styles.annotationBubble} ${styles.annotationBubbleEditing}`
}
