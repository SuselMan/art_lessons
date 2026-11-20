import { createHash } from 'node:crypto'
import type { BrushDescriptor, BrushLibrary, ImportedBrush } from '@grafetto/shared'

/** Canonical JSON: object insertion order and transport-only undefined fields
 * must not make identical rendering definitions consume separate objects. */
export function canonicalBrushJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(v => canonicalBrushJson(v ?? null)).join(',') + ']'
  return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonicalBrushJson(v)).join(',') + '}'
}
export function brushContent(brush: ImportedBrush): { descriptor: Omit<BrushDescriptor, 'id'>; sourceDefaults?: ImportedBrush['sourceDefaults'] } {
  const { id: _id, ...descriptor } = brush.descriptor
  return { descriptor, ...(brush.sourceDefaults ? { sourceDefaults: brush.sourceDefaults } : {}) }
}
export const brushContentHash = (brush: ImportedBrush): string => createHash('sha256').update(canonicalBrushJson(brushContent(brush))).digest('hex')
export const brushReference = (brush: ImportedBrush): string => `brush:${brush.descriptor.id}@${brush.descriptor.version}`
export type BrushLibraryReference = Omit<ImportedBrush, 'descriptor' | 'sourceDefaults' | 'preview' | 'strokePreview'> & { contentHash: string; descriptorId: string; previewHash?: string }
export interface StoredBrushLibrary {
  storageVersion: 2
  selection?: string[]
  brushes: BrushLibraryReference[]
  assets: BrushLibrary['assets']
  skipped: BrushLibrary['skipped']
}
