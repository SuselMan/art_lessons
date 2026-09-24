import { useState } from 'react'
import clsx from 'clsx'

import type { BoardSummary, Participant } from '@grafetto/shared'

import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import { Menu } from '../../components/Menu'

import styles from './BoardStrip.module.css'

interface BoardStripProps {
  boards: BoardSummary[]
  /** The lesson's own id — its first board, pinned first and never deleted. */
  lessonId: string
  /** The board this client is on; null while the first one is still loading. */
  currentId: string | null
  /** The teacher's board (never null: the lesson stands in for "none"). */
  teacherId: string
  /** Everyone in the lesson, each with the board they are on. */
  participants: Participant[]
  /** Whether the owner's controls — "+", rename, move, delete — are shown.
   *  The phone shell (#512) passes false even for the owner: there the strip
   *  is for turning pages, not for editing the lesson. */
  canEdit: boolean
  compact: boolean
  /** A request is in flight — the "+" is held until it lands, so one tap
   *  makes one board. */
  busy: boolean
  onSelect: (boardId: string) => void
  onClose: () => void
  onCreate: () => void
  onRename: (boardId: string, name: string) => void
  onMove: (boardId: string, direction: -1 | 1) => void
  onDelete: (boardId: string) => void
  /** (#595) A student's own board in the latest round, if any — shown in the
   *  strip as "Моя работа" rather than under its name (which is theirs). */
  ownWorkId?: string
  /** (#595) The teacher's "Раздать задание" beside the "+"; absent for
   *  everyone else. `classActive` turns it into "Класс" while a round runs:
   *  one round at a time, and the way to the running one is the grid. */
  onClassAction?: () => void
  classActive?: boolean
}

/** (#176, ADR 014 §7 step 4) The strip of a lesson's boards, dropped down
 *  under the header: one tile per board — picture, name, who is on it — with
 *  the current one framed and the teacher's marked.
 *
 *  Thumbnails come from the same endpoint the lesson list uses, keyed by
 *  `thumbnailUpdatedAt` for cache-busting. That key is as of join time (the
 *  server does not announce thumbnails live) plus whatever this client baked
 *  itself on leaving a page (see the engine cleanup in Room/index.tsx) — so
 *  the picture of a page *someone else* drew on refreshes on the next reload,
 *  and that is an accepted gap of the first cut.
 *
 *  The tile is a `div[role=button]`, not a `<button>`: it holds the "⋮" menu
 *  trigger, and a button inside a button is invalid HTML that browsers repair
 *  by moving the inner one out. */
export function BoardStrip({
  boards, lessonId, currentId, teacherId, participants, canEdit, compact, busy,
  onSelect, onClose, onCreate, onRename, onMove, onDelete, ownWorkId, onClassAction, classActive,
}: BoardStripProps) {
  const t = useT()
  // Non-null *is* the editing state, same as the header's own rename: the
  // two cannot disagree.
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null)

  const submitRename = () => {
    const edit = renaming
    setRenaming(null)
    if (!edit) return
    const name = edit.draft.trim()
    const previous = boards.find(b => b.id === edit.id)?.name
    if (name && name !== previous) onRename(edit.id, name)
  }

  const countOn = (boardId: string) => participants.filter(p => p.boardId === boardId).length

  return (
    <section className={clsx(styles.strip, compact && styles.stripCompact)} aria-label={t('boards.title')}>
      <div className={styles.head}>
        <span>{t('boards.title')}</span>
        <span className={styles.headSpacer} />
        <button type="button" className={styles.headBtn} onClick={onClose} title={t('boards.close')} aria-label={t('boards.close')}>
          <Icon name="close" />
        </button>
      </div>
      <div className={styles.row}>
        {boards.map((board, index) => {
          const isCurrent = board.id === currentId
          const isTeacher = board.id === teacherId
          const people = countOn(board.id)
          const isRenaming = renaming?.id === board.id
          return (
            <div
              key={board.id}
              role="button"
              tabIndex={0}
              aria-pressed={isCurrent}
              // (#595) The name the tile shows, so a screen reader and the
              // eye agree on "Моя работа" rather than on the student's name.
              aria-label={board.id === ownWorkId ? t('class.myWork') : board.name}
              className={clsx(styles.tile, isCurrent && styles.tileCurrent)}
              onClick={() => { if (!isRenaming) onSelect(board.id) }}
              onKeyDown={e => {
                if (isRenaming) return
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(board.id) }
              }}
            >
              <div className={styles.picture}>
                {board.thumbnailUpdatedAt ? (
                  <img
                    src={`/api/rooms/${board.id}/thumbnail?v=${encodeURIComponent(board.thumbnailUpdatedAt)}`}
                    alt=""
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <Icon name="draw" />
                )}
                {isTeacher && (
                  <span className={styles.teacher} title={t('boards.teacherHere')} aria-label={t('boards.teacherHere')}>
                    <Icon name="school" />
                  </span>
                )}
                {people > 0 && (
                  <span className={styles.count} title={t('boards.people', { n: people })}>{people}</span>
                )}
              </div>
              <div className={styles.nameRow}>
                {isRenaming ? (
                  <input
                    className={styles.nameInput}
                    autoFocus
                    value={renaming.draft}
                    aria-label={t('boards.rename')}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setRenaming({ id: board.id, draft: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      e.stopPropagation()
                      if (e.key === 'Enter') { e.preventDefault(); submitRename() }
                      if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
                    }}
                    onBlur={submitRename}
                  />
                ) : (
                  <span className={styles.name} title={isCurrent ? t('boards.youAreHere') : board.name}>
                    {board.id === ownWorkId ? t('class.myWork') : board.name}
                  </span>
                )}
                {canEdit && !isRenaming && board.id !== ownWorkId && (
                  // Stops the tile's own click: opening the menu is not a page
                  // turn. Menu's trigger already stops propagation of the
                  // click; this wrapper covers the keyboard path too.
                  <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <Menu
                      triggerClassName={styles.menuTrigger}
                      triggerLabel={t('common.moreActions')}
                      trigger={<Icon name="more_vert" />}
                      actions={[
                        { label: t('boards.rename'), icon: 'edit', onClick: () => setRenaming({ id: board.id, draft: board.name }) },
                        {
                          label: t('boards.moveLeft'), icon: 'chevron_left',
                          onClick: () => onMove(board.id, -1),
                          // The lesson's own board is pinned first (ADR 014 §2);
                          // the one right after it has nowhere to go either.
                          disabled: board.id === lessonId || index <= 1,
                        },
                        {
                          label: t('boards.moveRight'), icon: 'chevron_right',
                          onClick: () => onMove(board.id, 1),
                          disabled: board.id === lessonId || index >= boards.length - 1,
                        },
                        ...(board.id === lessonId ? [] : [{
                          label: t('boards.delete'), icon: 'delete' as const, danger: true,
                          onClick: () => onDelete(board.id),
                        }]),
                      ]}
                    />
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {canEdit && (
          <button type="button" className={styles.add} onClick={onCreate} disabled={busy} title={t('boards.add')}>
            <Icon name="add" />
            <span>{t('boards.add')}</span>
          </button>
        )}
        {onClassAction && (
          <button type="button" className={styles.add} onClick={onClassAction}>
            <Icon name="grid_view" />
            <span>{t(classActive ? 'class.open' : 'class.startStrip')}</span>
          </button>
        )}
      </div>
    </section>
  )
}

interface TeacherChipProps {
  /** What the chip says — where following would take this student (#595:
   *  the teacher's board, their own work, or a work being shown to all). */
  text: string
  /** Whether the strip is open below the header, so the chip moves out of
   *  its way. */
  stripOpen: boolean
  onReturn: () => void
}

/** (#176, ADR 014 §3) "Teacher is on …" — shown to a student who picked
 *  another board by hand. One tap goes to the teacher's board and switches
 *  following back on; the chip is the only way back into following, which is
 *  why it is a chip and not a line in a panel. */
export function TeacherChip({ text, stripOpen, onReturn }: TeacherChipProps) {
  const t = useT()
  return (
    <button
      type="button"
      className={clsx(styles.chip, stripOpen && styles.chipBelowStrip)}
      onClick={onReturn}
      title={t('boards.returnToTeacher')}
    >
      <Icon name="school" />
      <span className={styles.chipText}>{text}</span>
    </button>
  )
}
