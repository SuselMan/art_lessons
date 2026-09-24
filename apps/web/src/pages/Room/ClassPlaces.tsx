import { useState } from 'react'
import clsx from 'clsx'

import type { AssignmentSummary } from '@grafetto/shared'

import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'

import styles from './ClassPlaces.module.css'

interface ClassPlacesProps {
  isTeacher: boolean
  assignments: AssignmentSummary[]
  /** Where the class is: an assignment, or null — with the teacher. */
  activeAssignmentId: string | null
  /** The work being shown to everyone, if any. */
  spotlight: { name: string } | null
  /** A student's own board in each assignment they have one in. */
  ownBoards: ReadonlyMap<string, string>
  /** The board this client is on, to mark "you are here". */
  currentBoardId: string | null
  /** The teacher's board, where "with the teacher" leads. */
  teacherBoardId: string
  /** Whether "all works" is offered — always to the teacher, to a student
   *  only when the lesson shows work to the class. */
  canOpenGrid: boolean
  busy: boolean
  defaultName: string
  onGather: () => void
  onSendTo: (assignmentId: string) => void
  onStart: (name: string) => void
  onOpenGrid: (assignmentId: string) => void
  onGoto: (boardId: string) => void
  onSpotlightOff: () => void
}

/** (#595, ADR 015 §11) "Where the class is", at the top of the Class tab.
 *
 *  For the teacher: the places the class can be — with the teacher, or on one
 *  of the lesson's assignments — with the current one marked and a one-tap
 *  "send everyone here" on each of the others; below them, a new assignment.
 *  Nothing ends: "Все ко мне" and back is the ordinary rhythm of a lesson.
 *
 *  For a student: the same list read as "my boards" — the teacher's, and their
 *  own in each assignment — so getting back to their work never depends on
 *  where the teacher is. */
export function ClassPlaces({
  isTeacher, assignments, activeAssignmentId, spotlight, ownBoards, currentBoardId, teacherBoardId,
  canOpenGrid, busy, defaultName, onGather, onSendTo, onStart, onOpenGrid, onGoto, onSpotlightOff,
}: ClassPlacesProps) {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)

  // A student who has never been handed anything has nothing to go between.
  if (!isTeacher && ownBoards.size === 0) return null

  // A mark, not a label: the highlighted row already says it, and in a 256px
  // column a pill would take the assignment's own name away from it.
  const here = (
    <span className={styles.here} title={t('class.here')} role="img" aria-label={t('class.here')}>
      <Icon name="group" />
    </span>
  )
  const listed = isTeacher ? assignments : assignments.filter(a => ownBoards.has(a.id))

  return (
    <section className={styles.places} aria-label={t(isTeacher ? 'class.places' : 'class.myBoards')}>
      <h3 className={styles.heading}>{t(isTeacher ? 'class.places' : 'class.myBoards')}</h3>
      <ul className={styles.list}>
        <li className={clsx(styles.row, activeAssignmentId === null && styles.rowActive)}>
          {isTeacher ? (
            <span className={styles.label}>
              <Icon name="school" />
              <span className={styles.name}>{t('class.atTeacher')}</span>
            </span>
          ) : (
            <button
              type="button"
              className={clsx(styles.label, styles.labelBtn, currentBoardId === teacherBoardId && styles.labelCurrent)}
              onClick={() => onGoto(teacherBoardId)}
            >
              <Icon name="school" />
              <span className={styles.name}>{t('class.teacherBoard')}</span>
            </button>
          )}
          {activeAssignmentId === null ? here : isTeacher && (
            <button type="button" className={styles.action} onClick={onGather}>{t('class.gather')}</button>
          )}
        </li>

        {listed.map(assignment => {
          const current = assignment.id === activeAssignmentId
          const own = ownBoards.get(assignment.id)
          return (
            <li key={assignment.id} className={clsx(styles.row, current && styles.rowActive)}>
              {isTeacher || !own ? (
                <span className={styles.label}>
                  <Icon name="draw" />
                  <span className={styles.name} title={assignment.name}>{assignment.name}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className={clsx(styles.label, styles.labelBtn, currentBoardId === own && styles.labelCurrent)}
                  onClick={() => onGoto(own)}
                  title={t('class.toMyWork')}
                >
                  <Icon name="draw" />
                  <span className={styles.name}>{assignment.name}</span>
                </button>
              )}
              {canOpenGrid && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onOpenGrid(assignment.id)}
                  title={t('class.allWorks')}
                  aria-label={t('class.allWorksOf', { name: assignment.name })}
                >
                  <Icon name="grid_view" />
                </button>
              )}
              {current ? here : isTeacher && (
                <button type="button" className={styles.action} onClick={() => onSendTo(assignment.id)}>
                  {t('class.sendHere')}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {isTeacher && spotlight && (
        <div className={styles.spotlight}>
          <Icon name="star" />
          <span className={styles.name}>{t('class.shownToAll', { name: spotlight.name })}</span>
          <button type="button" className={styles.action} onClick={onSpotlightOff}>{t('class.spotlightOff')}</button>
        </div>
      )}

      {isTeacher && (draft === null ? (
        <button type="button" className={styles.add} onClick={() => setDraft(defaultName)}>
          <Icon name="add" />
          {t('class.newAssignment')}
        </button>
      ) : (
        <form
          className={styles.form}
          onSubmit={e => {
            e.preventDefault()
            onStart(draft.trim() || defaultName)
            setDraft(null)
          }}
        >
          <input
            className={styles.input}
            autoFocus
            value={draft}
            maxLength={120}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => e.currentTarget.select()}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setDraft(null) } }}
            aria-label={t('class.assignmentName')}
          />
          <div className={styles.formActions}>
            <button type="submit" className={styles.submit} disabled={busy}>
              {t(busy ? 'common.working' : 'class.start')}
            </button>
            <button type="button" className={styles.cancel} onClick={() => setDraft(null)}>{t('common.cancel')}</button>
          </div>
          <p className={styles.hint}>{t('class.startHint')}</p>
        </form>
      ))}
    </section>
  )
}
