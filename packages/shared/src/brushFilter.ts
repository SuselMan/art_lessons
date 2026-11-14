import {hasFilterMask192Scope,isFilterMask192Payload,type FilterMask192Policy}from'./brushFilterMask192.js'
export interface SpatialBrushFilter{version:1;kind:'gaussian'|'unsharp';radiusX:number;radiusY:number;amount:number;threshold:number;lightnessOnly:boolean}
export interface FilterSmudge147 {smudgeMode:true;sourcePolicy:'canonical-begin-v1'}
type PointwiseBrushFilter={version:2;kind:'invert'}|{version:2;kind:'desaturate';type:0|1|2|3|4|5}|{version:2;kind:'posterize';steps:number}
export type GaussianSmudge153=SpatialBrushFilter&FilterSmudge147&{kind:'gaussian';spatialPolicy:'gaussian-halo-v1'}
export type UnsharpSmudge159=SpatialBrushFilter&FilterSmudge147&{kind:'unsharp';spatialPolicy:'unsharp-lab-halo-v1'}
export type BitmapFilterSmudge169={version:2;kind:'invert';smudgeMode:true;sourcePolicy:'canonical-begin-v1';maskPolicy:'bitmap-alpha-v1'}
export type BitmapFilterSmudge179=((Exclude<PointwiseBrushFilter,{kind:'invert'}>&FilterSmudge147)|GaussianSmudge153|UnsharpSmudge159)&{maskPolicy:'bitmap-alpha-v1'}
export type NativeFilterMask192=(PointwiseBrushFilter|(SpatialBrushFilter&{kind:'gaussian';spatialPolicy:'gaussian-halo-v1'})|(SpatialBrushFilter&{kind:'unsharp';spatialPolicy:'unsharp-lab-halo-v1'}))&FilterMask192Policy
export type BrushFilter=NativeFilterMask192|BitmapFilterSmudge179|BitmapFilterSmudge169|UnsharpSmudge159|GaussianSmudge153|SpatialBrushFilter|PointwiseBrushFilter|(PointwiseBrushFilter&FilterSmudge147)
export function isPosterizeBrushFilter(value:unknown):value is Extract<BrushFilter,{kind:'posterize'}>{
 if(isFilterMask192Payload(value)&&value&&typeof value==='object'&&'kind'in value&&value.kind==='posterize')return true
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return (Object.keys(v).length===3&&Object.keys(v).every(k=>k==='version'||k==='kind'||k==='steps')||v.smudgeMode===true&&v.sourcePolicy==='canonical-begin-v1'&&(Object.keys(v).length===5&&Object.keys(v).every(k=>['version','kind','steps','smudgeMode','sourcePolicy'].includes(k))||v.maskPolicy==='bitmap-alpha-v1'&&Object.keys(v).length===6&&Object.keys(v).every(k=>['version','kind','steps','smudgeMode','sourcePolicy','maskPolicy'].includes(k))))&&v.version===2&&v.kind==='posterize'&&typeof v.steps==='number'&&Number.isInteger(v.steps)&&v.steps>=2&&v.steps<=128
}
export function isFilterDescriptor(d:Record<string,unknown>):boolean{
 if(d.version===192)return hasFilterMask192Scope(d)
 if(d.version===186)return hasFilterHostInitial186Scope(d)
 if(d.filter===undefined)return true
 if(d.filter&&typeof d.filter==='object'&&'maskPolicy'in d.filter)return hasFilterBitmapMaskScope(d)
 if(d.filter&&typeof d.filter==='object'&&'spatialPolicy'in d.filter)return hasFilterGaussian153Scope(d)||hasFilterUnsharp159Scope(d)
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),f=d.filter,b=d.behavior,m=d.mixer,n=(v:unknown,a:number,z:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=z
 const smudge=record(f)&&f.smudgeMode===true&&f.sourcePolicy==='canonical-begin-v1',extra=smudge?2:0
 const shape=record(f)&&((Object.keys(f).every(k=>['version','kind','radiusX','radiusY','amount','threshold','lightnessOnly'].includes(k))&&f.version===1&&['gaussian','unsharp'].includes(String(f.kind))&&n(f.radiusX,0,16)&&n(f.radiusY,0,16)&&n(f.amount,0,5)&&n(f.threshold,0,255)&&typeof f.lightnessOnly==='boolean')||(f.version===2&&f.kind==='invert'&&Object.keys(f).length===2+extra&&Object.keys(f).every(k=>k==='version'||k==='kind'||smudge&&(k==='smudgeMode'||k==='sourcePolicy'))&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=95)||(f.version===2&&f.kind==='desaturate'&&Object.keys(f).length===3+extra&&Object.keys(f).every(k=>k==='version'||k==='kind'||k==='type'||smudge&&(k==='smudgeMode'||k==='sourcePolicy'))&&typeof f.type==='number'&&Number.isInteger(f.type)&&f.type>=0&&f.type<=5&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=99)||(isPosterizeBrushFilter(f)&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=117))
 const smudgeScope=!record(f)||f.smudgeMode===undefined&&f.sourcePolicy===undefined||smudge&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=147&&['invert','desaturate','posterize'].includes(String(f.kind))&&record(d.tip)&&((d.tip.kind==='round'&&d.tip.profile===undefined)||(d.tip.kind==='procedural'&&record(d.tip.profile)&&d.tip.profile.kind==='standard'&&d.tip.profile.shape==='ellipse'))&&['animation','color','material','imageSampling','autoShape','autoNoise'].every(k=>d.tip&&record(d.tip)&&d.tip[k]===undefined)&&record(b)&&b.erase!==true&&b.colorAdjustment===undefined&&b.scatter===undefined&&['clone','mypaint','tangentNormal'].every(k=>d[k]===undefined)
 return smudgeScope&&shape&&d.model==='mixer'&&record(m)&&m.source==='previousCanvas'&&m.algorithm===undefined&&m.foreground===undefined&&m.sampling===undefined&&m.paintThickness===undefined&&['deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined&&(!record(f)||f.kind!=='posterize'||b.erase!==true)&&(!record(f)||f.kind!=='posterize'||['clone','mypaint','tangentNormal'].every(k=>d[k]===undefined))&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'&&b.rendering.wetEdges===0&&b.rendering.burntEdges===0
}

/** Exact pointwise carried filter device, not a translated smudge imprint. */
export function hasFilterSmudge147Scope(value:unknown):boolean {
 if(value&&typeof value==='object'&&'version'in value&&value.version===192)return hasFilterMask192Scope(value)
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>,f=d.filter
 return !!f&&typeof f==='object'&&!Array.isArray(f)&&(f as Record<string,unknown>).smudgeMode===true&&isFilterDescriptor(d)
}

/** Gaussian source OVER updates persistent neededRect; filtered output only dabRect. */
export function hasFilterGaussian153Scope(value:unknown):boolean{
 if(value&&typeof value==='object'&&'version'in value&&value.version===192)return hasFilterMask192Scope(value)&&'filter'in value&&!!value.filter&&typeof value.filter==='object'&&'kind'in value.filter&&value.filter.kind==='gaussian'
 if(value&&typeof value==='object'&&!Array.isArray(value)&&'version'in value&&value.version===186)return hasFilterHostInitial186Scope(value)&&'filter'in value&&!!value.filter&&typeof value.filter==='object'&&'kind'in value.filter&&value.filter.kind==='gaussian'
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 if(value&&typeof value==='object'&&!Array.isArray(value)){const d=value as Record<string,unknown>,f=d.filter;if(f&&typeof f==='object'&&'maskPolicy'in f)return (f as Record<string,unknown>).kind==='gaussian'&&hasFilterBitmap179Scope(d)}
 const d=value as Record<string,unknown>,f=d.filter
 if(!f||typeof f!=='object'||Array.isArray(f))return false
 const x=f as Record<string,unknown>,keys=['version','kind','radiusX','radiusY','amount','threshold','lightnessOnly','smudgeMode','sourcePolicy','spatialPolicy']
 if(!Number.isInteger(d.version)||Number(d.version)<153||Object.keys(x).length!==keys.length||Object.keys(x).some(k=>!keys.includes(k))||x.version!==1||x.kind!=='gaussian'||x.smudgeMode!==true||x.sourcePolicy!=='canonical-begin-v1'||x.spatialPolicy!=='gaussian-halo-v1'||!['radiusX','radiusY'].every(k=>typeof x[k]==='number'&&Number.isFinite(x[k])&&Number(x[k])>=0&&Number(x[k])<=16)||x.amount!==.5||x.threshold!==0||x.lightnessOnly!==true)return false
 // Reuse exactly the147 root/geometry/source restrictions, without recursive spatial dispatch.
 return isFilterDescriptor({...d,filter:{version:2,kind:'invert',smudgeMode:true,sourcePolicy:'canonical-begin-v1'}})
}

/** Native Unsharp spatial device, both raw and Lab/alpha branches; exact newpolicy. */
export function hasFilterUnsharp159Scope(value:unknown):boolean{
 if(value&&typeof value==='object'&&'version'in value&&value.version===192)return hasFilterMask192Scope(value)&&'filter'in value&&!!value.filter&&typeof value.filter==='object'&&'kind'in value.filter&&value.filter.kind==='unsharp'
 if(value&&typeof value==='object'&&!Array.isArray(value)&&'version'in value&&value.version===186)return hasFilterHostInitial186Scope(value)&&'filter'in value&&!!value.filter&&typeof value.filter==='object'&&'kind'in value.filter&&value.filter.kind==='unsharp'
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 if(value&&typeof value==='object'&&!Array.isArray(value)){const d=value as Record<string,unknown>,f=d.filter;if(f&&typeof f==='object'&&'maskPolicy'in f)return (f as Record<string,unknown>).kind==='unsharp'&&hasFilterBitmap179Scope(d)}
 const d=value as Record<string,unknown>,f=d.filter;if(!f||typeof f!=='object'||Array.isArray(f))return false
 const x=f as Record<string,unknown>,keys=['version','kind','radiusX','radiusY','amount','threshold','lightnessOnly','smudgeMode','sourcePolicy','spatialPolicy'],n=(v:unknown,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b
 if(d.version!==159||Object.keys(x).length!==keys.length||Object.keys(x).some(k=>!keys.includes(k))||x.version!==1||x.kind!=='unsharp'||x.smudgeMode!==true||x.sourcePolicy!=='canonical-begin-v1'||x.spatialPolicy!=='unsharp-lab-halo-v1'||!n(x.radiusX,0,16)||x.radiusY!==x.radiusX||!n(x.amount,0,5)||!n(x.threshold,0,255)||!Number.isInteger(x.threshold)||typeof x.lightnessOnly!=='boolean')return false
 const behavior=d.behavior as Record<string,unknown>|undefined;if(behavior?.softness!==undefined||[behavior?.dynamics,behavior?.modulations].some(v=>!!v&&typeof v==='object'&&'softness'in v))return false
 return isFilterDescriptor({...d,filter:{version:2,kind:'invert',smudgeMode:true,sourcePolicy:'canonical-begin-v1'}})
}

/** Static ordinary bitmap alpha coverage; same147 temporary/source/pass. */
export function hasFilterBitmap169Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||value.version!==169||!obj(value.filter)||!obj(value.tip)||!obj(value.behavior))return false
 const d=value,f=d.filter,t=d.tip,b=d.behavior
 if(!obj(f)||!obj(t)||!obj(b))return false
 const n=(v:unknown,a:number,z:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=z
 if(!n(t.hardness,0,1)||!n(t.aspect,1,16)||!n(t.angle,-Math.PI*2,Math.PI*2)||typeof t.rotation!=='string'||!['fixed','path','travel'].includes(t.rotation))return false
 if(t.maskBounds!==undefined){const q=t.maskBounds;if(!obj(q)||Object.keys(q).length!==4||!n(q.x,0,1)||!n(q.y,0,1)||!n(q.width,1/2048,1)||!n(q.height,1/2048,1)||Number(q.x)+Number(q.width)>1||Number(q.y)+Number(q.height)>1)return false}
 if(Object.keys(f).length!==5||Object.keys(f).some(k=>!['version','kind','smudgeMode','sourcePolicy','maskPolicy'].includes(k))||f.version!==2||f.kind!=='invert'||f.smudgeMode!==true||f.sourcePolicy!=='canonical-begin-v1'||f.maskPolicy!=='bitmap-alpha-v1')return false
 if(t.kind!=='bitmap'||typeof t.mask!=='string'||!/^asset:[a-f0-9]{64}$/.test(t.mask)||Object.keys(t).some(k=>!['kind','mask','maskBounds','hardness','aspect','rotation','angle'].includes(k))||['dual','timing','erase','wetMix','taper','scatter','colorAdjustment'].some(k=>b[k]!==undefined))return false
 return isFilterDescriptor({...d,filter:{version:2,kind:'invert',smudgeMode:true,sourcePolicy:'canonical-begin-v1'},tip:{kind:'round',hardness:t.hardness,aspect:t.aspect,rotation:t.rotation,angle:t.angle}})
}

/** Validation-only proxies retain the exact169 geometry and existing filter laws. */
export function hasFilterBitmap179Scope(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>,f=d.filter,t=d.tip
 if(d.version!==179||!f||typeof f!=='object'||Array.isArray(f)||!t||typeof t!=='object'||Array.isArray(t))return false
 const x=f as Record<string,unknown>,tip=t as Record<string,unknown>
 if(x.maskPolicy!=='bitmap-alpha-v1'||!['desaturate','posterize','gaussian','unsharp'].includes(String(x.kind)))return false
 if(!hasFilterBitmap169Scope({...d,version:169,filter:{version:2,kind:'invert',smudgeMode:true,sourcePolicy:'canonical-begin-v1',maskPolicy:'bitmap-alpha-v1'}}))return false
 const filter={...x};delete filter.maskPolicy
 const proxy={...d,filter,tip:{kind:'round',hardness:tip.hardness,aspect:tip.aspect,rotation:tip.rotation,angle:tip.angle}}
 return x.kind==='unsharp'?hasFilterUnsharp159Scope({...proxy,version:159}):x.kind==='gaussian'?hasFilterGaussian153Scope(proxy):isFilterDescriptor(proxy)
}
export function hasFilterBitmapMaskScope(value:unknown):boolean{return hasFilterMask192Scope(value)&&!!value&&typeof value==='object'&&'tip'in value&&!!value.tip&&typeof value.tip==='object'&&'kind'in value.tip&&value.tip.kind==='bitmap'||hasFilterBitmap169Scope(value)||hasFilterBitmap179Scope(value)||hasFilterHostInitial186Scope(value)&&!!value&&typeof value==='object'&&'tip'in value&&!!value.tip&&typeof value.tip==='object'&&'kind'in value.tip&&value.tip.kind==='bitmap'}

/** Guard-only host-initial admission. BEGIN already emits the first request.
 * Qualified native host domain: NO_SMOOTHING/fan-off, no active sensors or timer.
 * Proxies validate the unchanged filter payload; they never retain revision186.
 */
export function hasFilterHostInitial186Scope(value:unknown):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||value.version!==186||!obj(value.filter)||!obj(value.tip)||!obj(value.behavior))return false
 const d=value,f=d.filter,t=d.tip,b=d.behavior
 if(!obj(f)||!obj(t)||!obj(b)||f.smudgeMode!==true||f.sourcePolicy!=='canonical-begin-v1'||!['invert','desaturate','posterize','gaussian','unsharp'].includes(String(f.kind)))return false
 const flat=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[1]===1)
 if(!flat(d.sizeByPressure)||!flat(d.opacityByPressure)||!flat(d.flowByPressure)||d.pressureSmoothingPx!==0||d.flow!==1||d.flowPer!=='stamp'||typeof d.opacity!=='number'||!Number.isFinite(d.opacity)||d.opacity<0||d.opacity>1)return false
 if(t.rotation!=='fixed'||Object.keys(b).some(k=>!['version','rendering','spacing','speedInput'].includes(k)))return false
 if(b.spacing!==undefined&&(!obj(b.spacing)||Object.keys(b.spacing).some(k=>!['mode','coefficient','isotropic','axisScale','angleOffset'].includes(k))))return false
 if(b.speedInput!==undefined&&(!obj(b.speedInput)||Object.keys(b.speedInput).length!==4||Object.keys(b.speedInput).some(k=>!['version','space','maximum','estimator'].includes(k))||b.speedInput.version!==1||b.speedInput.space!=='view'||b.speedInput.maximum!==30||b.speedInput.estimator!=='grafettoEMA30ms'))return false
 const r=b.rendering,m=d.mixer
 if(!obj(r)||r.mode!=='buildUp'||r.blendMode!=='normal'||r.accumulation!=='directOver'||r.wetEdges!==0||r.burntEdges!==0||Object.keys(r).some(k=>!['mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode'].includes(k)))return false
 if(!obj(m)||m.load!==0||m.pickup!==1||m.strength!==1||m.initialLoad!==0||m.source!=='previousCanvas'||Object.keys(m).some(k=>!['load','pickup','strength','initialLoad','source'].includes(k)))return false
 if(t.kind!=='bitmap'&&Object.keys(t).some(k=>!['kind','hardness','aspect','angle','rotation','profile'].includes(k)))return false
 const bitmap=t.kind==='bitmap'
 const version=bitmap?(f.kind==='invert'?169:179):f.kind==='unsharp'?159:f.kind==='gaussian'?153:147
 const proxy={...d,version}
 return bitmap?(f.kind==='invert'?hasFilterBitmap169Scope(proxy):hasFilterBitmap179Scope(proxy)):isFilterDescriptor(proxy)
}
