import {sourcePatternRequired} from '../../../lib/tools/sourcePatternRequirement'
import { useEffect, useRef, useState } from 'react'
import { importedBrushes } from '../../../engine/brushLibrary'
import { useT } from '../../../i18n'
import { apiPath } from '../../../lib/api/api'
import { importBrushFile, loadBrushLibrary, publishBrushPresets,brushPatterns } from '../../../lib/api/brushLibrary'
import { useRoomStore } from '../../../stores/roomStore'
import styles from './BrushLibraryControls.module.css'

/** File handling lives beside brush settings; it never changes the engine directly. */
export function BrushLibraryControls(): React.JSX.Element {
  const t = useT()
  const roomId = useRoomStore(s => s.boardId)
  const selected = useRoomStore(s => s.toolSettings.digitalBrush.brush)
  const selectedPattern=useRoomStore(s=>s.toolSettings.digitalBrush.pattern)
  useRoomStore(s => s.brushLibraryRevision)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'converting'>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<{ name: string; reasons: string[] }[]>([])
  useEffect(() => () => controller.current?.abort(), [])
  const brush = importedBrushes().find(b => b.descriptor.id === selected)
  const needsPattern=sourcePatternRequired(brush?.descriptor)
  const patternMissing=needsPattern&&(selectedPattern==='none'||!brushPatterns().some(pattern=>pattern.id===selectedPattern))
  const upload = async (file: File) => {
    const abort = new AbortController()
    controller.current = abort
    setPhase('uploading'); setProgress(0); setError(null); setResult(null); setSkipped([])
    try {
      const job = await importBrushFile(file, value => { setProgress(value); if (value >= 1) setPhase('converting') }, abort.signal)
      if (abort.signal.aborted) return
      if (roomId && job.library) await publishBrushPresets(roomId, job.library.brushes.map(b => `brush:${b.descriptor.id}@${b.descriptor.version}`))
      await loadBrushLibrary()
      if (!abort.signal.aborted) {
        setResult(t('brushLibrary.imported', { n: job.library?.brushes.length ?? 0 }))
        setSkipped(job.library?.skipped ?? [])
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        const message = e instanceof Error ? e.message : ''
        setError(message === 'brushLibrary.tooLarge' ? t('brushLibrary.tooLarge') : t('brushLibrary.importFailed'))
      }
    } finally { if (controller.current === abort) { controller.current = null; setPhase('idle') } }
  }
  return <section className={styles.library} aria-label={t('brushLibrary.title')}>
    <div className={styles.actions}>
      <input ref={input} className={styles.file} type="file" accept=".abr,.brush,.brushset,.kpp,.bundle,.json" onChange={e => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) void upload(file)
      }} />
      <button className={styles.button} disabled={phase !== 'idle'} onClick={() => input.current?.click()}>{t('brushLibrary.import')}</button>
      {roomId && <a className={styles.button} href={apiPath('GET /api/rooms/:id/brush-library/export', { params: { id: roomId } })} download="project.grafetto-brushes.json">{t('brushLibrary.export')}</a>}
    </div>
    <p className={styles.hint}>{t('brushLibrary.importHint')}</p>
    {patternMissing&&<p className={styles.hint} role="status">{t(brushPatterns().length?'brushLibrary.selectPattern':'brushLibrary.importPatterns')}</p>}
    {phase !== 'idle' && <div role="status">
      <p>{phase === 'uploading' ? `${t('brushLibrary.uploading')} ${Math.round(progress * 100)}%` : t('brushLibrary.converting')}</p>
      {phase === 'uploading' && <progress max={1} value={progress} />}
      <button className={styles.button} disabled={phase !== 'uploading'} onClick={() => { controller.current?.abort(); setPhase('idle') }}>{t('common.cancel')}</button>
    </div>}
    {result && <p role="status">{result}</p>}
    {error && <p role="alert">{error}</p>}
    {skipped.length > 0 && <details><summary>{t('brushLibrary.skipped', { n: skipped.length })}</summary><ul>{skipped.map((b,i) => <li key={i}>{b.name}: {b.reasons.join('; ')}</li>)}</ul></details>}
    {brush?.compatibility && <details><summary>{t('brushLibrary.compatibility')}</summary>
      <ul className={styles.report}>{brush.compatibility.map((item, i) => <li key={i}>
        <span className={styles.status}>{t(item.status === 'supported' ? 'brushLibrary.supported' : item.status === 'approximate' ? 'brushLibrary.approximate' : 'brushLibrary.unsupported')}</span>
        {' '}{item.feature}<p>{item.detail}</p>
      </li>)}</ul>
    </details>}
  </section>
}
