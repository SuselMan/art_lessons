import{isNativePressureRateTiming}from'./brushBehavior.js'
export interface BrushDeform{version:1;sourcePolicy?:'canonical-begin-v1';mode:1|2|3|4|5|6|7|8;amount:number;counter:boolean;bilinear:boolean;density:number;jitter:number;baseScale:number}
export function isBrushDeform(value:unknown):value is BrushDeform{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','sourcePolicy','mode','amount','counter','bilinear','density','jitter','baseScale'].includes(k))&&v.version===1&&(v.sourcePolicy===undefined||v.sourcePolicy==='canonical-begin-v1')&&Number.isInteger(v.mode)&&n(v.mode,1,8)&&n(v.amount,0,1)&&n(v.density,0,1)&&n(v.jitter,0,10)&&n(v.baseScale,.01,10)&&typeof v.counter==='boolean'&&typeof v.bilinear==='boolean'
}
export function isDeformDescriptor(d:Record<string,unknown>):boolean{
 if(d.deform===undefined)return true
 const b=d.behavior,m=d.mixer,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return isBrushDeform(d.deform)&&(d.deform.sourcePolicy===undefined||d.version===145||hasDeformTimer160Scope(d))&&d.model==='mixer'&&record(m)&&m.source==='previousCanvas'&&m.algorithm===undefined&&m.sampling===undefined&&m.foreground===undefined&&m.paintThickness===undefined&&['experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(b)&&b.version===2&&(d.deform.sourcePolicy===undefined||b.erase===undefined)&&b.dual===undefined&&(b.timing===undefined||hasDeformTimer160Scope(d))&&b.wetMix===undefined&&b.taper===undefined&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'&&b.rendering.wetEdges===0&&b.rendering.burntEdges===0
}

/** Transaction-source opt-in; old current-data Deform remains unchanged. */
export function hasDeformOldData145Scope(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>
 if(d.version!==145)return hasDeformTimer160Scope(d)
 return ['clone','mypaint','tangentNormal','filter'].every(k=>d[k]===undefined)&&d.version===145&&isDeformDescriptor(d)&&!!d.deform&&(d.deform as BrushDeform).sourcePolicy==='canonical-begin-v1'
}

/** Existing canonical source145 plus static native airbrush scheduler. */
export function hasDeformTimer160Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!Number.isInteger(value.version)||Number(value.version)<160||!obj(value.tip)||!obj(value.behavior)||!obj(value.mixer))return false
 const b=value.behavior,c=b.timing,t=value.tip,m=value.mixer,r=b.rendering,spacing=b.spacing
 if(!isNativePressureRateTiming(c,Number(value.version)>=165))return false
 if(t.kind!=='round'||['profile','animation','color','material','imageSampling','autoNoise','autoShape'].some(k=>t[k]!==undefined)||!obj(r)||r.mode!=='buildUp'||!obj(spacing)||spacing.mode!=='diameter'||spacing.isotropic!==true||typeof spacing.coefficient!=='number'||!Number.isFinite(spacing.coefficient)||spacing.coefficient<=0||spacing.coefficient>100||Object.keys(spacing).some(k=>!['mode','coefficient','isotropic'].includes(k)))return false
 if(m.load!==0||m.initialLoad!==0||m.pickup!==1||m.strength!==1||typeof m.smearAlpha!=='boolean'||Object.keys(m).some(k=>!['load','initialLoad','pickup','strength','source','smearAlpha'].includes(k)))return false
 const behavior={...b};delete behavior.timing
 return hasDeformOldData145Scope({...value,version:145,behavior})
}
