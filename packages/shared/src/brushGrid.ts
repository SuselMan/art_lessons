import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
export interface BrushGrid{
 version:1
 sourcePolicy?:'canonical-begin-v1'
 fillBackground?:true
 mixBackground?:true
 hsv?:{hue:number;saturation:number;value:number}
 width:number
 height:number
 scale:number
 offset:[number,number]
 division:number
 pressureDivision:boolean
 border:[number,number]
 randomBorder:boolean
 shape:0|1|2|3|4
 sampleInput:boolean
 colorPerCell:boolean
 randomOpacity:boolean
}
export function isBrushGrid(value:unknown):value is BrushGrid{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','width','height','scale','offset','division','pressureDivision','border','randomBorder','shape','sampleInput','colorPerCell','randomOpacity','fillBackground','mixBackground','hsv','sourcePolicy'].includes(k))&&(v.sourcePolicy===undefined||v.sourcePolicy==='canonical-begin-v1')&&(v.fillBackground===undefined||v.fillBackground===true)&&(v.mixBackground===undefined||v.mixBackground===true)&&(v.hsv===undefined||typeof v.hsv==='object'&&v.hsv!==null&&!Array.isArray(v.hsv)&&Object.keys(v.hsv).length===3&&['hue','saturation','value'].every(k=>n((v.hsv as Record<string,unknown>)[k],-1,1)))&&v.version===1&&n(v.width,1,1024)&&n(v.height,1,1024)&&n(v.scale,.01,10)&&Number.isInteger(v.division)&&n(v.division,0,16)&&Number.isInteger(v.shape)&&n(v.shape,0,4)&&Array.isArray(v.offset)&&v.offset.length===2&&v.offset.every(x=>n(x,-1e9,1e9))&&Array.isArray(v.border)&&v.border.length===2&&v.border.every(x=>n(x,0,1000))&&['pressureDivision','randomBorder','sampleInput','colorPerCell','randomOpacity'].every(k=>typeof v[k]==='boolean')
}

/** Keep family validation in an independent scope: the catalogue's many
 * optional families must not multiply TypeScript control-flow intersections. */
export function isGridDescriptor(d:Record<string,unknown>,policy?:BrushStructurePolicy):boolean{
 const stationary=isStationary195Structure(d,policy)
 if(d.grid===undefined)return true
 const g=d.grid,m=d.mixer,b=d.behavior,t=d.tip,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(record(g)&&(g.sourcePolicy!==undefined||Number(d.version)>=137&&record(b)&&record(b.rendering)&&b.rendering.accumulation==='alphaDarken'))return hasGridWash137Scope(d,policy)
 return isBrushGrid(g)&&d.model==='mixer'&&record(m)&&m.source===(g.sampleInput?'previousCanvas':undefined)&&m.algorithm===undefined&&m.sampling===undefined&&m.foreground===undefined&&m.paintThickness===undefined&&['spray','sketch','bristle','curveTrace','hatching','scatter','texture'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(b)&&b.version===2&&b.dual===undefined&&(stationary||b.timing===undefined)&&b.wetMix===undefined&&record(t)&&t.kind==='round'&&t.aspect===1
}

/** Staged descriptor capability only. Host canonical-prefix renderer must be ready before admission. */
export function hasGridWash137Scope(value:unknown,policy?:BrushStructurePolicy):boolean{
 const stationary=isStationary195Structure(value,policy)
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 const n=(v:unknown,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b
 const unit=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&n(p[0],0,1)&&p[1]===1)
 if(!obj(value)||!isBrushGrid(value.grid)||!obj(value.behavior)||!obj(value.tip)||!obj(value.mixer))return false
 const g=value.grid,b=value.behavior,t=value.tip,m=value.mixer,r=b.rendering,foreground=value.version===208
 return Number.isInteger(value.version)&&Number(value.version)>=137&&value.model==='mixer'&&value.paperInteraction===0&&g.sourcePolicy==='canonical-begin-v1'
 &&g.shape===(foreground?0:1)&&g.sampleInput===!foreground&&g.colorPerCell===false&&g.randomOpacity===false&&g.randomBorder===false&&g.pressureDivision===false&&g.hsv===undefined&&g.fillBackground===undefined&&g.mixBackground===undefined
 &&['spray','sketch','bristle','curveTrace','hatching','particle','deform','experiment','filter','clone','mypaint','tangentNormal','wet','texture','scatter'].every(k=>value[k]===undefined)
 &&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))&&t.kind==='round'&&t.hardness===1&&t.aspect===1&&t.rotation==='fixed'&&t.angle===0
 &&Object.keys(m).every(k=>['load','initialLoad','pickup','strength','source'].includes(k))&&m.load===(foreground?1:0)&&m.initialLoad===0&&m.pickup===(foreground?0:1)&&m.strength===1&&m.source===(foreground?undefined:'previousCanvas')
 &&value.flow===1&&value.opacity===1&&unit(value.sizeByPressure)&&unit(value.flowByPressure)&&unit(value.opacityByPressure)
 &&b.version===2&&Object.keys(b).every(k=>['version',...(stationary?['timing']:[]),'rendering'].includes(k))&&obj(r)&&Object.keys(r).every(k=>['mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'].includes(k))
 &&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges===undefined||r.wetEdges===0)&&(r.burntEdges===undefined||r.burntEdges===0)&&(r.burntEdgesMode===undefined||r.burntEdgesMode==='multiply')&&(r.opacityCeiling===undefined||r.opacityCeiling==='uniform')
}
/** Existing captured gesture identifier; deliberately no new wire/random/time field. */
export function hasGridBeginIdentity137(op:unknown):boolean{
 if(!op||typeof op!=='object'||Array.isArray(op))return false
 const v=op as Record<string,unknown>
 return v.type==='stroke'&&typeof v.strokeId==='string'&&v.strokeId.length>0&&v.strokeId.length<=200
}
