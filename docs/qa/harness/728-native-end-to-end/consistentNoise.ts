/** Diagnostic-only: mathematically identical floor-relative fractional coordinate.
 * This changes compiler evaluation, not the intended noise lattice or physics. */
export type ConsistentNoiseVariant='subtract'|'clamped-subtract'
export function consistentNoiseShader(source:string,variant?:ConsistentNoiseVariant){
 if(!variant)return source
 if(variant!=='subtract'&&variant!=='clamped-subtract')throw new Error('Unknown diagnostic noise variant')
 const anchor='vec2 f = fract(p);'
 if(!source.includes(anchor))throw new Error('Noise fract anchor missing')
 return source.replace(anchor,variant==='subtract'?'vec2 f = p - i;':'vec2 f = clamp(p - i, 0.0, 1.0);')
}
