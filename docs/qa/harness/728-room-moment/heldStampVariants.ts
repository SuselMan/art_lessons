export type TipVariant = 'literal' | 'A' | 'B'
const threshold='mix(mix(0.34, 0.39, light), 0.62, release)'
const opening='smoothstep(0.55, 0.72, wcNoise(wp * 0.009 + vec2f(37.0, 91.0)))'
/** Shared function specialization: coverage and paint use the same contact.
 * New deposition model, NOT conservation of reference dose. */
export function tipVariantShader(shader:string,variant:TipVariant):string {
  if(variant==='literal')return shader
  if(shader.split(threshold).length!==2||shader.split(opening).length!==2)throw Error('Tip diagnostic anchors changed')
  if(variant==='A')return shader.replace(threshold,'mix(mix(0.28, 0.39, light), 0.62, release)')
  return shader.replace(opening,'smoothstep(mix(0.65, 0.55, light), mix(0.82, 0.72, light), wcNoise(wp * 0.009 + vec2f(37.0, 91.0)))')
}
