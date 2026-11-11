import{isBrushBehavior}from'./brushBehavior.js'
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
/** Deterministic native Texture Strength only. Existing per-request evaluator;
 * no time/random/direction channels or recursive/absolute expressions. */
export function isTextureStrength183Control(v:unknown):boolean{
 const leaf=(c:unknown):boolean=>obj(c)&&typeof c.control==='string'&&['pressure','off','dabProgress','distance'].includes(c.control)&&c.jitter===0&&c.combine===undefined&&c.randomSource===undefined&&c.randomStream===undefined&&isBrushBehavior({version:2,dynamics:{grainDepth:c}})
 if(!obj(v))return false
 if(v.combine===undefined)return leaf(v)
 const c=v.combine
 return obj(c)&&typeof c.mode==='string'&&['product','sum','max','min','difference'].includes(c.mode)&&c.policy===undefined&&c.absolute===undefined&&Array.isArray(c.scaling)&&c.scaling.length>=1&&c.scaling.length<=16&&c.scaling.every(leaf)&&Array.isArray(c.additive)&&c.additive.length===0&&isBrushBehavior({version:2,dynamics:{grainDepth:v}})
}
export function usesTextureStrength183Control(v:unknown):boolean{return obj(v)&&(v.control==='dabProgress'||v.control==='distance'||v.combine!==undefined)}
