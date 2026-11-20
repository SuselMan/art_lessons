import { NATIVE_GALLERY_BRUSHES, isNativeBrushReference, galleryBrushCategory, galleryBrushRole, type BrushGalleryItem, type BrushGalleryPage, type BrushLibrary } from '@grafetto/shared'
import { boundedRead, BrushStorage, merge } from './storage.js'
import { sampleKey, type BrushSamples } from './samples.js'
import { brushReference } from './contentAddressing.js'

export class BrushGallery {
  constructor(readonly storage: BrushStorage, readonly operator: BrushLibrary, readonly samples?: BrushSamples) {}
  favorites(owner: string): string[] {
    try {
      const value: unknown = JSON.parse(boundedRead(this.storage.path('preferences', owner), 256 * 1024).toString())
      if (!Array.isArray(value) || value.length > 4096 || !value.every(v => typeof v === 'string')) throw Error('Invalid favorites')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  selection(room: string): string[] | null {
    const selected = this.storage.library('sets',room).selection
    if (selected) return selected
    try {
      const value: unknown = JSON.parse(boundedRead(this.storage.path('selections', room), 256 * 1024).toString())
      if (!Array.isArray(value) || value.length > 512 || !value.every(v => typeof v === 'string' && v.length < 200)) throw Error('Invalid selection')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  setSelection(room: string, owner: string, references: string[]): void {
    this.storage.replaceSelection(room,owner,references,this.operator)
  }
  selectedLibrary(room: string): BrushLibrary {
    const set = this.storage.library('sets',room)
    if (set.selection) return set
    // Legacy selected pins are retained, but only current references enter a
    // new board's metadata. Existing history remains independently readable.
    const old = this.storage.library('rooms',room), references = this.selection(room) ?? []
    const selected = { ...old, brushes: old.brushes.filter(b => references.includes(brushReference(b))) }
    return selected
  }

  setFavorite(owner: string, reference: string, favorite: boolean): void {
    const available = merge(this.operator, this.storage.library('owners', owner))
    if (!isNativeBrushReference(reference) && !available.brushes.some(b => brushReference(b) === reference)) throw Error('Brush unavailable')
    this.storage.mutate(() => {
      const next = new Set(this.favorites(owner))
      if (favorite) next.add(reference); else next.delete(reference)
      if (next.size > 4096) throw Error('Favorites quota exceeded')
      this.storage.atomic(this.storage.path('preferences', owner), [...next])
    })
  }
  page(owner: string, query: { tab?: string; q?: string; role?: string; category?: string; offset?: number; limit?: number }): BrushGalleryPage {
    const personal = this.storage.library('owners', owner), favorites = new Set(this.favorites(owner))
    const library = query.tab === 'uploads' ? personal : query.tab === 'library' ? this.operator : merge(this.operator, personal)
    const search = (query.q ?? '').trim().toLocaleLowerCase()
    const rows = library.brushes.filter(b => !b.archived && !/\.(abr|brush|brushset)$/i.test(b.source))
      .filter(b => query.tab !== 'favorites' || favorites.has(brushReference(b)))
      .filter(b => !query.role || galleryBrushRole(b) === query.role)
      .filter(b => !query.category || galleryBrushCategory(b) === query.category)
      .filter(b => !search || `${b.name} ${b.source} ${b.descriptor.category}`.toLocaleLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name) || brushReference(a).localeCompare(brushReference(b)))
    const items: BrushGalleryItem[] = rows.map(b => ({ reference: brushReference(b), name: b.name, source: b.source, role: galleryBrushRole(b), category: galleryBrushCategory(b), favorite: favorites.has(brushReference(b)), preview: b.preview, strokePreview: this.samples?.available(sampleKey(b)) ? `/api/brush-gallery/previews/${sampleKey(b)}` : undefined }))
    if (query.tab !== 'uploads') for (const native of NATIVE_GALLERY_BRUSHES) {
      if (query.tab === 'favorites' && !favorites.has(native.reference) || query.role && native.role !== query.role || query.category && native.category !== query.category || search && !`${native.name} Grafetto ${native.category}`.toLowerCase().includes(search)) continue
      const key = sampleKey(native.reference.slice(7))
      items.push({ ...native, source: 'Grafetto', favorite: favorites.has(native.reference), preview: undefined, strokePreview: this.samples?.available(key) ? `/api/brush-gallery/previews/${key}` : undefined })
    }
    items.sort((a, b) => a.name.localeCompare(b.name) || a.reference.localeCompare(b.reference))
    const offset = Math.max(0, Math.floor(query.offset ?? 0)), limit = Math.max(1, Math.min(48, Math.floor(query.limit ?? 24)))
    return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) }
  }
}
