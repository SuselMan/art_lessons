/** Native-policy-only fragment helpers. Legacy programs never embed this text.
 * Domains are aligned mask allocations in the current tile's GL coordinates;
 * source UVs retain a transparent one-pixel border and hardware LINEAR sampling.
 * This is not the final quantized QPainter interpolation algorithm. */
export const INTEGER_IMAGE_SAMPLING_GLSL = `
uniform float u_tipImageEnabled;
uniform float u_dualImageEnabled;
uniform vec2 u_tipImageUVShift;
uniform vec2 u_dualImageUVShift;
uniform vec4 u_tipImageDomain;
uniform vec4 u_dualImageDomain;
vec4 integerImageSample(sampler2D image,vec2 uv,float enabled,vec4 domain,vec2 shift) {
 vec4 sampleValue=texture2D(image,uv+shift);
 bool outside=gl_FragCoord.x<domain.x || gl_FragCoord.y<domain.y || gl_FragCoord.x>=domain.z || gl_FragCoord.y>=domain.w;
 return enabled>0.5 && outside ? vec4(0.0) : sampleValue;
}
`
