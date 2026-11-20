import { useEffect, useRef } from 'react'
import { importedBrushes } from '../../engine/brushLibrary'
import { currentBrushSelection, currentNativeBrushPreviews, refreshBrushLibrary } from '../../lib/api/brushLibrary'
/** Only pending display assets are polled, with a finite budget. Generation
 * stays on the server; this never creates an engine or downloads brush masks. */
export function useBrushPreviewRefresh(boardId: string | undefined, revision: number): void {
  const retry = useRef({ key: '', attempts: 0 })
  useEffect(() => {
    if (!boardId) return
    const brushes = importedBrushes(), native = currentNativeBrushPreviews()
    const missing = (currentBrushSelection() ?? []).filter(ref => ref.startsWith('native:') ? !native[ref.slice(7)] : !brushes.find(b => `brush:${b.descriptor.id}@${b.descriptor.version}` === ref)?.strokePreview)
    const key = boardId + ':' + missing.sort().join(',')
    if (retry.current.key !== key) retry.current = { key, attempts: 0 }
    if (!missing.length || retry.current.attempts >= 20) return
    const timer = setTimeout(() => { retry.current.attempts++; void refreshBrushLibrary().catch(() => {}) }, 3000)
    return () => clearTimeout(timer)
  }, [boardId, revision])
}
