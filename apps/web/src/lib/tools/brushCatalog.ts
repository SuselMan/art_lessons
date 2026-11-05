import type { BrushDescriptor } from '@grafetto/shared'
import { importedBrushes } from '../../engine/brushLibrary'

export type BrushRole = 'drawing' | 'eraser' | 'smudge'

/** Preset semantics, never filename heuristics. Erase takes precedence over mixing. */
export function brushRole(brush: BrushDescriptor): BrushRole {
  return brush.behavior?.erase ? 'eraser' : brush.model === 'mixer' ? 'smudge' : 'drawing'
}

// Historical versions remain resolvable for replay; the picker offers the latest import.
export const pickerImportedBrushes = (role: BrushRole = 'drawing') => {
  // Focus the selectable library on Krita while matching its reference renderer.
  // Keep every imported descriptor available to existing strokes and replay.
  const all = importedBrushes().filter(b => !/\.(abr|brush|brushset)$/i.test(b.source))
  const latest = new Map<string, { version: number; behavior: boolean }>()
  const key = (source: string, name: string) => JSON.stringify([source, name])
  for (const brush of all) {
    const id = key(brush.source, brush.name), previous = latest.get(id)
    latest.set(id, { version: Math.max(previous?.version ?? 0, brush.descriptor.version), behavior: !!brush.descriptor.behavior || !!previous?.behavior })
  }
  return all.filter(brush => {
    const next = latest.get(key(brush.source, brush.name))!
    return brushRole(brush.descriptor) === role && next.version === brush.descriptor.version && (!!brush.descriptor.behavior || !next.behavior)
  })
}

