import type { BrushDescriptor } from './brushes.js'
import { isBrushBehavior } from './brushBehavior.js'
import { STATIONARY195_STRUCTURE, type BrushStructurePolicy } from './brushStructurePolicy.js'
import { nativeMaskComponentStructure, INDEPENDENT_MASK190_MODES } from './independentMask190.js'
import { nativeTexture191Structure, texture191SmudgeCore } from './brushTextureCombinations191.js'
import { colorSmudge193Structure } from './brushColorSmudge193.js'
import { isFilterDescriptor } from './brushFilter.js'
import { sketch194Structure, spray194Structure } from './brushSketchSpray194.js'
import { isParticleDescriptor } from './brushParticle.js'
import { isDeformDescriptor } from './brushDeform.js'
import { isCurveTraceDescriptor } from './brushCurveTrace.js'
import { isBristleDescriptor, hasBristleInitializationScope, hasBristleSoak139Scope } from './brushBristle.js'
import { isGridDescriptor } from './brushGrid.js'
import { isHatchingDescriptor } from './brushHatching.js'
import { isExperimentDescriptor } from './brushExperiment.js'
import { isCloneDescriptor } from './brushClone.js'
import { isMyPaintDescriptor } from './brushMyPaint.js'
import { isTangentNormalDescriptor } from './brushTangentNormal.js'

export type Stationary195Family =
  | 'pixel' | 'smudge' | 'filter' | 'sketch' | 'spray' | 'particle' | 'deform' | 'curve'
  | 'bristle' | 'grid' | 'hatching' | 'experiment' | 'clone' | 'mypaint' | 'tangentNormal'

export interface Stationary195Role {
  family: Stationary195Family
  callback: 'refreshOnly' | 'effective' | 'movingBypass' | 'lineCallback'
  variant?: 'roundMarker' | 'legacy' | 'modern'
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const policy: BrushStructurePolicy = STATIONARY195_STRUCTURE
const payloads = [
  'filter', 'sketch', 'spray', 'particle', 'deform', 'curveTrace', 'bristle',
  'grid', 'hatching', 'experiment', 'clone', 'mypaint', 'tangentNormal',
] as const
const callbacks: Record<Stationary195Family, Stationary195Role['callback']> = {
  pixel: 'effective',
  smudge: 'effective',
  filter: 'refreshOnly',
  sketch: 'movingBypass',
  spray: 'effective',
  particle: 'movingBypass',
  deform: 'effective',
  curve: 'lineCallback',
  bristle: 'lineCallback',
  grid: 'refreshOnly',
  hatching: 'refreshOnly',
  experiment: 'lineCallback',
  clone: 'refreshOnly',
  mypaint: 'effective',
  tangentNormal: 'effective',
}

/** Whole root only. Family and callback policy derive from the actual payload,
 * never a serialized policy selector or a descriptor projected to an old version.
 * Full library validation remains authoritative for every numeric/CAS field.
 * TangentNormal's retained checked Sharpness option additionally selects its
 * native1x1 shortcut at allocation time; a descriptor cannot know that size. */
export function resolveStationary195Role(value: unknown): Stationary195Role | null {
  if (!obj(value) || value.version !== 195 || !obj(value.tip) || !obj(value.behavior)
    || !isBrushBehavior(value.behavior)) return null
  const b = value.behavior, tip = value.tip
  if (b.clockRead !== undefined || !obj(b.timing) || b.timing.version !== 2) return null
  const present = payloads.filter(key => value[key] !== undefined)
  if (present.length > 1) return null

  let family: Stationary195Family, valid = false, variant: Stationary195Role['variant']
  const key = present[0]
  if (!key) {
    if (value.model === 'mixer') {
      family = 'smudge'
      valid = colorSmudge193Structure(value, policy) || texture191SmudgeCore(value, policy)
      variant = obj(value.mixer) && value.mixer.algorithm !== undefined ? 'modern' : 'legacy'
    } else {
      family = 'pixel'
      valid = nativeMaskComponentStructure(value, true, 195, policy)
      if (obj(tip.profile) && tip.profile.kind === 'circleBand') variant = 'roundMarker'
      if (obj(value.texture) && value.texture.material !== undefined
        && !nativeTexture191Structure(value.texture)) valid = false
      if (obj(b.dual)) {
        const dual = b.dual, child = dual.brush
        if (!obj(child) || (child.version !== 190 && child.version !== 191)
          || !nativeMaskComponentStructure(child, false, child.version)
          || dual.sampling !== 'independent' || typeof dual.blendMode !== 'string'
          || !(INDEPENDENT_MASK190_MODES as readonly string[]).includes(dual.blendMode)
          || Object.keys(dual).some(k => !['brush', 'blendMode', 'sampling', 'sizePolicy'].includes(k))) valid = false
      } else if (b.dual !== undefined) valid = false
    }
  } else {
    family = key === 'curveTrace' ? 'curve' : key
    switch (key) {
      case 'filter': valid = isFilterDescriptor(value, policy); break
      case 'sketch': valid = sketch194Structure(value, policy); break
      case 'spray': valid = spray194Structure(value, policy); break
      case 'particle': valid = isParticleDescriptor(value, policy); break
      case 'deform': valid = isDeformDescriptor(value, policy); break
      case 'curveTrace': valid = isCurveTraceDescriptor(value, policy); break
      case 'bristle':
        valid = isBristleDescriptor(value, policy)
          && (!obj(value.bristle) || value.bristle.initialization === undefined
            || hasBristleInitializationScope(value, policy))
          && (!obj(value.bristle) || value.bristle.soak === undefined
            || hasBristleSoak139Scope(value, policy))
        break
      case 'grid': valid = isGridDescriptor(value, policy); break
      case 'hatching': valid = isHatchingDescriptor(value, policy); break
      case 'experiment': valid = isExperimentDescriptor(value, policy); break
      case 'clone': valid = isCloneDescriptor(value, policy); break
      case 'mypaint': valid = isMyPaintDescriptor(value, policy); break
      case 'tangentNormal': valid = isTangentNormalDescriptor(value, policy); break
    }
    if (b.dual !== undefined) valid = false
  }
  if (!valid) return null
  if ((family === 'mypaint' || variant === 'roundMarker') && b.timing.rateDynamics !== undefined) return null
  const callback = variant === 'roundMarker' ? 'refreshOnly' : callbacks[family]
  return { family, callback, ...(variant ? { variant } : {}) }
}

export function hasStationary195Scope(value: unknown): boolean {
  return resolveStationary195Role(value) !== null
}

/** A child keeps its own literal190/191. Only real identity under this195
 * Pixel root grants a mask role; arbitrary clones and nested195 are rejected. */
export function isStationary195Component(root: unknown, node: unknown): boolean {
  const role = resolveStationary195Role(root)
  return role?.family === 'pixel' && obj(root) && obj(root.behavior) && obj(root.behavior.dual)
    && node === root.behavior.dual.brush && obj(node) && (node.version === 190 || node.version === 191)
}

/** Required recorded channels for native Rate expressions. This is a channel
 * query, not an admission capability; callers retain whole-root validation. */
export function stationary195RateInputRequirements(brush: BrushDescriptor): { normalizedSpeed: boolean; sourceAngle: boolean } {
  const result = { normalizedSpeed: false, sourceAngle: false }
  if (brush.version !== 195 || brush.behavior?.timing?.version !== 2) return result
  for (const factor of brush.behavior.timing.rateDynamics ?? []) {
    for (const leaf of [factor, ...(factor.combine ? [...factor.combine.scaling, ...factor.combine.additive] : [])]) {
      if (leaf.control === 'speed') result.normalizedSpeed = true
      if (leaf.control === 'direction' || leaf.control === 'initialDirection' || leaf.combine?.absolute) result.sourceAngle = true
    }
  }
  return result
}
