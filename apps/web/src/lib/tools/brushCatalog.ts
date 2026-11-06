import type { BrushDescriptor, ImportedBrush } from '@grafetto/shared'
import { importedBrushes } from '../../engine/brushLibrary'

export type BrushRole = 'drawing' | 'eraser' | 'smudge'

/** A rendering revision changes immutable descriptor IDs, not the physical
 * tool illustration. Reuse artwork only for the same source/name pair. */
export function importedBrushPhotoLookup(photos:Readonly<Record<string,string>>):(brush:ImportedBrush)=>string|undefined {
  const key=(brush:ImportedBrush)=>JSON.stringify([brush.source,brush.name])
  const previous=new Map<string,{version:number;photo:string}>()
  for(const brush of importedBrushes()){
    const photo=photos[brush.descriptor.id],old=previous.get(key(brush))
    if(photo&&(!old||old.version<brush.descriptor.version))previous.set(key(brush),{version:brush.descriptor.version,photo})
  }
  return brush=>photos[brush.descriptor.id]??previous.get(key(brush))?.photo
}

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
