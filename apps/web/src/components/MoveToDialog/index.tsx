import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listRoomsAt } from '../../lib/api'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import styles from './MoveToDialog.module.css'

interface MoveToDialogProps {
  title: string
  /** Where the item being moved sits right now (null = root). The one
   *  destination that is never offered — "move here" into the folder it is
   *  already in is a no-op the dialog shouldn't propose (#360). */
  currentParentId: string | null
  /** Set when a *folder* is being moved: that folder is hidden from the list,
   *  so it can't be entered and then picked as its own parent. The server
   *  refuses the cycle anyway; this keeps it off the screen. */
  excludeFolderId?: string
  onCancel: () => void
  onSelect: (folderId: string | null) => void
}

/** Folder-only picker for "Move to..." (#211 epic, #216) — a self-contained
 *  mini folder-browser reusing the same `listRoomsAt` (#215) as MyLessons'
 *  own breadcrumb browsing, but with its own independent navigation state
 *  and ignoring the `rooms` half of each response. Deliberately avoids
 *  needing a "flat list of every folder" endpoint — reparent cycle-checking
 *  still happens server-side regardless of how the destination was picked. */
export function MoveToDialog({
  title,
  currentParentId,
  excludeFolderId,
  onCancel,
  onSelect,
}: MoveToDialogProps) {
  const t = useT()
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : undefined

  const { data } = useQuery({
    queryKey: ['rooms', 'moveToPicker', currentFolderId ?? 'root'],
    queryFn: () => listRoomsAt(currentFolderId),
  })

  const folders = data?.folders.filter(f => f.id !== excludeFolderId)
  const isAlreadyHere = (currentFolderId ?? null) === currentParentId

  return (
    <Modal title={title} size="md" onClose={onCancel}>
      <nav className={styles.breadcrumbs} aria-label={t('moveTo.destinationLabel')}>
        <button
          type="button"
          className={styles.crumb}
          onClick={() => setPath([])}
          disabled={path.length === 0}
        >
          {t('lessons.root')}
        </button>
        {path.map((crumb, i) => (
          <span key={crumb.id} className={styles.crumbGroup}>
            <span className={styles.crumbSep}>/</span>
            <button
              type="button"
              className={styles.crumb}
              onClick={() => setPath(p => p.slice(0, i + 1))}
              disabled={i === path.length - 1}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className={styles.folderList}>
        {folders === undefined ? (
          <div className={styles.loading}>{t('common.loading')}</div>
        ) : folders.length === 0 ? (
          <div className={styles.noFolders}>{t('moveTo.noSubfolders')}</div>
        ) : (
          folders.map(folder => (
            <button
              key={folder.id}
              type="button"
              className={styles.folderRow}
              onClick={() => setPath(p => [...p, { id: folder.id, name: folder.name }])}
            >
              <Icon name="folder" />
              <span className={styles.folderName}>{folder.name}</span>
              <Icon name="chevron_right" />
            </button>
          ))
        )}
      </div>

      {/* Footer under the list, not above it: the list is what you navigate,
          the button is what ends the dialog. When this level is where the
          item already lives there is nothing to confirm — say that instead of
          offering a no-op move. */}
      <div className={styles.footer}>
        {isAlreadyHere ? (
          <span className={styles.alreadyHere}>{t('moveTo.alreadyHere')}</span>
        ) : (
          <button
            type="button"
            className={styles.moveHereButton}
            onClick={() => onSelect(currentFolderId ?? null)}
          >
            {t('moveTo.moveHere')}
          </button>
        )}
      </div>
    </Modal>
  )
}
