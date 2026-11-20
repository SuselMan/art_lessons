import type { BrushDescriptor } from './brushes.js'

/** Grafetto's serialized brush definition. A model names versioned formulas;
 * its parameters are data. Neither the file format nor the UI tool selects a
 * different layer store, room protocol or history implementation. */
export const BRUSH_DEFINITION_FORMAT = 'grafetto-brush-v1' as const

export type MaterialModel = 'graphite' | 'charcoal' | 'liner' | 'marker' | 'brushPen' | 'eraser' | 'smudge' | 'watercolor'

export interface MaterialParameters {
  /** Named response/nib selection within the versioned material model. */
  readonly preset: string
  readonly deposit: Readonly<{ opacity: number; hardness: number; sizeMultiplier: number }>
}

interface DefinitionHeader {
  readonly format: typeof BRUSH_DEFINITION_FORMAT
  readonly id: string
  readonly version: number
}

export type BrushDefinition = DefinitionHeader & (
  | { readonly model: MaterialModel; readonly modelVersion: 1; readonly parameters: MaterialParameters }
  | { readonly model: 'digital'; readonly modelVersion: 1; readonly parameters: Readonly<{ preset: string; brush: BrushDescriptor; pressure: Readonly<{size: boolean; opacity: boolean}> }> }
)
