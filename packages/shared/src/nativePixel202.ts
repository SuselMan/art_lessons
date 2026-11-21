import {nativeMaskComponentStructure} from './independentMask190.js'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
/** Root Pixel lightness pipe with native angular fan, Wash and bounded HSV.
 * Whole-role validation prevents orphan or unrelated version202 descriptors. */
export function hasNativePixel202Scope(value:unknown):boolean {
 if(!nativeMaskComponentStructure(value,true,202)||!record(value.tip)||!record(value.behavior))return false
 const tip=value.tip,b=value.behavior,a=tip.animation,r=b.rendering,input=b.strokeInput
 if(value.paperInteraction!==0||value.texture!==undefined||value.wet!==undefined||b.dual!==undefined||b.timing!==undefined||b.erase===true||b.sequentialRandom!==undefined||b.wetMix!==undefined||b.taper!==undefined)return false
 if(tip.kind!=='bitmap'||!record(tip.material)||tip.material.kind!=='lightness'||tip.color!==undefined||tip.imageSampling!==undefined||tip.profile!==undefined||tip.autoNoise!==undefined||tip.autoShape!==undefined||!record(a)||a.mode!=='dimensions'||a.geometry!==undefined||!Array.isArray(a.dimensions)||!a.dimensions.some(v=>record(v)&&v.mode==='angular'))return false
 return record(r)&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&record(input)&&input.version===1&&input.initialDirection==='cursorHistory'&&record(input.fanCorners)
}
