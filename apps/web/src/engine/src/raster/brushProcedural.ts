import type { BrushTip } from '@grafetto/shared';
import { BRUSH_GAUSSIAN_GLSL, gaussianSampleCount, gaussianTransparency, maskSamplingGLSL, maskStencilAlpha } from './gaussianTip';
type Profile = NonNullable<BrushTip['profile']>;
export const proceduralSampleCount = gaussianSampleCount;
export function proceduralProfileUniforms(profile?: Profile): [
    number,
    number,
    number,
    number
] {
    if (!profile)
        return [-1, 0, 0, 0];
    return profile.kind === 'gaussian' ? [0, profile.fade, 0, profile.antialias ? 1 : 0]
        : [profile.shape === 'ellipse' ? 1 : 2, profile.horizontalFade, profile.verticalFade, profile.antialias ? 1 : 0];
}
/** Independently expressed normalized rational fade. Samples return U8
 * transparency; stencil inversion/rounding is shared with Gaussian. */
function standardTransparency(x: number, y: number, rx: number, ry: number, profile: Extract<Profile, {
    kind: 'standard';
}>): number {
    const ax = Math.abs(x), ay = Math.abs(y), u = ax * (1 / rx), v = ay * (1 / ry);
    const ellipse = profile.shape === 'ellipse', n = ellipse ? u * u + v * v : Math.max(u, v);
    if (n > 1)
        return 255;
    const aa = profile.antialias ? 1 : 0;
    const fx = (ax + aa) * (profile.horizontalFade === 0 ? 1 : 1 / (profile.horizontalFade * rx));
    const fy = (ay + aa) * (profile.verticalFade === 0 ? 1 : 1 / (profile.verticalFade * ry));
    let transparency = 0;
    if (ellipse) {
        const q = fx * fx + fy * fy;
        // Exact hard boundary AAoff may produce native0/0; choose bounded
        // transparent boundary rather than introducing NaN into GPU state.
        const value = q < 1 ? 0 : q === n ? 255 : 255 * n * (q - 1) / (q - n);
        return Math.floor(Math.max(0, Math.min(255, value)));
    }
    else {
        // Preserve scalar conditional selection, including a non-selected NaN
        // on exact axes. max(x,y) would incorrectly introduce a vertical fade.
        const a = u * (fx - 1) / (fx - u), b = v * (fy - 1) / (fy - v);
        transparency = fx > 1 ? a : 0;
        if (a < b && fy > 1)
            transparency = b;
    }
    return Math.floor(255 * Math.max(0, Math.min(1, transparency)));
}
/** Pixel-centre displacement in top-down canvas coordinates. Offset the
 * stencil in canvas space before inverse rotation, including anisotropic axes. */
export function proceduralMaskAlpha(x: number, y: number, width: number, height: number, profile: Profile, angle = 0): number {
    if (![x, y, width, height, angle].every(Number.isFinite) || width <= 0 || height <= 0)
        return 0;
    const rx = width * .5, ry = height * .5, c = Math.cos(angle), s = Math.sin(angle);
    const n = proceduralSampleCount(Math.min(width, height), profile.antialias);
    return maskStencilAlpha(x, y, n, (px, py) => {
        const localX = c * px + s * py, localY = -s * px + c * py;
        return profile.kind === 'gaussian' ? gaussianTransparency(localX, localY, rx, profile.fade, profile.antialias)
            : standardTransparency(localX, localY, rx, ry, profile);
    });
}
const STANDARD_GLSL = `
float brushStandardTransparency(vec2 point,vec2 radii,vec4 profile) {
 vec2 a=abs(point),uv=a*(vec2(1.0)/radii);
 bool ellipse=profile.x<1.5;
 float n=ellipse?dot(uv,uv):max(uv.x,uv.y);
 if(n>1.0)return 255.0;
 vec2 coefficients=vec2(profile.y==0.0?1.0:1.0/(profile.y*radii.x),profile.z==0.0?1.0:1.0/(profile.z*radii.y));
 vec2 f=(a+vec2(profile.w>0.5?1.0:0.0))*coefficients;
 float value=0.0;
 if(ellipse){
  float q=dot(f,f);
  value=q<1.0?0.0:q==n?255.0:255.0*n*(q-1.0)/(q-n);
  return floor(clamp(value,0.0,255.0));
 }else{
  // Simulate the native scalar comparison without generating GPU NaN.
  bool undefinedX=f.x==uv.x && (uv.x==0.0 || f.x==1.0);
  float x=f.x==uv.x ? -1.0e30 : uv.x*(f.x-1.0)/(f.x-uv.x);
  value=f.x>1.0?x:0.0;
  if(f.y>1.0 && !undefinedX) {
   float y=uv.y*(f.y-1.0)/(f.y-uv.y);
   if(x<y)value=y;
  }
 }
 return floor(255.0*clamp(value,0.0,1.0));
}
float brushProceduralTransparency(vec2 point,vec2 radii,vec4 profile) {
 if(profile.x<0.5)return brushGaussianTransparency(point,radii.x,vec2(profile.y,profile.w));
 return brushStandardTransparency(point,radii,profile);
}
`;
/** Reuses the exact Gaussian core and the one common1/3/6 sampling template. */
export const BRUSH_PROCEDURAL_GLSL = BRUSH_GAUSSIAN_GLSL.slice(0, BRUSH_GAUSSIAN_GLSL.indexOf('float brushGaussianMask('))
    + STANDARD_GLSL + maskSamplingGLSL({ name: 'brushProceduralMask', geometryType: 'vec4', profileType: 'vec4', setup: 'float radius=geometry.x,n=geometry.z;', sample: 'brushProceduralTransparency', radii: 'geometry.xy' });
