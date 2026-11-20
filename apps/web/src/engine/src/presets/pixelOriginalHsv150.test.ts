import{expect,it}from'vitest'
import{hasPixelOriginalHsv150Scope,type BrushDescriptor}from'@grafetto/shared'
import{brush119,dab119,rgb119}from'../../../../../../packages/shared/src/gihOriginalRgba119.testFixture'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
import{assertPixelOriginalRgba,pixelOriginalRgbaPigment}from'./pixelOriginalRgba'
function brush():BrushDescriptor{const b=brush119();b.version=150;delete b.tip.animation;b.tip.color={planes:[...rgb119[0]],adjustmentPolicy:'native-image-stamp-v1'};b.behavior!.colorAdjustment={hue:{control:'pressure',minimum:0,jitter:0},value:{control:'random',minimum:0,jitter:0}};return b}
it('retains evaluated HSV and actor/replay state while IMAGESTAMP pigment remains independent',()=>{
 const b=brush(),before=structuredClone(b.behavior!.colorAdjustment);expect(hasPixelOriginalHsv150Scope(b)).toBe(true);expect(()=>assertPixelOriginalRgba(b)).not.toThrow()
 const dabs=[.2,.6,1].map((pressure,i)=>({...dab119,pressure,x:i*20,t:i*10}));const run=(foreground:[number,number,number])=>{const s=beginBrushBehavior(dabs[0]);const rows=dabs.flatMap(d=>behaviorStampsForDab(b,d,s,foreground));return{rows,state:s}}
 const a=run([1,0,0]),replay=run([1,0,0]),hostile=run([0,1,0]);expect(a.rows.length).toBeGreaterThan(0);expect(replay).toEqual(a);expect(hostile.rows.map(r=>r.color)).not.toEqual(a.rows.map(r=>r.color));expect(b.behavior!.colorAdjustment).toEqual(before)
 // Literal premultiplied source, independent of all evaluated foregrounds.
 for(const _row of [...a.rows,...hostile.rows])expect(pixelOriginalRgbaPigment([.25,0,.125,.5])).toEqual([.5,0,.25])
})
it('requires explicit root/static policy and keeps prior84 rejection',()=>{for(const mutate of[(b:BrushDescriptor)=>{b.version=149},(b:BrushDescriptor)=>{b.tip.animation=brush119().tip.animation},(b:BrushDescriptor)=>{b.behavior!.erase=true},(b:BrushDescriptor)=>{b.behavior!.dynamics={hue:{control:'pressure',minimum:0,jitter:0}}},(b:BrushDescriptor)=>{if(b.tip.color&&'planes'in b.tip.color)delete b.tip.color.adjustmentPolicy}]){const b=brush();mutate(b);expect(hasPixelOriginalHsv150Scope(b)).toBe(false);expect(()=>assertPixelOriginalRgba(b)).toThrow()}})
