import {sourceColorProviderKind,type BrushDescriptor} from '@grafetto/shared'

/** UI input requirement only; preparation and BEGIN verify the actual source. */
export function sourcePatternRequired(descriptor:BrushDescriptor|undefined):boolean {
 if(!descriptor)return false
 const provider=descriptor.sourceStamp?sourceColorProviderKind(descriptor.sourceStamp):undefined
 return descriptor.tip.material?.kind!=='color'&&(provider==='pattern'||provider==='lockedpattern')||!!descriptor.behavior?.dual&&sourcePatternRequired(descriptor.behavior.dual.brush)
}
