import { useEffect, useState } from 'react'
import { NATIVE_GALLERY_BRUSHES, type BrushLibrary } from '@grafetto/shared'
import Button from '../../../../../packages/UiKit/components/Button/Button'
import { api } from '../../lib/api/api'
import { TOOL_DISPLAY } from '../FloatingToolPanel/tools'
import { TOOL_PHOTOS } from '../../lib/tools/toolTypeImages'
import { useT } from '../../i18n'
import { BrushGallery } from './BrushGallery'
import styles from './BrushGallery.module.css'
export function BrushSetPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const t = useT(), [open, setOpen] = useState(false)
  const [library, setLibrary] = useState<BrushLibrary | null>(null), [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    if (!value.length) { setLibrary(null); return }
    setError(false)
    void api('POST /api/brush-gallery/resolve', { body: { references: value } }).then(data => { if (live) setLibrary(data) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [value])
  return <section aria-label={t('gallery.title')}>
    {error && <p role="alert">{t('gallery.loadFailed')}</p>}
    {NATIVE_GALLERY_BRUSHES.filter(b => value.includes(b.reference)).map(b => <div className={styles.row} key={b.reference}><img className={styles.artwork} src={TOOL_PHOTOS[b.reference.slice(7)]} alt="" /><span className={styles.name}>{t(TOOL_DISPLAY[b.tool].labelKey)}</span>{library?.nativePreviews?.[b.tool] && <img className={styles.stroke} src={library.nativePreviews[b.tool]} alt="" loading="lazy" />}<Button size="md" type="ghost" disabled={value.length === 1} onClick={() => onChange(value.filter(v => v !== b.reference))}>{t('gallery.remove')}</Button></div>)}
    {library?.brushes.map(brush => {
      const ref = `brush:${brush.descriptor.id}@${brush.descriptor.version}`
      return <div className={styles.row} key={ref}>{brush.preview && <img className={styles.artwork} src={brush.preview} alt="" />}<span className={styles.name}>{brush.name}</span>{brush.strokePreview && <img className={styles.stroke} src={brush.strokePreview} alt="" loading="lazy" />}<Button size="md" type="ghost" disabled={value.length === 1} onClick={() => onChange(value.filter(v => v !== ref))}>{t('gallery.remove')}</Button></div>
    })}
    <Button size="md" type="secondary" onClick={() => setOpen(true)}>{t('gallery.more')}</Button>
    {open && <BrushGallery selected={value} onClose={() => setOpen(false)} onAdd={reference => onChange([...new Set([...value, reference])])} />}
  </section>
}
