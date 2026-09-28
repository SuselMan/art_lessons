import { useEffect, useState } from 'react'
import clsx from 'clsx'

import type { AssignmentSummary } from '@grafetto/shared'

import { useT, type TFunction } from '../../i18n'
import { Icon } from '../../components/Icon'
import type { GridTile } from '../../lib/boards/classMode'
import { apiPath } from '../../lib/api/api'

import styles from './ClassGrid.module.css'

interface ClassGridProps {
  /** The assignment whose works these are — the one opened from the Class
   *  tab, not necessarily the one the class is on. */
  assignment: AssignmentSummary
  /** Whether the class is on this assignment right now. */
  isCurrent: boolean
  tiles: GridTile[]
  isTeacher: boolean
  /** The board this client is on, framed like the strip frames its page. */
  currentId: string | null
  spotlightBoardId: string | null
  onOpen: (boardId: string) => void
  onClose: () => void
  /** "Все ко мне" — shown while the class is on this assignment. */
  onGather: () => void
  /** "Вернуть всех сюда" — shown while it is not. */
  onSendHere: () => void
  onSpotlight: (boardId: string | null) => void
  onLowerHand: (userId: string) => void
}

/** How long ago a preview was baked, in words. Previews arrive every few
 *  seconds while someone draws, so minutes are the unit that says anything:
 *  "just now" is a student at work, "12 min" is one who has stopped. */
function updatedAgo(at: string | undefined, now: number, t: TFunction): string {
  if (!at) return t('class.notStarted')
  const minutes = Math.floor((now - Date.parse(at)) / 60_000)
  if (minutes < 1) return t('class.updatedJustNow')
  return t('class.updatedMinutes', { n: minutes })
}

/** (#595, ADR 015 §6, §11) All the works of one assignment at a glance — the
 *  big view behind the Class tab's "Все работы": one tile per student's board — its live preview, the student's name, whether they
 *  are here, a raised hand, how fresh the picture is. Raised hands first,
 *  then by name (see lib/boards/classMode's classGrid). A tap goes to the board.
 *
 *  The teacher's version also carries the controls: showing one work to
 *  everyone, and moving the class — "Все ко мне" from here, or "Вернуть всех
 *  сюда" when it is elsewhere. Students get it read-only, and only when the
 *  lesson shows work to the class; what they may open is what the server put
 *  in their list.
 *
 *  An overlay over the canvas rather than a page: the teacher dips into it
 *  between two students, and leaving the editor would tear the engine down
 *  for nothing. */
export function ClassGrid({
  assignment, isCurrent, tiles, isTeacher, currentId, spotlightBoardId,
  onOpen, onClose, onGather, onSendHere, onSpotlight, onLowerHand,
}: ClassGridProps) {
  const t = useT()
  // "N min ago" has to move on its own while the grid is open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.backdrop} onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <section className={styles.panel} role="dialog" aria-label={t('class.title')}>
        <header className={styles.head}>
          <Icon name="grid_view" />
          <h2 className={styles.title}>{assignment.name}</h2>
          <span className={styles.spacer} />
          {isTeacher && spotlightBoardId && tiles.some(tile => tile.board.id === spotlightBoardId) && (
            <button type="button" className={styles.headAction} onClick={() => onSpotlight(null)}>
              <Icon name="visibility_off" />
              <span>{t('class.spotlightOff')}</span>
            </button>
          )}
          {isTeacher && (
            <button
              type="button"
              className={clsx(styles.headAction, styles.headActionPrimary)}
              onClick={isCurrent ? onGather : onSendHere}
            >
              <Icon name={isCurrent ? 'group' : 'move_down'} />
              <span>{t(isCurrent ? 'class.gather' : 'class.sendHere')}</span>
            </button>
          )}
          <button type="button" className={styles.close} onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </header>

        {tiles.length === 0 && <p className={styles.empty}>{t('class.noStudents')}</p>}

        {tiles.length > 0 && (
          <div className={styles.grid}>
            {tiles.map(({ board, present, handRaised }) => {
              const lit = board.id === spotlightBoardId
              return (
                <div
                  key={board.id}
                  role="button"
                  tabIndex={0}
                  className={clsx(styles.tile, board.id === currentId && styles.tileCurrent, lit && styles.tileLit)}
                  onClick={() => onOpen(board.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(board.id) } }}
                  aria-label={board.name}
                >
                  <div className={styles.picture}>
                    {board.thumbnailUpdatedAt ? (
                      <img
                        src={apiPath('GET /api/rooms/:roomId/thumbnail', { params: { roomId: board.id }, query: { v: board.thumbnailUpdatedAt } })}
                        alt=""
                        draggable={false}
                      />
                    ) : (
                      <Icon name="draw" />
                    )}
                    {handRaised && (
                      <span className={styles.hand} title={t('class.handRaised')}>
                        <Icon name="pan_tool" />
                      </span>
                    )}
                    {lit && (
                      <span className={styles.lit} title={t('class.spotlightOn')}>
                        <Icon name="star" />
                      </span>
                    )}
                  </div>
                  <div className={styles.meta}>
                    <span
                      className={clsx(styles.dot, present && styles.dotHere)}
                      title={t(present ? 'class.present' : 'class.absent')}
                    />
                    <span className={styles.name}>{board.name}</span>
                    {isTeacher && (
                      // The tile's own click opens the board; these two act on
                      // it from the grid, so they stop it.
                      <span className={styles.tileActions} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        {handRaised && (
                          <button
                            type="button"
                            className={styles.tileAction}
                            onClick={() => onLowerHand(board.ownerId!)}
                            title={t('class.lowerHand')}
                            aria-label={t('class.lowerHand')}
                          >
                            <Icon name="pan_tool" />
                          </button>
                        )}
                        <button
                          type="button"
                          className={clsx(styles.tileAction, lit && styles.tileActionOn)}
                          onClick={() => onSpotlight(lit ? null : board.id)}
                          title={t(lit ? 'class.spotlightOff' : 'class.spotlight')}
                          aria-label={t(lit ? 'class.spotlightOff' : 'class.spotlight')}
                          aria-pressed={lit}
                        >
                          <Icon name="star" />
                        </button>
                      </span>
                    )}
                  </div>
                  <span className={styles.updated}>{updatedAgo(board.thumbnailUpdatedAt, now, t)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

interface ClassBarProps {
  /** The student whose board this is. */
  name: string
  lit: boolean
  /** Whether the ‹ › arrows have anywhere to go. */
  canStep: boolean
  /** Annotations are the default here; "править в работе" is this off. */
  annotating: boolean
  onGrid: () => void
  onStep: (step: -1 | 1) => void
  onSpotlight: () => void
  onAnnotatingChange: (next: boolean) => void
}

/** (#595, ADR 015 §6) The teacher's bar on a student's board: back to the
 *  grid, the student's name with ‹ › to walk to the next one in the grid's
 *  order, "show everyone", and the switch between remarking over the work
 *  (annotations — the default on entry) and correcting in it. */
export function ClassBar({ name, lit, canStep, annotating, onGrid, onStep, onSpotlight, onAnnotatingChange }: ClassBarProps) {
  const t = useT()
  return (
    <div className={styles.bar} role="toolbar" aria-label={t('class.barLabel', { name })}>
      <button type="button" className={styles.barBtn} onClick={onGrid}>
        <Icon name="grid_view" />
        <span>{t('class.title')}</span>
      </button>
      <span className={styles.barDivider} />
      <button type="button" className={styles.barIcon} onClick={() => onStep(-1)} disabled={!canStep} aria-label={t('class.previous')} title={t('class.previous')}>
        <Icon name="chevron_left" />
      </button>
      <span className={styles.barName}>{name}</span>
      <button type="button" className={styles.barIcon} onClick={() => onStep(1)} disabled={!canStep} aria-label={t('class.next')} title={t('class.next')}>
        <Icon name="chevron_right" />
      </button>
      <span className={styles.barDivider} />
      <button type="button" className={clsx(styles.barBtn, lit && styles.barBtnOn)} onClick={onSpotlight} aria-pressed={lit}>
        <Icon name="star" />
        <span>{t(lit ? 'class.spotlightOff' : 'class.spotlight')}</span>
      </button>
      <button
        type="button"
        className={clsx(styles.barBtn, !annotating && styles.barBtnOn)}
        onClick={() => onAnnotatingChange(!annotating)}
        aria-pressed={!annotating}
        title={t('class.editInWorkHint')}
      >
        <Icon name="brush" />
        <span>{t('class.editInWork')}</span>
      </button>
    </div>
  )
}
