import type { OwnedPresentationLease } from './PresentationOwnerPrototype'
export type SnapshotRole = 'presentation' | 'pigmentFilm' | 'colourFilm' | 'solventFilm' | 'coverageFilm'
export interface CopyableRgbaField<F> {
  readonly width: number
  readonly height: number
  readonly texture: object
  copyTo(destination: F): void
}
export interface SnapshotFactory<F> {
  create(role: SnapshotRole, width: number, height: number): F
  /** Must defer physical reuse/destruction until all encoded copies/readers are GPU-safe. */
  retire(fields: readonly F[], reason: 'released' | 'capture-failed'): void
}
const roles: readonly SnapshotRole[] = ['presentation','pigmentFilm','colourFilm','solventFilm','coverageFilm']

/** Independent visual/source-film capture, NOT a canonical finish or a captured canonical baseline. */
export function captureOwnedVisibleSource<F extends CopyableRgbaField<F>>(
  source: Readonly<Record<SnapshotRole,F>>, factory: SnapshotFactory<F>,
): OwnedPresentationLease & { readonly fields: Readonly<Record<SnapshotRole,F>> } {
  const sourceTextures = new Set<object>()
  const dimensions = source.presentation
  for (const role of roles) {
    const field = source[role]
    if (!Number.isSafeInteger(field.width) || !Number.isSafeInteger(field.height) || field.width !== dimensions.width || field.height !== dimensions.height || !Number.isSafeInteger(field.width * field.height * 4) || field.width < 1 || field.height < 1) throw Error('Same bounded RGBA8 tile required')
    if (sourceTextures.has(field.texture)) throw Error('Source role texture alias')
    sourceTextures.add(field.texture)
  }
  if (!Number.isSafeInteger(dimensions.width * dimensions.height * 4 * roles.length)) throw Error('Snapshot byte sum overflow')
  const fields: Partial<Record<SnapshotRole,F>> = {}, created: F[] = [], identities = new Set<object>()
  try {
    for (const role of roles) {
      const field = factory.create(role,dimensions.width,dimensions.height)
      if (sourceTextures.has(field.texture) || identities.has(field.texture)) throw Error('Snapshot allocation aliases borrowed/owned texture')
      created.push(field); identities.add(field.texture)
      if (field.width !== dimensions.width || field.height !== dimensions.height) throw Error('Snapshot allocation dimension mismatch')
      fields[role] = field
      source[role].copyTo(field)
    }
  } catch (error) {
    // Never retire borrowed aliases. Allocations/copies may already be encoded: factory owns safe retirement.
    try { factory.retire(created,'capture-failed') } catch (cleanup) { throw new AggregateError([error,cleanup],'Snapshot capture/cleanup failed') }
    throw error
  }
  const owned = Object.freeze(fields as Record<SnapshotRole,F>)
  const resources = Object.freeze(roles.map(role => Object.freeze({ identity: owned[role].texture,
    role: role === 'presentation' ? 'presentation' as const : 'canonical-source' as const,
    width: owned[role].width,height: owned[role].height })))
  let released = false
  return Object.freeze({ fields: owned,resources,bytes: dimensions.width * dimensions.height * 4 * roles.length,
    release() { if (released) return; released=true;factory.retire(created,'released') } })
}
