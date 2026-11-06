/** Spray population is distinct from Pixel scatter: area and particle size are independent. */
export interface BrushSpray {
  version: 1
  diameter: number
  scale: number
  aspect: number
  angle: number
  count: number
  density?: number
  jitter: number
  /** Inverse CDF samples, compiled on import; no per-frame integration. */
  radial: { maximum:number; samples:string }
  angular: string
  particle: { shape: 'ellipse'|'rectangle'|'pixel'|'bilinear'|'tip'; width: number; height: number; proportional: boolean }
  dynamics: { randomSize: boolean; fixedAngle: number; randomAngle: number; radialAngle: number; pathAngle: number }
  color: { perParticle: boolean; hue: number; saturation: number; value: number; randomOpacity: boolean }
}
export function isBrushSpray(value: unknown): value is BrushSpray {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v=value as Record<string,unknown>
  const n=(x:unknown,lo:number,hi:number):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi
  const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
  if(Object.keys(v).some(k=>!['version','diameter','scale','aspect','angle','count','density','jitter','radial','angular','particle','dynamics','color'].includes(k)))return false
  const cdf=(x:unknown):boolean=>typeof x==='string'&&/^[0-9a-f]{1028}$/.test(x)&&Array.from({length:256},(_,i)=>parseInt(x.slice((i+1)*4,(i+2)*4),16)>=parseInt(x.slice(i*4,(i+1)*4),16)).every(Boolean)
  if(v.version!==1||!n(v.diameter,.01,10000)||!n(v.scale,.01,4)||!n(v.aspect,.01,4)||!n(v.angle,-Math.PI*2,Math.PI*2)||!n(v.count,0,1024)||!Number.isInteger(v.count)||v.density!==undefined&&!n(v.density,0,1)||!n(v.jitter,0,4)||!object(v.radial)||Object.keys(v.radial).some(k=>!['maximum','samples'].includes(k))||!n(v.radial.maximum,.001,10)||!cdf(v.radial.samples)||!cdf(v.angular))return false
  if(!object(v.particle)||Object.keys(v.particle).some(k=>!['shape','width','height','proportional'].includes(k))||!['ellipse','rectangle','pixel','bilinear','tip'].includes(String(v.particle.shape))||!n(v.particle.width,.01,10000)||!n(v.particle.height,.01,10000)||typeof v.particle.proportional!=='boolean')return false
  if(!object(v.dynamics)||Object.keys(v.dynamics).some(k=>!['randomSize','fixedAngle','randomAngle','radialAngle','pathAngle'].includes(k))||typeof v.dynamics.randomSize!=='boolean'||!n(v.dynamics.fixedAngle,-Math.PI*2,Math.PI*2)||!n(v.dynamics.randomAngle,0,1)||!n(v.dynamics.radialAngle,0,1)||!n(v.dynamics.pathAngle,0,1))return false
  return object(v.color)&&!Object.keys(v.color).some(k=>!['perParticle','hue','saturation','value','randomOpacity'].includes(k))&&typeof v.color.perParticle==='boolean'&&typeof v.color.randomOpacity==='boolean'&&n(v.color.hue,-1,1)&&n(v.color.saturation,-1,1)&&n(v.color.value,-1,1)
}
