import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listRoomsAt } from '../../lib/api'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import styles from './MoveToDialog.module.css'

interface MoveToDialogProps {
  title: string
  onCancel: () => void
  onSelect: (folderId: string | null) => void
}

/** Folder-only picker for "Move to..." (#211 epic, #216) — a self-contained
 *  mini folder-browser reusing the same `listRoomsAt` (#215) as MyLessons'
 *  own breadcrumb browsing, but with its own independent navigation state
 *  and ignoring the `rooms` half of each response. Deliberately avoids
 *  needing a "flat list of every folder" endpoint — reparent cycle-checking
 *  still happens server-side regardless of how the destination was picked. */
export function MoveToDialog({ title, onCancel, onSelect }: MoveToDialogProps) {
  const t = useT()
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : undefined

  const { data } = useQuery({
    queryKey: ['rooms', 'moveToPicker', currentFolderId ?? 'root'],
    queryFn: () => listRoomsAt(currentFolderId),
  })

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

      <button type="button" className={styles.moveHereButton} onClick={() => onSelect(currentFolderId ?? null)}>
        {t('moveTo.moveHere')}
      </button>

      <div className={styles.folderList}>
        {data === undefined ? (
          <div className={styles.loading}>{t('common.loading')}</div>
        ) : data.folders.length === 0 ? (
          <div className={styles.noFolders}>{t('moveTo.noSubfolders')}</div>
        ) : (
          data.folders.map(folder => (
            <button
              key={folder.id}
              type="button"
              className={styles.folderRow}
              onClick={() => setPath(p => [...p, { id: folder.id, name: folder.name }])}
            >
              <Icon name="folder" />
              <span>{folder.name}</span>
              <Icon name="chevron_right" />
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
