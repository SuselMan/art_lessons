import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { MAX_ANNOTATION_TEXT_LENGTH } from '@grafetto/shared'

import { inkPathData, type AnnotationState } from '../../lib/annotations'
import { ANNOTATION_ID_ATTR } from './annotationHitTest'
import type { AnnotationDraft } from '../../stores/slices/annotationSlice'
import styles from './Room.module.css'

/** How wide a note is allowed to get before it wraps, in multiples of its own
 *  font size. A remark is a sentence or two pinned to a spot on the drawing;
 *  without a wrap width a long one runs off the paper in a single line, and
 *  with one measured in canvas pixels it would wrap differently at every text
 *  size. Tied to the font size instead, so a note keeps its shape whatever
 *  size it is written at.
 *
 *  The same number governs the committed note and the open editor, and it has
 *  to: they wrap identically only if font, size and width all match, and a
 *  note that reflows the moment it is committed is not the note the author
 *  wrote. */
const WRAP_WIDTH_EM = 12


interface AnnotationOverlayProps {
  annotations: AnnotationState
  /** (#511) The local hide toggle. Rendered as "draw nothing" rather than
   *  `visibility: hidden`, so a hidden note is also un-hit-testable — an
   *  invisible thing that still answers a press is the trap #405 pulled the
   *  ruler out of. */
  hidden: boolean
  /** The open text draft, if the caret is in one. */
  draft: AnnotationDraft | null
  onDraftChange: (text: string) => void
  onDraftCommit: () => void
  onDraftCancel: () => void
  /** The ink gesture in progress, in world coordinates — drawn here so the
   *  mark appears under the finger before it is ever recorded. Null between
   *  gestures. */
  liveInk: { points: number[]; color: string; size: number } | null
  /** Handed back to Room so its catcher can hit-test notes. */
  layerRef?: RefObject<HTMLDivElement | null>
}

/** (#508, эпик #87) Draws every annotation over the composite.
 *
 *  Placement convention is the one GridOverlay/RulerOverlay/SelectionOverlay
 *  already use: a child of whichever ancestor carries the viewport transform,
 *  so world coordinates are written straight out and pan/zoom/rotate come for
 *  free with no inverse math here. That is the whole reason annotations cost
 *  the engine nothing — see the contract's doc comment in packages/shared for
 *  what else falls out of it.
 *
 *  Purely presentational, exactly like RulerOverlay and SelectionOverlay, and
 *  for the same reason: every press that creates or edits an annotation is
 *  caught by Room's own `.canvasCatcher`, never here. It could not be
 *  otherwise even if we wanted it — the catcher sits at z-index 4 inside
 *  `.viewport` while this layer lives inside `.worldOverlayWrap`, whose own
 *  `transform` makes it a stacking context that no z-index in here can climb
 *  out of. So a note is never an event target, and the catcher hit-tests
 *  instead (`annotationTextAt`), which is what the ruler already does.
 *
 *  The one exception is the open editor: a `<textarea>` has to receive its own
 *  keystrokes. It sits above the catcher by being portalled nowhere at all —
 *  see its own comment.
 *
 *  Text is HTML and ink is SVG, in one layer. Not an inconsistency: the note
 *  being edited must be a real focusable field (nothing else raises a mobile
 *  keyboard), and a committed note must wrap character-for-character the way
 *  that field did, which is only true if it is the same kind of box. SVG text
 *  would have needed manual tspan line-breaking to approximate what the
 *  browser was already doing in the editor. */
export function AnnotationOverlay({
  annotations, hidden, draft, onDraftChange, onDraftCommit, onDraftCancel, liveInk, layerRef,
}: AnnotationOverlayProps) {
  if (hidden) return null

  const items = annotations.order.map(id => annotations.items[id]).filter(Boolean)

  return (
    <div className={styles.annotationLayer} ref={layerRef}>
      <svg className={styles.annotationInkSvg}>
        {items.map(a => a.kind === 'ink' && (
          <path
            key={a.id}
            d={inkPathData(a.points)}
            fill="none"
            stroke={a.color}
            strokeWidth={a.size}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {liveInk && (
          <path
            d={inkPathData(liveInk.points)}
            fill="none"
            stroke={liveInk.color}
            strokeWidth={liveInk.size}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {items.map(a => a.kind === 'text' && (
        // The note being edited is not drawn twice: the editor below stands in
        // for it, already carrying its text.
        draft?.annotationId === a.id ? null : (
          <div
            key={a.id}
            {...{ [ANNOTATION_ID_ATTR]: a.id }}
            className={styles.annotationText}
            style={{ left: a.x, top: a.y, color: a.color, fontSize: a.size, width: a.size * WRAP_WIDTH_EM }}
          >{a.text}</div>
        )
      ))}
      {draft && (
        <DraftEditor
          draft={draft}
          onChange={onDraftChange}
          onCommit={onDraftCommit}
          onCancel={onDraftCancel}
        />
      )}
    </div>
  )
}

interface DraftEditorProps {
  draft: AnnotationDraft
  onChange: (text: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** The open note. A real `<textarea>`, for one reason that outranks every
 *  other consideration: it is what raises the on-screen keyboard. A caret
 *  drawn onto the canvas would look better and be unusable on the device this
 *  feature was asked for.
 *
 *  Enter commits and Shift+Enter breaks the line — the shape people expect
 *  from a message box rather than from a document, because a remark is a
 *  sentence and finishing it should not mean reaching for the pointer.
 *
 *  It is under the catcher in z-order and still receives its keystrokes,
 *  because keyboard focus does not care about stacking: the press that opens a
 *  note lands on the catcher, and this then takes focus programmatically. Only
 *  a *press* aimed at it would be swallowed — which is exactly what the
 *  catcher's own tap handler turns into "commit this one, open the next". */
function DraftEditor({ draft, onChange, onCommit, onCancel }: DraftEditorProps) {
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
    <textarea
      ref={ref}
      className={styles.annotationInput}
      style={{
        left: draft.x, top: draft.y,
        color: draft.color,
        fontSize: draft.size,
        width: draft.size * WRAP_WIDTH_EM,
      }}
      value={draft.text}
      maxLength={MAX_ANNOTATION_TEXT_LENGTH}
      rows={1}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={e => {
        // Never let the editor's keys reach the room: Room binds single-key
        // hotkeys on the document (editorKeys), so without this, typing a note
        // would also be switching tools.
        e.stopPropagation()
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit() }
      }}
    />
  )
}
