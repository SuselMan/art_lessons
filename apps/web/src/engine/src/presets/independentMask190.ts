import { hasNativePixel202Scope,hasStationary195Scope,resolveStationary195Role,type Stationary195Role,hasSketchSpray194Scope,hasColorSmudge193Scope,hasFilterMask192Scope, hasIndependentMask190Scope, isTextureCombinations191Scope, brushRequiresSourceTime, brushRequiresRandomContext, brushUsesGradient, brushAnimationUsesMode, type BrushDescriptor } from '@grafetto/shared'
import type { BrushExecutionContext } from './brushExecutionContext'

/** Internal execution capability, never an operation/dab/wire field. The whole
 * root descriptor is validated before creating the compact child role. */
export interface MaskRole190 {
  readonly version?:190|191|192|193|194|195|202
  readonly stationary195?:Stationary195Role
  readonly rootId: string
  readonly childId: string
  readonly role: 'primary' | 'child'
  readonly needTime: boolean
  readonly needSpeed: boolean
  readonly needRandom: boolean
  readonly needGradient: boolean
}
export function mask190Role(brush: BrushDescriptor, execution?: BrushExecutionContext): MaskRole190['role'] | undefined {
  const role = execution?.maskRole190
  if (brush.version !== 190 && brush.version !== 191 && brush.version !== 192 && brush.version !== 193 && brush.version !== 194 && brush.version !== 195 && brush.version !== 202) {
    if (role) throw Error('Mask190 execution role requires descriptor190')
    return undefined
  }
  if((brush.version===193||brush.version===194||brush.version===195||brush.version===202)&&role?.role==='child')throw Error('Color Smudge193 is root-only')
  if (!role || (role.version??190)!==brush.version || (role.role === 'primary' ? role.rootId : role.childId) !== brush.id) throw Error('Missing or mismatched Mask190 execution role')
  return role.role
}
export function mask190RootExecution(brush: BrushDescriptor, execution?: BrushExecutionContext): BrushExecutionContext | undefined {
  if (brush.version !== 190 && brush.version !== 191 && brush.version !== 192 && brush.version !== 193 && brush.version !== 194 && brush.version !== 195 && brush.version !== 202) return execution
  if (execution?.maskRole190?.role === 'child') {
    mask190Role(brush, execution)
    return execution
  }
  if(execution?.maskRole190){
    mask190Role(brush,execution)
    if(execution.maskRole190.childId!==(brush.behavior?.dual?.brush.id??''))throw Error('Mask190 child capability changed')
    return execution
  }
  if (!(brush.version===202?hasNativePixel202Scope(brush):brush.version===195?hasStationary195Scope(brush):brush.version===194?hasSketchSpray194Scope(brush):brush.version===193?hasColorSmudge193Scope(brush):brush.version===192?hasFilterMask192Scope(brush):brush.version===191?isTextureCombinations191Scope(brush):hasIndependentMask190Scope(brush))) throw Error('Invalid whole independent Mask190 scope')
  const child = brush.behavior?.dual?.brush
  const speedControl=(v:unknown):boolean=>{if(!v||typeof v!=='object')return false;if('control'in v&&v.control==='speed')return true;return Object.entries(v).some(([key,value])=>key!=='dual'&&speedControl(value))}
  const stationary195=brush.version===195?resolveStationary195Role(brush):null
  if(brush.version===195&&!stationary195)throw Error('Missing stationary195 execution role')
  const needSpeed=[brush,...(child?[child]:[])].some(b=>brushAnimationUsesMode(b.tip.animation,'velocity')||speedControl(b.behavior)||brush.version===195&&speedControl(b)||brush.version===193&&speedControl(b.mixer)||brush.version===194&&speedControl(b.sketch))
  return { ...execution, maskRole190: { version:brush.version as 190|191|192|193|194|195|202,...(stationary195?{stationary195}:{}), rootId: brush.id, childId: child?.id??'', role: 'primary', needTime:brushRequiresSourceTime(brush),needSpeed,needRandom:brushRequiresRandomContext(brush),needGradient:brushUsesGradient(brush) } }
}
export function mask190ChildExecution(root: BrushDescriptor, execution?: BrushExecutionContext): BrushExecutionContext | undefined {
  if (root.version !== 190 && root.version !== 191 && root.version !== 195) return execution
  if (!root.behavior?.dual || mask190Role(root, execution) !== 'primary') throw Error('Mask190 child requires validated primary execution')
  return { ...execution, maskRole190: { ...execution!.maskRole190!,...(root.version===195?{version:root.behavior.dual.brush.version as 190|191}:{}),role: 'child' } }
}

/** The inherited master diameter is independent of parent pressure shaping.
 * Unlike legacy auto-generator initialization, Mask190 must retain fractions. */
export function mask190SourceSize(size:number):number {
 const captured=Math.fround(size)
 if(!Number.isFinite(size)||captured<=0||size>100000)throw Error('Invalid Mask190 source size')
 return captured
}
