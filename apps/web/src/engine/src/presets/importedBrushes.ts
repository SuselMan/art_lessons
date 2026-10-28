import type { BrushDescriptor, ImportedBrush, BrushLibrary } from '@grafetto/shared'

const brushes = new Map<string, ImportedBrush>()
const assets = new Map<string, Uint8Array>()

const descriptorJSON = (descriptor: BrushDescriptor): string => JSON.stringify(descriptor, (_key, value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)

/** Immutable rendering data; pixels arrive separately before a brush can render. */
export function installBrushLibrary(library: BrushLibrary): void {
  for (const brush of library.brushes) {
    const key = `${brush.descriptor.id}@${brush.descriptor.version}`
    const previous = brushes.get(key)
    if (previous && descriptorJSON(previous.descriptor) !== descriptorJSON(brush.descriptor)) throw new Error('Brush version cannot be replaced')
  }
  for (const brush of library.brushes) {
    const copy: ImportedBrush = structuredClone(brush)
    const freeze = (v: object): void => {
      for (const child of Object.values(v)) if (child && typeof child === 'object') freeze(child)
      Object.freeze(v)
    }
    const previous = brushes.get(`${copy.descriptor.id}@${copy.descriptor.version}`)
    // Metadata refresh must not invalidate renderer caches keyed by descriptor identity.
    if (previous) copy.descriptor = previous.descriptor
    freeze(copy)
    brushes.set(`${copy.descriptor.id}@${copy.descriptor.version}`, copy)
  }
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
  const data = assets.get(id)
  if (!data) throw new Error(`Brush asset unavailable: ${id}`)
  return data
}

export function installBrushPixels(id: string, data: Uint8Array): void {
  const size = Math.sqrt(data.length)
  if (!/^asset:[a-f0-9]{64}$/.test(id) || !Number.isInteger(size) || size < 2 || size > 2048 || (size & (size - 1)) !== 0) throw new Error('Invalid brush pixels')
  const previous = assets.get(id)
  if (previous && (previous.length !== data.length || previous.some((v, i) => v !== data[i]))) throw new Error('Brush asset cannot be replaced')
  assets.set(id, data.slice())
}
export function isBrushAssetReady(id: string): boolean { return assets.has(id) }
export function importedBrushAssets(preset: string | undefined): string[] {
  const b = importedBrushFromPreset(preset)
  if (!b) return []
  const componentAssets = (brush: BrushDescriptor): (string | undefined)[] => [brush.tip.mask, ...(brush.tip.animation?.frames ?? []), brush.tip.material?.gray, ...(brush.tip.material?.grayFrames ?? []), brush.texture?.id, ...(brush.behavior?.dual ? componentAssets(brush.behavior.dual.brush) : [])]
  return [...new Set(componentAssets(b))].filter((id): id is string & `asset:${string}` => !!id && id.startsWith('asset:'))
}

/** Call only after all engines that can replay these resources have been destroyed. */
export function clearImportedBrushPixels(): void { assets.clear() }

/** Keep resources belonging to current/retiring engines. GPU textures are owned
 * by those engines; this only releases the synchronous replay source bytes. */
export function retainImportedBrushResources(libraries: readonly BrushLibrary[]): void {
  const versions = new Set(libraries.flatMap(l => l.brushes.map(b => `${b.descriptor.id}@${b.descriptor.version}`)))
  const pixels = new Set<string>(libraries.flatMap(l => l.assets.map(a => a.id)))
  for (const key of brushes.keys()) if (!versions.has(key)) brushes.delete(key)
  for (const key of assets.keys()) if (!pixels.has(key)) assets.delete(key)
}
