/** #728: one paper-fixed field, avoiding three intersecting grids.
 * The immutable lattice is the existing #691 texture; no GPU float hash.
 * This changes late deposition texture only, never water, travel or the log. */
export const GRADIENT_FIBRE_STRENGTH = 0.25
export const GRADIENT_FIBRE_MEAN = 0.75

export const GRADIENT_FIBRE_GLSL = `
  uniform sampler2D u_wcFibreNoiseTex;
  float wcFibreLattice(vec2 cell) {
    return texture2D(u_wcFibreNoiseTex, (mod(cell, 251.0) + 0.5) / 251.0).r;
  }
  float wcFibreWarp(vec2 p) {
    vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
    return mix(mix(wcFibreLattice(i),wcFibreLattice(i+vec2(1.0,0.0)),u.x),
      mix(wcFibreLattice(i+vec2(0.0,1.0)),wcFibreLattice(i+vec2(1.0,1.0)),u.x),u.y);
  }
  vec2 wcFibreGradient(vec2 cell) {
    float k = floor(wcFibreLattice(cell) * 8.0);
    if (k < 1.0) return vec2(1.0,0.0);
    if (k < 2.0) return vec2(-1.0,0.0);
    if (k < 3.0) return vec2(0.0,1.0);
    if (k < 4.0) return vec2(0.0,-1.0);
    if (k < 5.0) return vec2(0.70710678,0.70710678);
    if (k < 6.0) return vec2(-0.70710678,0.70710678);
    if (k < 7.0) return vec2(0.70710678,-0.70710678);
    return vec2(-0.70710678,-0.70710678);
  }
  float wcFibreGradientNoise(vec2 q) {
    vec2 i=floor(q), f=fract(q), u=f*f*(3.0-2.0*f);
    float a=dot(wcFibreGradient(i),f);
    float b=dot(wcFibreGradient(i+vec2(1.0,0.0)),f-vec2(1.0,0.0));
    float c=dot(wcFibreGradient(i+vec2(0.0,1.0)),f-vec2(0.0,1.0));
    float d=dot(wcFibreGradient(i+vec2(1.0,1.0)),f-vec2(1.0,1.0));
    return clamp(0.5+1.2*mix(mix(a,b,u.x),mix(c,d,u.x),u.y),0.0,1.0);
  }
  float wcFibre(vec2 wp, vec2 radial) {
    float warp=wcFibreWarp(wp*0.024+vec2(71.0,13.0))-0.5;
    float n=wcFibreGradientNoise(wp*vec2(0.09,0.18)+vec2(0.8,1.3)*warp);
    float raw=0.4+1.9*smoothstep(0.58,0.85,n);
    return ${GRADIENT_FIBRE_MEAN} + ${GRADIENT_FIBRE_STRENGTH} * (raw-${GRADIENT_FIBRE_MEAN});
  }
`

/** Preserve all four existing program strings. Only the optional low program
 * replaces this exact helper, keeping the halo gate and material arithmetic. */
export function withGradientFibres(source: string): string {
  const start = source.indexOf('  float wcFibre(vec2 wp, vec2 radial) {')
  const end = source.indexOf('  #define WC_FIELD_FIT', start)
  if (start < 0 || end < start || source.indexOf('  float wcFibre(', start + 1) >= 0) {
    throw new Error('Watercolor fibre helper seam changed')
  }
  return source.slice(0, start) + GRADIENT_FIBRE_GLSL + source.slice(end)
}
