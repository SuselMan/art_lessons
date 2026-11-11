import {isBrushBehavior,isNativePressureRateTiming,type BrushDynamic} from './brushBehavior.js'
/** Connections between canonical author input points within one gesture. */
export interface BrushSketch {
 version:1
 mode:'simple'|'mask'
 maskSize?:readonly[number,number]
 /** Native IMAGESTAMP is a point selector through raw alpha, never source RGB. */
 maskSignal?:'image-alpha-v1'|'procedural-standard-v1'|'gih-alpha-v1'
 width:number
 offset:number
 probability:number
 connect:boolean
 magnetify:boolean
 randomRGB:boolean
 randomOpacity:boolean
 distanceDensity:boolean
 distanceOpacity:boolean
 /** Explicit functional policy for negative rectangular-mask corners. */
 distanceOpacityPolicy?:'generic-clamp-v1'
 antialias:boolean
 dynamics?:{width?:BrushDynamic[];offset?:BrushDynamic[];probability?:BrushDynamic[]}
}
export function isBrushSketch(value:unknown):value is BrushSketch{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,number=(x:unknown,lo:number,hi:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi
 if(Object.keys(v).some(k=>!['version','mode','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias','dynamics','maskSize','distanceOpacityPolicy','maskSignal'].includes(k)))return false
 if(v.version!==1||(v.mode!=='simple'&&v.mode!=='mask')||!number(v.width,.01,1000)||!number(v.offset,-10,10)||!number(v.probability,0,1)||!['connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias'].every(k=>typeof v[k]==='boolean'))return false
 if(v.mode==='simple'||v.maskSignal==='procedural-standard-v1'?v.maskSize!==undefined:!Array.isArray(v.maskSize)||v.maskSize.length!==2||!v.maskSize.every(n=>number(n,1,256)&&Number.isInteger(n)) )return false
 if(v.maskSignal!==undefined&&(!['image-alpha-v1','procedural-standard-v1','gih-alpha-v1'].includes(String(v.maskSignal))||v.mode!=='mask'))return false
 if(v.mode==='mask'&&v.distanceOpacity?v.distanceOpacityPolicy!=='generic-clamp-v1':v.distanceOpacityPolicy!==undefined)return false
 if(v.dynamics!==undefined){
  if(!v.dynamics||typeof v.dynamics!=='object'||Array.isArray(v.dynamics))return false
  for(const [key,controls]of Object.entries(v.dynamics))if(!['width','offset','probability'].includes(key)||!isBrushBehavior({version:2,modulations:{size:controls}}))return false
 }
 return true
}

/** Closed static-rate simple Sketch author timer; no replay resampling. */
export function hasSketchTimer161Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushSketch(value.sketch)||value.sketch.mode!=='simple')return false
 const t=value.tip,b=value.behavior,r=b.rendering,c=b.timing
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=161&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&value.flowPer==='stamp'&&one(value.flowByPressure)
 &&['mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx'].every(k=>value[k]===undefined)
 &&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0&&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering','timing','speedInput'].includes(k))&&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')&&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
 &&isNativePressureRateTiming(c,Number(value.version)>=164)
}

/** Native static IMAGESTAMP -> existing alpha-only Sketch selector. */
export function hasSketchImageAlpha162Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushSketch(value.sketch))return false
 const t=value.tip,b=value.behavior,r=b.rendering,s=value.sketch
 return Number.isInteger(value.version)&&Number(value.version)>=162&&s.mode==='mask'&&s.maskSignal==='image-alpha-v1'&&value.model==='stamp'&&value.paperInteraction===0
 &&['mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet'].every(k=>value[k]===undefined)
 &&t.kind==='bitmap'&&t.aspect===1&&['color','animation','material','imageSampling','profile','autoNoise','autoShape'].every(k=>t[k]===undefined)
 &&b.version===2&&['dual','timing','erase','wetMix','taper','mirror','edgeBleed','grain'].every(k=>b[k]===undefined)
 &&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}

/** New root-only static procedural Sketch selector; schema validation remains
 * the whole-library authority. Pressure/off Size/Rotation/Opacity are reused. */
export function hasSketchProcedural173Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushSketch(value.sketch))return false
 const t=value.tip,b=value.behavior,s=value.sketch,p=t.profile,r=b.rendering
 const controls=(v:unknown)=>Array.isArray(v)&&v.length<=4&&v.every(c=>obj(c)&&typeof c.control==='string'&&['pressure','off'].includes(c.control)&&Object.keys(c).every(k=>['control','minimum','jitter','curve'].includes(k))&&c.jitter===0)
 if(!Number.isInteger(value.version)||Number(value.version)<173||s.mode!=='mask'||s.maskSignal!=='procedural-standard-v1'||s.maskSize!==undefined||value.model!=='stamp'||value.paperInteraction!==0)return false
 if(['mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet'].some(k=>value[k]!==undefined))return false
 if(t.kind!=='procedural'||t.rotation!=='fixed'||!obj(p)||p.kind!=='standard'||(typeof p.shape!=='string'||!['ellipse','rectangle'].includes(p.shape))||Object.keys(t).some(k=>!['kind','hardness','aspect','angle','rotation','profile'].includes(k))||t.hardness!==1||typeof t.aspect!=='number'||!Number.isFinite(t.aspect)||t.aspect<1||t.aspect>16)return false
 if(Object.keys(p).some(k=>!['kind','shape','horizontalFade','verticalFade','antialias'].includes(k))||typeof p.antialias!=='boolean'||![p.horizontalFade,p.verticalFade].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))return false
 if(b.version!==2||Object.keys(b).some(k=>!['version','rendering','dynamics','modulations','speedInput','rotation'].includes(k)))return false
 for(const table of[b.dynamics,b.modulations])if(table!==undefined){if(!obj(table)||Object.entries(table).some(([key,v])=>!['size','opacity'].includes(key)||!controls(Array.isArray(v)?v:[v])))return false}
 if(s.dynamics&&Object.values(s.dynamics).some(v=>!controls(v)))return false
 if(b.rotation!==undefined){const q=b.rotation;if(!obj(q)||Object.keys(q).some(k=>!['follow','random','composition'].includes(k))||q.follow!==0||q.random!=='none'||!obj(q.composition))return false;const c=q.composition;if(Object.keys(c).some(k=>!['strength','additive','scaling','scalingMode'].includes(k))||typeof c.strength!=='number'||!Number.isFinite(c.strength)||Math.abs(c.strength)>1||!Array.isArray(c.additive)||c.additive.length!==0||!controls(c.scaling??[])||c.scalingMode!==undefined&&c.scalingMode!=='product')return false}
 // A physical input<=400 remains bounded after these non-expanding Size leaves.
 const unitCurve=(c:unknown)=>obj(c)&&(c.curve===undefined||Array.isArray(c.curve)&&c.curve.every(p=>Array.isArray(p)&&typeof p[1]==='number'&&p[1]>=0&&p[1]<=1)||obj(c.curve)&&Array.isArray(c.curve.samples)&&c.curve.samples.every(n=>typeof n==='number'&&n>=0&&n<=1))
 for(const table of[b.dynamics,b.modulations])if(obj(table)&&table.size!==undefined&&!((Array.isArray(table.size)?table.size:[table.size]).every(unitCurve)))return false
 return obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}

/** Incremental equal-geometry ordinary alpha GIH, selected per generated mask. */
export function hasSketchGih174Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!Number.isInteger(value.version)||Number(value.version)<174||!obj(value.tip)||!obj(value.sketch)||value.sketch.maskSignal!=='gih-alpha-v1')return false
 const a=value.tip.animation
 if(!obj(a)||Object.keys(a).some(k=>!['mode','frames'].includes(k))||a.mode!=='incremental'||!Array.isArray(a.frames)||a.frames.length<2||a.frames.length>256||a.frames.some(id=>typeof id!=='string'||!/^asset:[a-f0-9]{64}$/.test(id))||value.tip.mask!==a.frames[0])return false
 const unit=(c:unknown):boolean=>Array.isArray(c)?c.length>=2&&c.every(p=>Array.isArray(p)&&typeof p[1]==='number'&&Number.isFinite(p[1])&&p[1]>=0&&p[1]<=1):obj(c)&&Array.isArray(c.samples)&&c.samples.length>=2&&c.samples.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)
 if(!unit(value.sizeByPressure)||!obj(value.behavior))return false
 for(const table of[value.behavior.dynamics,value.behavior.modulations])if(table!==undefined){if(!obj(table))return false;const size=table.size;if(size!==undefined&&!(Array.isArray(size)?size:[size]).every(c=>obj(c)&&typeof c.control==='string'&&['pressure','off'].includes(c.control)&&c.jitter===0&&Object.keys(c).every(k=>['control','minimum','jitter','curve'].includes(k))&&(c.curve===undefined||unit(c.curve))))return false}
 const tip={...value.tip};delete tip.animation
 return hasSketchImageAlpha162Scope({...value,version:162,tip,sketch:{...value.sketch,maskSignal:'image-alpha-v1'}})
}

/**181 pressure GIH uses the existing selector; old174 stays incremental. */
export function hasSketchPressureGih181Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||typeof value.version!=='number'||!Number.isInteger(value.version)||value.version<181||!obj(value.tip))return false
 const a=value.tip.animation
 if(!obj(a)||Object.keys(a).some(k=>!['mode','rank','frames'].includes(k))||a.mode!=='pressure'||typeof a.rank!=='number'||!Number.isInteger(a.rank)||!Array.isArray(a.frames)||a.rank!==a.frames.length||a.rank<2||a.rank>256)return false
 return hasSketchGih174Scope({...value,tip:{...value.tip,animation:{mode:'incremental',frames:a.frames}}})
}

/**182 single angular axis: raw captured source direction, never painted angle. */
export function hasSketchAngularGih182Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||typeof value.version!=='number'||!Number.isInteger(value.version)||value.version<182||!obj(value.tip)||!obj(value.behavior))return false
 const a=value.tip.animation,input=value.behavior.strokeInput
 if(!obj(a)||Object.keys(a).some(k=>!['mode','rank','cursorPolicy','frames'].includes(k))||a.mode!=='angular'||a.cursorPolicy!=='first-request-v1'||typeof a.rank!=='number'||!Number.isInteger(a.rank)||!Array.isArray(a.frames)||a.rank!==a.frames.length||a.rank<2||a.rank>256)return false
 if(!obj(input)||Object.keys(input).length!==2||input.version!==1||input.initialDirection!=='cursorHistory')return false
 return hasSketchGih174Scope({...value,tip:{...value.tip,animation:{mode:'incremental',frames:a.frames}}})
}
