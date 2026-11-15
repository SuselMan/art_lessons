import{BRUSH_BLEND_MODES}from'./brushBehavior.js'
import type{SketchSprayComposite194}from'./brushSketchSpray194.js'
/** Spray population is distinct from Pixel scatter: area and particle size are independent. */
export interface BrushSpray {
  version: 1
  composite?:SketchSprayComposite194
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
  particle: { image?:true; shape: 'ellipse'|'rectangle'|'pixel'|'bilinear'|'tip'; width: number; height: number; proportional: boolean }
  dynamics: { randomSize: boolean; fixedAngle: number; randomAngle: number; radialAngle: number; pathAngle: number }
  color: { sourcePolicy?:'canonical-begin-v1';sampleInput?:true;mixBackground?:true;fillBackground?:true;perParticle: boolean; hue: number; saturation: number; value: number; randomOpacity: boolean }
}
export function isBrushSpray(value: unknown): value is BrushSpray {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v=value as Record<string,unknown>
  const n=(x:unknown,lo:number,hi:number):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi
  const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
  if(Object.keys(v).some(k=>!['version','composite','diameter','scale','aspect','angle','count','density','jitter','radial','angular','particle','dynamics','color'].includes(k)))return false
  if(v.composite!==undefined&&![...BRUSH_BLEND_MODES,'copy','grainMerge','grainExtract','negation'].includes(String(v.composite)))return false
  const cdf=(x:unknown):boolean=>typeof x==='string'&&/^[0-9a-f]{1028}$/.test(x)&&Array.from({length:256},(_,i)=>parseInt(x.slice((i+1)*4,(i+2)*4),16)>=parseInt(x.slice(i*4,(i+1)*4),16)).every(Boolean)
  if(v.version!==1||!n(v.diameter,.01,10000)||!n(v.scale,.01,4)||!n(v.aspect,.01,4)||!n(v.angle,-Math.PI*2,Math.PI*2)||!n(v.count,0,1024)||!Number.isInteger(v.count)||v.density!==undefined&&!n(v.density,0,1)||!n(v.jitter,0,4)||!object(v.radial)||Object.keys(v.radial).some(k=>!['maximum','samples'].includes(k))||!n(v.radial.maximum,.001,10)||!cdf(v.radial.samples)||!cdf(v.angular))return false
  if(!object(v.particle)||(v.particle.image!==undefined&&(v.particle.image!==true||v.particle.shape!=='tip'))||Object.keys(v.particle).some(k=>!['image','shape','width','height','proportional'].includes(k))||!['ellipse','rectangle','pixel','bilinear','tip'].includes(String(v.particle.shape))||!n(v.particle.width,.01,10000)||!n(v.particle.height,.01,10000)||typeof v.particle.proportional!=='boolean')return false
  if(!object(v.dynamics)||Object.keys(v.dynamics).some(k=>!['randomSize','fixedAngle','randomAngle','radialAngle','pathAngle'].includes(k))||typeof v.dynamics.randomSize!=='boolean'||!n(v.dynamics.fixedAngle,-Math.PI*2,Math.PI*2)||!n(v.dynamics.randomAngle,0,1)||!n(v.dynamics.radialAngle,0,1)||!n(v.dynamics.pathAngle,0,1))return false
  return object(v.color)&&(v.color.sourcePolicy===undefined||v.color.sourcePolicy==='canonical-begin-v1'&&v.color.sampleInput===true)&&['sampleInput','mixBackground','fillBackground'].every(k=>(v.color as Record<string,unknown>)[k]===undefined||(v.color as Record<string,unknown>)[k]===true)&&!Object.keys(v.color).some(k=>!['sourcePolicy','sampleInput','mixBackground','fillBackground','perParticle','hue','saturation','value','randomOpacity'].includes(k))&&typeof v.color.perParticle==='boolean'&&typeof v.color.randomOpacity==='boolean'&&n(v.color.hue,-1,1)&&n(v.color.saturation,-1,1)&&n(v.color.value,-1,1)
}

/** New133 scope only. Ordinary schema/CAS validation remains mandatory. A request
 * image is OVER internally, then alpha-darkened once into the EXISTING stroke
 * coverage owner. Historical directOver Spray definitions never opt in. */
export function hasSprayWash133Scope(value:unknown):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
 if(!obj(value)||!obj(value.spray)||!obj(value.tip)||!obj(value.behavior))return false
 const s=value.spray,t=value.tip,b=value.behavior,r=b.rendering
 if(value.model!=='stamp'||!Number.isInteger(value.version)||Number(value.version)<133||value.paperInteraction!==0||value.flow!==1||!Array.isArray(value.flowByPressure)||value.flowByPressure.length<2||!value.flowByPressure.every(v=>Array.isArray(v)&&v.length===2&&typeof v[0]==='number'&&Number.isFinite(v[0])&&v[0]>=0&&v[0]<=1&&v[1]===1))return false
 if(['mixer','wet','texture','scatter','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>value[k]!==undefined))return false
 if(b.version!==2||b.erase===true||['dual','taper','edgeBleed','wetMix','grain','colorAdjustment','sequentialRandom','strokeInput','clockRead'].some(k=>b[k]!==undefined)||!obj(r)||r.mode!=='buildUp'||r.blendMode!=='normal'||r.accumulation!=='alphaDarken'||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0)return false
 for(const key of ['dynamics','modulations'])if(obj(b[key])&&['flow','hue','saturation','brightness'].some(k=>(b[key] as Record<string,unknown>)[k]!==undefined))return false
 if(!obj(s.particle)||!obj(s.color)||s.particle.image!==undefined||['sampleInput','mixBackground','fillBackground'].some(k=>(s.color as Record<string,unknown>)[k]!==undefined))return false
 if(['color','material','imageSampling','autoShape','autoNoise','alphaThreshold'].some(k=>t[k]!==undefined))return false
 if(!['round','procedural','bitmap'].includes(String(t.kind)))return false
 if(t.profile!==undefined&&(!obj(t.profile)||t.profile.kind!=='standard'))return false
 if(s.particle.shape==='tip'&&(t.kind!=='bitmap'||t.profile!==undefined||typeof t.mask!=='string'))return false
 if(t.animation!==undefined){const a=t.animation;if(s.particle.shape!=='tip'||!obj(a)||!['random','incremental'].includes(String(a.mode))||Object.keys(a).some(k=>!['mode','frames'].includes(k))||!Array.isArray(a.frames)||a.frames.length<2||a.frames.length>256||!a.frames.every(x=>typeof x==='string'))return false}
 return true
}

/** Canonical layer-BEGIN colour sampling. Historical source requests retain
 * their existing current-layer timing unless this explicit policy is present. */
export function hasSpraySource146Scope(value:unknown):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||value.model!=='stamp'||!Number.isInteger(value.version)||Number(value.version)<146||!obj(value.spray)||!obj(value.spray.color)||!obj(value.spray.particle)||!obj(value.tip)||!obj(value.behavior))return false
 const s=value.spray,t=value.tip,b=value.behavior,r=b.rendering,c=s.color as Record<string,unknown>,p=s.particle as Record<string,unknown>
 if(c.sourcePolicy!=='canonical-begin-v1'||c.sampleInput!==true||p.image!==undefined||value.paperInteraction!==0)return false
 if(['mixer','wet','texture','scatter','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>value[k]!==undefined))return false
 if(b.version!==2||b.erase===true||['dual','taper','edgeBleed','wetMix','grain'].some(k=>b[k]!==undefined)||!obj(r)||r.blendMode!=='normal'||r.accumulation!=='directOver'||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0)return false
 if(['material','color','imageSampling','autoShape','autoNoise'].some(k=>t[k]!==undefined))return false
 if(p.shape==='tip'&&t.profile!==undefined)return false
 return true
}
