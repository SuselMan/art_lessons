import type { StateCreator } from 'zustand'

import type { Operation } from '@grafetto/shared'

import { makeInitialAnnotationState, replayAnnotations, type AnnotationState } from '../../lib/annotations'

/** An open text annotation — the caret is in it and nothing has been recorded
 *  yet. Kept in the store rather than in the overlay's own `useState` because
 *  two unrelated places have to see it: the overlay renders the input, and
 *  Room has to commit it when the tool changes, the room closes, or the user
 *  taps elsewhere. A draft that only the overlay knew about would be silently
 *  lost by every one of those.
 *
 *  `annotationId` is null for a new note and set when an existing one is being
 *  edited — the same draft shape either way, so commit has one path instead of
 *  two that can disagree about what "empty" means. */
export interface AnnotationDraft {
  annotationId: string | null
  x: number
  y: number
  text: string
  /** Carried on the draft rather than read from the tool settings at commit
   *  time: editing an existing note must keep *its* colour and size, not
   *  silently restyle it to whatever the toolbar happens to be set to. For a
   *  new note the tool settings are what seed these. */
  color: string
  size: number
}

export interface AnnotationSlice {
  /** Derived from the operation log, never written directly — the projection
   *  described in lib/annotations.ts. */
  annotations: AnnotationState
  syncAnnotationsFromLog: (ops: readonly Operation[]) => void

  /** (#511) Whether this reader has hidden the annotation overlay.
   *
   *  Local render state, deliberately not an operation and deliberately not
   *  `layer_visibility`: that one travels in the log and would blank the
   *  remarks for every participant at once. "Let me see my drawing clean for a
   *  second" is a private act; "take these down for everybody" is a different
   *  action that nobody has asked for yet.
   *
   *  Reset with the rest of the room store on mount, so it never leaks from
   *  one room into the next. */
  annotationsHidden: boolean
  setAnnotationsHidden: (hidden: boolean) => void

  /** (#509 v2) Which notes this reader has folded down to their pin.
   *
   *  Local, like `annotationsHidden` and for the same reason: collapsing a
   *  remark is "let me see the drawing under it", which is a private act. As an
   *  operation it would fold the note on the author's screen too and land on
   *  everyone's undo stack, so one participant tidying their own view would be
   *  editing someone else's.
   *
   *  A record rather than a Set because the store is compared by reference per
   *  field and a mutated Set would not re-render. */
  collapsedAnnotationIds: Record<string, true>
  toggleAnnotationCollapsed: (annotationId: string) => void

  annotationDraft: AnnotationDraft | null
  openAnnotationDraft: (draft: AnnotationDraft) => void
  setAnnotationDraftText: (text: string) => void
  closeAnnotationDraft: () => void
}

export const createAnnotationSlice: StateCreator<AnnotationSlice> = set => ({
  annotations: makeInitialAnnotationState(),
  syncAnnotationsFromLog: ops => set({ annotations: replayAnnotations(ops) }),

  annotationsHidden: false,
  setAnnotationsHidden: hidden => set({ annotationsHidden: hidden }),

  collapsedAnnotationIds: {},
  toggleAnnotationCollapsed: annotationId => set(state => {
    const next = { ...state.collapsedAnnotationIds }
    if (next[annotationId]) delete next[annotationId]
    else next[annotationId] = true
    return { collapsedAnnotationIds: next }
  }),

  annotationDraft: null,
  openAnnotationDraft: draft => set({ annotationDraft: draft }),
  setAnnotationDraftText: text => set(state => (
    state.annotationDraft ? { annotationDraft: { ...state.annotationDraft, text } } : {}
  )),
  closeAnnotationDraft: () => set({ annotationDraft: null }),
})
