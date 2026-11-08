import{it,expect}from'vitest'
import{isCloneDescriptor,hasCloneProjection149Scope}from'./brushClone'
const brush=()=>({version:149,model:'stamp',paperInteraction:0,tip:{kind:'round'},clone:{version:1,moveSourcePoint:true,source:'projectionCanvas',sourcePolicy:'canonical-begin-v1'},behavior:{version:2,rendering:{accumulation:'directOver',blendMode:'normal',wetEdges:0,burntEdges:0}}})
it('admits explicit merged149 while historical54 keeps its exact old shape',()=>{const b=brush();expect(hasCloneProjection149Scope(b)).toBe(true);expect(isCloneDescriptor({...b,version:54,clone:{version:1,moveSourcePoint:false}})).toBe(true);expect(hasCloneProjection149Scope({...b,version:54,clone:{version:1,moveSourcePoint:false}})).toBe(false)})
it('closes downgrade, partial policy, erase, image, dual and foreign projection mixes',()=>{for(const mutate of[(b:ReturnType<typeof brush>)=>b.version=148,b=>b.clone.source='previousCanvas',b=>b.clone.sourcePolicy='current',b=>Reflect.set(b.behavior,'erase',true),b=>Reflect.set(b.behavior,'dual',null),b=>Reflect.set(b,'mixer',null),b=>Reflect.set(b.tip,'color',{}),b=>Reflect.set(b,'filter',null)]){const b=brush();mutate(b);expect(hasCloneProjection149Scope(b)).toBe(false)}})
it('whole library preserves149root/54history but closes new projection as a child',async()=>{
 const{library133,spray133}=await import('./sprayWash133.testFixture');const{isBrushLibrary}=await import('./brushes')
 const b=spray133();delete b.spray;b.version=149;b.behavior!.rendering!.accumulation='directOver';b.clone={version:1,moveSourcePoint:true,source:'projectionCanvas',sourcePolicy:'canonical-begin-v1'}
 const lib=library133();lib.brushes[0].descriptor=b;expect(isBrushLibrary(lib)).toBe(true)
 const parent=spray133();delete parent.spray;parent.behavior!.rendering!.accumulation='directOver';parent.behavior!.dual={brush:b,sampling:'independent',blendMode:'normal'};lib.brushes[0].descriptor=parent;expect(isBrushLibrary(lib)).toBe(false)
 lib.brushes[0].descriptor=structuredClone(b);lib.brushes[0].descriptor.version=148;expect(isBrushLibrary(lib)).toBe(false)
 lib.brushes[0].descriptor.version=54;lib.brushes[0].descriptor.clone={version:1,moveSourcePoint:true};expect(isBrushLibrary(lib)).toBe(true)
})
