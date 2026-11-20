/** Internal admission mode, never a serialized descriptor policy. Historical
 * wrappers omit it and retain their original version and timing grammar. */
export const STATIONARY195_STRUCTURE = Symbol('stationary195-structure')
export type BrushStructurePolicy = typeof STATIONARY195_STRUCTURE | undefined
export function isStationary195Structure(value: unknown, policy: BrushStructurePolicy): boolean {
  return policy === STATIONARY195_STRUCTURE && !!value && typeof value === 'object'
    && !Array.isArray(value) && 'version' in value && value.version === 195
}
