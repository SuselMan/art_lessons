import { brushAssetIds } from '@grafetto/shared'
import type { BrushDescriptor, ImportedBrush, BrushLibrary } from '@grafetto/shared'

const brushes = new Map<string, ImportedBrush>()
type InstalledAssetMetadata = Readonly<{id:string;size:number}>
interface InstalledAsset {readonly metadata?:InstalledAssetMetadata;readonly pixels?:Uint8Array}
const assets = new Map<string, InstalledAsset>()

const descriptorJSON = (descriptor: BrushDescriptor): string => JSON.stringify(descriptor, (_key, value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)

/** Immutable rendering data; pixels arrive separately before a brush can render. */
export function installBrushLibrary(library: BrushLibrary): void {
  // The caller already validated the manifest. Capture only declared own data;
  // legacy pixel-only callers never create declared metadata from byte length.
  if(!Array.isArray(library.assets))throw new Error('Invalid brush asset metadata')
  const stagedAssets: InstalledAssetMetadata[] = [], ids = new Set<string>()
  for (let i = 0; i < library.assets.length; i++) {
    const item = Object.getOwnPropertyDescriptor(library.assets, String(i))
    if (!item || !('value' in item) || !item.value || typeof item.value !== 'object') throw new Error('Invalid brush asset metadata')
    const idField = Object.getOwnPropertyDescriptor(item.value, 'id'), sizeField = Object.getOwnPropertyDescriptor(item.value, 'size')
    if (!idField || !('value' in idField) || !sizeField || !('value' in sizeField)) throw new Error('Invalid brush asset metadata')
    const id: unknown = idField.value, size: unknown = sizeField.value
    if (typeof id !== 'string' || !/^asset:[a-f0-9]{64}$/.test(id) || typeof size !== 'number' || !Number.isInteger(size) || size < 2 || size > 2048 || (size & (size - 1)) !== 0 || ids.has(id)) throw new Error('Invalid brush asset metadata')
    ids.add(id); stagedAssets.push(Object.freeze({id,size}))
  }
  const freeze = (v: object): void => {
    for (const child of Object.values(v)) if (child && typeof child === 'object') freeze(child)
    Object.freeze(v)
  }
  // Clone every brush before the final immutable-data checks/publication. A
  // later clone error must not publish an earlier asset or metadata refresh.
  const stagedBrushes = library.brushes.map(brush => structuredClone(brush))
  for (const brush of stagedBrushes) freeze(brush)
  const nextBrushes: Array<readonly [string,ImportedBrush]> = []
  for (const brush of stagedBrushes) {
    const key = `${brush.descriptor.id}@${brush.descriptor.version}`, previous = brushes.get(key)
    if (previous && descriptorJSON(previous.descriptor) !== descriptorJSON(brush.descriptor)) throw new Error('Brush version cannot be replaced')
    // Metadata refresh preserves the descriptor object used as a renderer key.
    const copy = previous ? Object.freeze({...brush,descriptor:previous.descriptor}) : brush
    nextBrushes.push([key,copy])
  }
  const nextAssets: Array<readonly [string,InstalledAsset]> = []
  for (const metadata of stagedAssets) {
    const previous = assets.get(metadata.id)
    if (previous?.metadata && previous.metadata.size !== metadata.size || previous?.pixels && previous.pixels.length !== metadata.size * metadata.size) throw new Error('Brush asset size cannot be replaced')
    nextAssets.push([metadata.id,{metadata:previous?.metadata ?? metadata,pixels:previous?.pixels}])
  }
  for (const [id,record] of nextAssets) assets.set(id,record)
  for (const [key,brush] of nextBrushes) brushes.set(key,brush)
}

export function importedBrushes(): readonly ImportedBrush[] { return [...brushes.values()] }

export function importedBrushFromPreset(preset: string | undefined): BrushDescriptor | undefined {
  if (!preset) return undefined
  const token = /^brush:(imported-[a-f0-9]+)@(\d+)(?::[a-z0-9-]+)*$/.exec(preset)
  if (token) {
    const brush = brushes.get(`${token[1]}@${token[2]}`)
    if (!brush) throw new Error(`Imported brush unavailable: ${token[1]}@${token[2]}`)
    return brush.descriptor
  }
  const found = [...brushes.values()].find(b => b.descriptor.id === preset)?.descriptor
  if (!found && preset.startsWith('imported-')) throw new Error(`Imported brush unavailable: ${preset}`)
  return found
}

export function importedAssetPixels(id: string): Uint8Array {
  const data = assets.get(id)?.pixels
  if (!data) throw new Error(`Brush asset unavailable: ${id}`)
  return data
}

export function installBrushPixels(id: string, data: Uint8Array): void {
  const size = Math.sqrt(data.length)
  if (!/^asset:[a-f0-9]{64}$/.test(id) || !Number.isInteger(size) || size < 2 || size > 2048 || (size & (size - 1)) !== 0) throw new Error('Invalid brush pixels')
  const previous = assets.get(id)
  if (previous?.metadata && data.length !== previous.metadata.size * previous.metadata.size) throw new Error('Brush asset size mismatch')
  if (previous?.pixels && (previous.pixels.length !== data.length || previous.pixels.some((v, i) => v !== data[i]))) throw new Error('Brush asset cannot be replaced')
  assets.set(id, {metadata:previous?.metadata,pixels:data.slice()})
}
export function isBrushAssetReady(id: string, expectedSide?: number): boolean {
  const data = assets.get(id)?.pixels
  return data !== undefined && (expectedSide === undefined || data.length === expectedSide * expectedSide)
}
export function importedBrushAssets(preset: string | undefined): string[] {
  const b = importedBrushFromPreset(preset)
  if (!b) return []
  return brushAssetIds(b).filter(id => id.startsWith('asset:'))
}

/** Declared manifest data only: neither pixel readiness nor source permission. */
export function importedBrushAssetMetadata(preset:string|undefined):readonly InstalledAssetMetadata[]|undefined {
  let brush:BrushDescriptor|undefined
  try{brush=importedBrushFromPreset(preset)}catch{return undefined}
  if(!brush)return undefined
  const result:InstalledAssetMetadata[]=[]
  for(const id of brushAssetIds(brush)) {
    const metadata=assets.get(id)?.metadata
    if(!metadata)return undefined
    result.push(metadata)
  }
  return Object.freeze(result)
}

/** Call only after all engines that can replay these resources have been destroyed. */
export function clearImportedBrushPixels(): void {
  for(const [id,record] of assets) {
    if(record.metadata)assets.set(id,{metadata:record.metadata})
    else assets.delete(id)
  }
}

/** Keep resources belonging to current/retiring engines. GPU textures are owned
 * by those engines; this releases unreferenced declared metadata and replay bytes. */
export function retainImportedBrushResources(libraries: readonly BrushLibrary[]): void {
  const versions = new Set(libraries.flatMap(l => l.brushes.map(b => `${b.descriptor.id}@${b.descriptor.version}`)))
  const pixels = new Set<string>(libraries.flatMap(l => l.assets.map(a => a.id)))
  for (const key of brushes.keys()) if (!versions.has(key)) brushes.delete(key)
  for (const key of assets.keys()) if (!pixels.has(key)) assets.delete(key)
}
