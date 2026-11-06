export interface BrushGrid{
 version:1
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
 return Object.keys(v).every(k=>['version','width','height','scale','offset','division','pressureDivision','border','randomBorder','shape','sampleInput','colorPerCell','randomOpacity'].includes(k))&&v.version===1&&n(v.width,1,1024)&&n(v.height,1,1024)&&n(v.scale,.01,10)&&Number.isInteger(v.division)&&n(v.division,0,16)&&Number.isInteger(v.shape)&&n(v.shape,0,4)&&Array.isArray(v.offset)&&v.offset.length===2&&v.offset.every(x=>n(x,-1e9,1e9))&&Array.isArray(v.border)&&v.border.length===2&&v.border.every(x=>n(x,0,1000))&&['pressureDivision','randomBorder','sampleInput','colorPerCell','randomOpacity'].every(k=>typeof v[k]==='boolean')
}

/** Keep family validation in an independent scope: the catalogue's many
 * optional families must not multiply TypeScript control-flow intersections. */
export function isGridDescriptor(d:Record<string,unknown>):boolean{
 if(d.grid===undefined)return true
 const g=d.grid,m=d.mixer,b=d.behavior,t=d.tip,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return isBrushGrid(g)&&d.model==='mixer'&&record(m)&&m.source===(g.sampleInput?'previousCanvas':undefined)&&m.algorithm===undefined&&m.sampling===undefined&&m.foreground===undefined&&m.paintThickness===undefined&&['spray','sketch','bristle','curveTrace','hatching','scatter','texture'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&record(t)&&t.kind==='round'&&t.aspect===1
}
