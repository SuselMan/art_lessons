import{it,expect}from'vitest'
import{brushRequiresRandomContext,brushRequiresSourceTime,type BrushDescriptor}from'./brushes'
import{isMyPaintDescriptor}from'./brushMyPaint'
const descriptor=()=>({model:'stamp',paperInteraction:0,mypaint:{version:1,kernel:'libmypaint-1.6.1',baseRadius:4,erase:false,settings:[{id:1,base:1,inputs:[{id:0,points:[[0,0],[.015,0],[.015,1],[1,1]]}]}]},behavior:{version:2}})
it('admits the native pressure step and requires captured time/randomness',()=>{const d=descriptor();expect(isMyPaintDescriptor(d)).toBe(true);expect(brushRequiresRandomContext(d as unknown as BrushDescriptor)).toBe(true);expect(brushRequiresSourceTime(d as unknown as BrushDescriptor)).toBe(true)})
it('rejects malformed native settings and accepts only the bounded dwell clock',()=>{const d=descriptor();d.mypaint.settings[0].base=Infinity;expect(isMyPaintDescriptor(d)).toBe(false);const valid=descriptor();expect(isMyPaintDescriptor({...valid,behavior:{version:2,timing:{version:1,rate:60,ignoreDistanceSpacing:false}}})).toBe(true);expect(isMyPaintDescriptor({...valid,behavior:{version:2,timing:{version:1,rate:1000,ignoreDistanceSpacing:false}}})).toBe(false)})
