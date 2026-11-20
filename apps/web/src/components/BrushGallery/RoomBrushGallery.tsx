import { NATIVE_GALLERY_BRUSHES, galleryBrushRole, galleryBrushCategory, type BrushGalleryItem } from '@grafetto/shared'
import { importedBrushes } from '../../engine/brushLibrary'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api/api'
import { currentNativeBrushPreviews, currentBrushSelection, refreshBrushLibrary } from '../../lib/api/brushLibrary'
import { useRoomStore } from '../../stores/roomStore'
import { BrushGallery } from './BrushGallery'
export function RoomBrushGallery({ onClose }: { onClose: () => void }) {
  const id = useRoomStore(s => s.boardId)
  useRoomStore(s => s.brushLibraryRevision)
  const [selected, setSelected] = useState<string[]>(() => [...currentBrushSelection() ?? []])
  const [canEdit, setCanEdit] = useState(false)
  useEffect(() => {
    if (!id) return
    let live = true
    void api('GET /api/rooms/:id/brush-selection', { params: { id } }).then(result => {
      if (live) { setCanEdit(result.canEdit); if (result.references) setSelected(result.references) }
    }).catch(() => { if (live) setCanEdit(false) })
    return () => { live = false }
  }, [id])
  const selectedItems: BrushGalleryItem[] = [
    ...NATIVE_GALLERY_BRUSHES.filter(b => selected.includes(b.reference)).map(b => ({ ...b, source: 'Grafetto', favorite: false, strokePreview: currentNativeBrushPreviews()[b.tool] })),
    ...importedBrushes().filter(b => selected.includes(`brush:${b.descriptor.id}@${b.descriptor.version}`)).map(b => ({ reference: `brush:${b.descriptor.id}@${b.descriptor.version}`, name: b.name, source: b.source, role: galleryBrushRole(b), category: galleryBrushCategory(b), favorite: false, preview: b.preview, strokePreview: b.strokePreview })),
  ]
  return <BrushGallery selected={selected} selectedItems={selectedItems} disabled={!canEdit} onClose={onClose} onRemove={async reference => {
    if (!id || !canEdit) return
    const references = selected.filter(v => v !== reference)
    await api('PATCH /api/rooms/:id/brush-selection', { params: { id }, body: { references } })
    await refreshBrushLibrary(); setSelected(references)
  }} onAdd={async reference => {
    if (!id || !canEdit) return
    const references = [...new Set([...selected, reference])]
    await api('PATCH /api/rooms/:id/brush-selection', { params: { id }, body: { references } })
    await refreshBrushLibrary()
    setSelected(references)
  }} />
}
