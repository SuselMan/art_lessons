/** Diagnostic candidate only: retain the mathematical second-octave expression
 * and ask WGSL for fma. WGSL permits non-fused implementations; no portability
 * or fidelity claim follows from this string transformation. */
export function ribbonOctaveFmaShader(source:string,enabled=false){
 if(!enabled)return source
 const from='wcNoise(p * 2.7 + vec2f(31.4, 17.9))'
 if(source.split(from).length!==2)throw Error('Canonical FBM octave anchor must occur exactly once')
 return source.replace(from,'wcNoise(fma(p, vec2f(2.7), vec2f(31.4, 17.9)))')
}
