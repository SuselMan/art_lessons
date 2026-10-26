/** Opt-in erf radial mask. The scalar reference mirrors the mathematical
 * sampling contract, not the bitmap/mipmap path. No vendor source is embedded. */
export function gaussianCoverage(radius: number, fade: number): number {
  const k=Math.SQRT2*12500/(6761*fade),a=2.5/Math.SQRT2
  return Math.max(0,Math.min(1,(erf(k*(radius-1)+a)-erf(k*(radius+1)-a))/(2*erf(a-k))))
}
/** Abramowitz–Stegun 7.1.26; scalar absolute error <1.5e-7. */
function erf(x:number):number {
  const sign=x<0?-1:1;x=Math.abs(x)
  if(x>6)return sign
  const t=1/(1+.3275911*x)
  return sign*(1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-x*x))
}
function transparency(x:number,y:number,radius:number,fade:number,antialias:boolean):number {
  const distance=Math.hypot(x,y)
  if(distance>radius)return 255
  const start=Math.max(0,radius-1)
  if(antialias && distance>start){
    const base=255-Math.floor(255*gaussianCoverage(start/radius,fade))
    return Math.floor(base+(255-base)*(distance-start)/(radius-start))
  }
  return 255-Math.floor(255*gaussianCoverage(distance/radius,fade))
}
/** Classify from the admitted physical axes, never from an inverted float matrix. */
export function gaussianSampleCount(minimumDiameter:number,antialias:boolean):number {
  return antialias && minimumDiameter<10 ? minimumDiameter<1?6:3 : 1
}
/** x/y are pixel-centre offsets in canvas pixels for an unrotated circular tip. */
export function gaussianMaskAlpha(x:number,y:number,diameter:number,fade:number,antialias:boolean):number {
  const n=gaussianSampleCount(diameter,antialias)
  let sum=0
  for(let sy=0;sy<n;sy++)for(let sx=0;sx<n;sx++)sum+=transparency(x+sx/n,y+sy/n,diameter*.5,fade,antialias)
  return 255-Math.floor(sum/(n*n))
}

/** Stamp-only: deliberately excluded from all wet shader templates. */
export const BRUSH_GAUSSIAN_GLSL=`
float brushGaussianErf(float x) {
  float direction=x<0.0 ? -1.0 : 1.0;
  x=abs(x);
  if(x>6.0)return direction;
  float t=1.0/(1.0+0.3275911*x);
  float p=(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t);
  return direction*(1.0-p*exp(-x*x));
}
float brushGaussianCoverage(float distance,float radius,float fade) {
  float k=2.614653088250805/fade;
  float a=1.767766952966369;
  // Subtract physical distances first. Normalized/interpolated UV magnifies
  // pixel-boundary error by 1/fade for a near-hard Gaussian.
  return clamp((brushGaussianErf(k*((distance-radius)/radius)+a)-brushGaussianErf(k*((distance+radius)/radius)-a))/(2.0*brushGaussianErf(a-k)),0.0,1.0);
}
float brushGaussianTransparency(vec2 point,float radius,vec2 profile) {
  float distance=length(point);
  if(distance>radius)return 255.0;
  float start=max(0.0,radius-1.0);
  if(profile.y>0.5 && distance>start) {
    float base=255.0-floor(255.0*brushGaussianCoverage(start,radius,profile.x));
    return floor(base+(255.0-base)*(distance-start)/(radius-start));
  }
  return 255.0-floor(255.0*brushGaussianCoverage(distance,radius,profile.x));
}
float brushGaussianMask(vec2 pixel,mat2 pixelFrame,vec2 geometry,vec2 profile) {
  float radius=geometry.x,n=geometry.y;
  if(n<1.5)return (255.0-brushGaussianTransparency(pixelFrame*pixel,radius,profile))/255.0;
  float total=0.0;
  for(int y=0;y<6;y++)for(int x=0;x<6;x++) {
    if(float(x)<n && float(y)<n) {
      // Auto-brush hotspot includes -0.5: sample zero is the pixel centre.
      vec2 offset=vec2(float(x),float(y))/n;
      total+=brushGaussianTransparency(pixelFrame*(pixel+offset),radius,profile);
    }
  }
  return (255.0-floor(total/(n*n)))/255.0;
}
`
