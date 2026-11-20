import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NATIVE_GALLERY_BRUSHES, type BrushGalleryItem, type BrushGalleryPage, type BrushGalleryTab } from '@grafetto/shared'
import Button from '../../../../../packages/UiKit/components/Button/Button'
import Input from '../../../../../packages/UiKit/components/Input/Input'
import Modal from '../../../../../packages/UiKit/components/Modal/Modal'
import { ApiError, api, apiResponse } from '../../lib/api/api'
import { importBrushFile } from '../../lib/api/brushLibrary'
import { claimModalSlot, releaseModalSlot } from '../Modal/modalSlot'
import { TOOL_DISPLAY } from '../FloatingToolPanel/tools'
import { TOOL_PHOTOS } from '../../lib/tools/toolTypeImages'
import { useT } from '../../i18n'
import styles from './BrushGallery.module.css'

export interface BrushGalleryProps { selected: readonly string[]; selectedItems?: readonly BrushGalleryItem[]; onAdd: (reference: string) => Promise<void> | void; onClose: () => void; onRemove?: (reference: string) => Promise<void> | void; disabled?: boolean }
export function BrushGallery({ selected, onAdd, onClose, onRemove, selectedItems = [], disabled }: BrushGalleryProps) {
  const t = useT()
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => { const slot = { close: () => closeRef.current() }; claimModalSlot(slot); return () => releaseModalSlot(slot) }, [])
  const [tab, setTab] = useState<BrushGalleryTab>('library')
  const [search, setSearch] = useState(''), [role, setRole] = useState(''), [category, setCategory] = useState('')
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState(0)
  const [page, setPage] = useState<BrushGalleryPage | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'converting'>('idle'), [uploadProgress, setUploadProgress] = useState(0)
  const [importResult, setImportResult] = useState<{ count: number; skipped: { name: string; reasons: string[] }[] } | null>(null)
  const file = useRef<HTMLInputElement>(null), uploadAbort = useRef<AbortController | null>(null)
  const previewPoll = useRef({ key: '', attempts: 0 })
  useEffect(() => () => uploadAbort.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    const key = JSON.stringify([tab, search, role, category, offset])
    if (previewPoll.current.key !== key) { previewPoll.current = { key, attempts: 0 }; setPage(null) }
    setError('')
    const timer = setTimeout(() => {
      void apiResponse('GET /api/brush-gallery', { query: { tab, q: search, role: role || undefined, category: category || undefined, offset, limit: 24 } }, { signal: controller.signal })
        .then(r => r.json()).then((data: BrushGalleryPage) => { if (!controller.signal.aborted) setPage(data) })
        .catch(() => { if (!controller.signal.aborted) setError(t('gallery.loadFailed')) })
    }, 150)
    return () => { clearTimeout(timer); controller.abort() }
  }, [tab, search, role, category, offset, revision, t])
  useEffect(() => {
    if (!page || busy || page.items.every(item => item.strokePreview) || previewPoll.current.attempts >= 20) return
    const timer = setTimeout(() => { previewPoll.current.attempts++; setRevision(v => v + 1) }, 3000)
    return () => clearTimeout(timer)
  }, [page, busy])
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await work(); setRevision(v => v + 1) } catch (error) { setError(t(error instanceof ApiError && error.code === 'last_drawing_brush' ? 'gallery.lastDrawing' : 'gallery.actionFailed')) }
    finally { setBusy(false) }
  }
  const brushName = (reference: string, name: string) => { const native = NATIVE_GALLERY_BRUSHES.find(b => b.reference === reference); return native ? t(TOOL_DISPLAY[native.tool].labelKey) : name }
  return createPortal(<Modal title={t('gallery.title')} close={onClose} className={styles.modal}>
    {selectedItems.length > 0 && <details><summary>{t('gallery.inRoom', { n: selectedItems.length })}</summary>{selectedItems.map(item => <div className={styles.row} key={item.reference}>
      {(item.preview || TOOL_PHOTOS[item.reference.slice(7)]) && <img className={styles.artwork} src={item.preview || TOOL_PHOTOS[item.reference.slice(7)]} alt="" loading="lazy" />}
      <span className={styles.name}>{brushName(item.reference, item.name)}</span>
      {item.strokePreview && <img className={styles.stroke} src={item.strokePreview} alt="" loading="lazy" />}
      <Button size="md" type="ghost" disabled={disabled || busy || selected.length === 1} onClick={() => void run(async () => { await onRemove?.(item.reference) })}>{t('gallery.remove')}</Button>
    </div>)}</details>}
    <div className={styles.tabs}>
      {(['library', 'favorites', 'uploads'] as const).map(value => <Button key={value} size="md" type={tab === value ? 'active' : 'ghost'} aria-pressed={tab === value} onClick={() => { setTab(value); setOffset(0) }}>{t(`gallery.${value}`)}</Button>)}
    </div>
    <div className={styles.filters}>
      <Input id="brush-gallery-search" label={t('gallery.search')} value={search} onChange={e => { setSearch(e.target.value); setOffset(0) }} />
      <label>{t('gallery.role')}<select value={role} onChange={e => { setRole(e.target.value); setOffset(0) }}>
        <option value="">{t('gallery.all')}</option><option value="drawing">{t('gallery.drawing')}</option><option value="eraser">{t('gallery.eraser')}</option><option value="smudge">{t('gallery.smudge')}</option>
      </select></label>
      <label>{t('gallery.category')}<select value={category} onChange={e => { setCategory(e.target.value); setOffset(0) }}>
        <option value="">{t('gallery.all')}</option>{(['paint', 'pencil', 'ink', 'texture', 'charcoal', 'watercolor', 'spray'] as const).map(v => <option key={v} value={v}>{t(`gallery.category.${v}`)}</option>)}
      </select></label>
    </div>
    <div className={styles.upload}>
      <input ref={file} type="file" hidden accept=".kpp,.bundle,.grafetto-brushes.json" onChange={e => {
        const chosen = e.target.files?.[0]; e.target.value = ''
        if (!chosen) return
        const controller = new AbortController(); uploadAbort.current = controller
        setUploadPhase('uploading'); setUploadProgress(0); setImportResult(null)
        void run(async () => { try {
          const job = await importBrushFile(chosen, value => { setUploadProgress(value); if (value >= 1) setUploadPhase('converting') }, controller.signal)
          setImportResult({ count: job.library?.brushes.length ?? 0, skipped: job.library?.skipped ?? [] })
          setTab('uploads'); setOffset(0)
        } finally { setUploadPhase('idle') } })
      }} />
      <Button size="md" type="secondary" disabled={busy} onClick={() => file.current?.click()}>{t('gallery.upload')}</Button>
      <span>{t('gallery.formats')}</span>
    </div>
    {uploadPhase !== 'idle' && <div role="status"><p>{uploadPhase === 'uploading' ? `${t('brushLibrary.uploading')} ${Math.round(uploadProgress * 100)}%` : t('brushLibrary.converting')}</p>{uploadPhase === 'uploading' && <><progress value={uploadProgress} max={1} /><Button size="md" type="ghost" onClick={() => uploadAbort.current?.abort()}>{t('common.cancel')}</Button></>}</div>}
    {importResult && <div role="status"><p>{t('brushLibrary.imported', { n: importResult.count })}</p>{importResult.skipped.length > 0 && <details><summary>{t('brushLibrary.skipped', { n: importResult.skipped.length })}</summary><ul>{importResult.skipped.map((b, i) => <li key={i}>{b.name}: {b.reasons.join('; ')}</li>)}</ul></details>}</div>}
    {error && <p role="alert">{error}</p>}
    {!page && !error && <p role="status">{t('gallery.loading')}</p>}
    {page && <>
      <p className={styles.count}>{t('gallery.count', { n: page.total })}</p>
      {!page.items.length && <p>{t('gallery.empty')}</p>}
      <div className={styles.list}>{page.items.map(item => <div key={item.reference} className={styles.row}>
        {(item.preview || TOOL_PHOTOS[item.reference.slice(7)]) ? <img className={styles.artwork} src={item.preview || TOOL_PHOTOS[item.reference.slice(7)]} alt="" loading="lazy" /> : <span className={styles.artwork} />}
        <div className={styles.name}><strong>{brushName(item.reference, item.name)}</strong><small>{item.source}</small></div>
        {item.strokePreview && <img className={styles.stroke} src={item.strokePreview} alt="" loading="lazy" />}
        <Button size="md" type={item.favorite ? 'active' : 'ghost'} aria-label={t('gallery.favorite')} aria-pressed={item.favorite} disabled={busy} onClick={() => void run(() => api('PATCH /api/brush-gallery/favorites', { body: { reference: item.reference, favorite: !item.favorite } }))}>{item.favorite ? '★' : '☆'}</Button>
        <Button size="md" type="secondary" disabled={disabled || busy || selected.includes(item.reference) && (!onRemove || selected.length === 1)} onClick={() => void run(async () => { if (selected.includes(item.reference) && onRemove) await onRemove(item.reference); else await onAdd(item.reference) })}>{t(selected.includes(item.reference) ? onRemove ? 'gallery.remove' : 'gallery.added' : 'gallery.add')}</Button>
        {tab === 'uploads' && <Button size="md" type="ghost" disabled={busy} onClick={() => void run(() => api('DELETE /api/brush-gallery/uploads', { body: { reference: item.reference } }))}>{t('gallery.remove')}</Button>}
      </div>)}</div>
      <div className={styles.pagination}><Button size="md" type="ghost" disabled={offset === 0} onClick={() => setOffset(v => Math.max(0, v - 24))}>{t('gallery.previous')}</Button><Button size="md" type="ghost" disabled={offset + page.limit >= page.total} onClick={() => setOffset(v => v + 24)}>{t('gallery.next')}</Button></div>
    </>}
  </Modal>, document.body)
}
