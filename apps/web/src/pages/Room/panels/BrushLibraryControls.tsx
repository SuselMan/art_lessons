import { importedBrushes } from '../../../engine/brushLibrary'
import { useT } from '../../../i18n'
import { apiPath } from '../../../lib/api/api'
import { useRoomStore } from '../../../stores/roomStore'
import styles from './BrushLibraryControls.module.css'

/** Uploads and personal ownership are managed in the gallery. This panel
 * retains project export and diagnostics for the brush currently in hand. */
export function BrushLibraryControls(): React.JSX.Element {
  const t = useT()
  const roomId = useRoomStore(s => s.boardId)
  const selected = useRoomStore(s => s.toolSettings.digitalBrush.brush)
  useRoomStore(s => s.brushLibraryRevision)
  const brush = importedBrushes().find(b => b.descriptor.id === selected)
  return <section className={styles.library} aria-label={t('brushLibrary.title')}>
    {roomId && <a className={styles.button} href={apiPath('GET /api/rooms/:id/brush-library/export', { params: { id: roomId } })} download="project.grafetto-brushes.json">{t('brushLibrary.export')}</a>}
    {brush?.compatibility && <details><summary>{t('brushLibrary.compatibility')}</summary>
      <ul className={styles.report}>{brush.compatibility.map((item, i) => <li key={i}>
        <span className={styles.status}>{t(item.status === 'supported' ? 'brushLibrary.supported' : item.status === 'approximate' ? 'brushLibrary.approximate' : 'brushLibrary.unsupported')}</span>
        {' '}{item.feature}<p>{item.detail}</p>
      </li>)}</ul>
    </details>}
  </section>
}
