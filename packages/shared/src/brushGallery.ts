import type { ImportedBrush } from './brushes.js'
export type BrushGalleryRole = 'drawing' | 'eraser' | 'smudge'
export type BrushGalleryTab = 'library' | 'favorites' | 'uploads'
export interface BrushGalleryItem {
  reference: string
  name: string
  source: string
  role: BrushGalleryRole
  category: string
  favorite: boolean
  preview?: string
  strokePreview?: string
}
export interface BrushGalleryPage { items: BrushGalleryItem[]; total: number; offset: number; limit: number }
export function galleryBrushRole(brush: ImportedBrush): BrushGalleryRole {
  return brush.descriptor.behavior?.erase ? 'eraser' : brush.descriptor.model === 'mixer' ? 'smudge' : 'drawing'
}

export const NATIVE_GALLERY_BRUSHES = [
  { reference: 'native:pencil', tool: 'pencil', name: 'Pencil', role: 'drawing', category: 'pencil' },
  { reference: 'native:liner', tool: 'liner', name: 'Liner', role: 'drawing', category: 'ink' },
  { reference: 'native:marker', tool: 'marker', name: 'Marker', role: 'drawing', category: 'ink' },
  { reference: 'native:charcoal', tool: 'charcoal', name: 'Charcoal', role: 'drawing', category: 'charcoal' },
  { reference: 'native:brushPen', tool: 'brushPen', name: 'Brush pen', role: 'drawing', category: 'ink' },
  { reference: 'native:eraser', tool: 'eraser', name: 'Eraser', role: 'eraser', category: 'eraser' },
  { reference: 'native:smudge', tool: 'smudge', name: 'Smudge', role: 'smudge', category: 'smudge' },
] as const
export const DEFAULT_BRUSH_SELECTION: string[] = NATIVE_GALLERY_BRUSHES.map(b => b.reference)
export function isNativeBrushReference(ref: string): boolean { return NATIVE_GALLERY_BRUSHES.some(b => b.reference === ref) }

export const BRUSH_SAMPLE_VERSION = 'stroke-v3'

/** Browsing hints, not rendering semantics or permissions. Presets often carry
 * their medium in their authored name; fall back to the execution category. */
export function galleryBrushCategory(brush: ImportedBrush): string {
  const role = galleryBrushRole(brush)
  if (role !== 'drawing') return role
  const name = `${brush.name} ${brush.source}`.toLowerCase()
  if (/charcoal|chalk|уголь|мел/.test(name)) return 'charcoal'
  if (/pencil|sketch|graphite|карандаш/.test(name)) return 'pencil'
  if (/watercolou?r|aquarel|акварель/.test(name)) return 'watercolor'
  if (/ink|liner|calligraph|чернил/.test(name)) return 'ink'
  if (/spray|airbrush|аэрограф/.test(name)) return 'spray'
  if (/texture|stamp|pattern|текстур/.test(name)) return 'texture'
  return brush.descriptor.category === 'line' ? 'ink' : brush.descriptor.category === 'texture' ? 'texture' : brush.descriptor.category === 'scatter' ? 'spray' : 'paint'
}

/** Native samples use textured paper; imported sample recipes stay unchanged. */
export const NATIVE_BRUSH_SAMPLE_VERSION = 'stroke-native-paper-v2'
