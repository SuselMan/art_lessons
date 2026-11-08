import{it,expect}from'vitest'
import{hasSpraySource146Scope,isBrushSpray}from'./brushSpray.js'
import{spray133}from'./sprayWash133.testFixture.js'
export function spray146(){const b=spray133();b.version=146;b.behavior!.rendering!.accumulation='directOver';b.spray!.color.sampleInput=true;b.spray!.color.sourcePolicy='canonical-begin-v1';return b}
it('requires explicit new BEGIN policy and preserves historical sampleInput metadata',()=>{const b=spray146();expect(hasSpraySource146Scope(b)).toBe(true);delete b.spray!.color.sourcePolicy;expect(isBrushSpray(b.spray)).toBe(true);expect(hasSpraySource146Scope(b)).toBe(false)})
it('closes downgraded, foreign, erase, child, image and malformed policy combinations',()=>{for(const mutate of[(b:ReturnType<typeof spray146>)=>b.version=145,b=>b.behavior!.erase=true,b=>Reflect.set(b.behavior!,'dual',null),b=>Reflect.set(b,'mixer',null),b=>b.spray!.particle.image=true,b=>delete b.spray!.color.sampleInput,b=>Reflect.set(b.spray!.color,'sourcePolicy','current')]){const b=spray146();mutate(b);expect(hasSpraySource146Scope(b)).toBe(false)}})

it('whole libraries accept closed source roots and reject their use as dual children',async()=>{
 const{isBrushLibrary}=await import('./brushes.js');const{library133}=await import('./sprayWash133.testFixture.js')
 const source=spray146(),deform=structuredClone(source),filter=structuredClone(source)
 for(const d of[deform,filter]){delete d.spray;d.model='mixer';d.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'};d.mixer={source:'previousCanvas',load:0,initialLoad:0,pickup:1,strength:1}}
 deform.version=145;deform.deform={version:1,sourcePolicy:'canonical-begin-v1',mode:1,amount:.05,counter:false,bilinear:false,density:1,jitter:0,baseScale:1}
 filter.version=147;filter.filter={version:2,kind:'invert',smudgeMode:true,sourcePolicy:'canonical-begin-v1'}
 for(const d of[source,deform,filter]){
  const lib=library133();lib.brushes[0].descriptor=d;expect(isBrushLibrary(lib),String(d.version)).toBe(true)
  const parent=spray133();delete parent.spray;parent.behavior!.rendering!.accumulation='directOver';parent.behavior!.dual={brush:d,sampling:'independent',blendMode:'normal'};lib.brushes[0].descriptor=parent;expect(isBrushLibrary(lib)).toBe(false)
 }
 const bad=library133();bad.brushes[0].descriptor=spray146();bad.brushes[0].descriptor.version=145;expect(isBrushLibrary(bad)).toBe(false)
})
