import{it,expect}from'vitest'
import{packDabs,unpackDabs,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{secondaryBrushDabs,behaviorStampsForDab,beginBrushBehavior,type SecondarySamplingState}from'./brushBehavior'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
function pair():BrushDescriptor{const component=():BrushDescriptor=>({...digitalBrushFromPreset('hard-round'),version:122,scatter:undefined,spacing:.5,tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:1,angle:0,rotation:'path'},sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rotation:{follow:1,random:'none'},spacing:{mode:'diameter',coefficient:.5,isotropic:true},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}});const root=component();root.tip.imageSampling={kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:0,width:4,height:4}};root.behavior!.dual={brush:component(),sampling:'independent',blendMode:'multiply'};return root}
const first:Dab={x:0,y:0,size:4,pressure:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,sourceAngle:Math.PI/2,opacity:1,t:0}
it('derives each child angle from last EMITTED unscattered child point, not root segment/angle',()=>{
 const root=pair(),child=root.behavior!.dual!.brush,sampling:SecondarySamplingState={remaining:0},raw=[first,{...first,x:3,sourceAngle:Math.PI,t:1},{...first,x:3,y:3,sourceAngle:0,t:2}],out=secondaryBrushDabs(root,child,raw,sampling)
 expect(out.map(d=>[d.x,d.y])).toEqual([[0,0],[2,0],[3,1],[3,3]])
 expect(out[0].sourceAngle).toBe(Math.PI/2);expect(out[1].sourceAngle).toBe(0);expect(out[2].sourceAngle).toBeCloseTo(Math.PI/4,6);expect(out[3].sourceAngle).toBeCloseTo(Math.PI/2,6)
 const state=beginBrushBehavior(out[0]);const angles=out.map(d=>behaviorStampsForDab(child,d,state,[1,1,1])[0].angle);expect(angles[0]).toBe(Math.PI/2);expect(angles[2]).toBeCloseTo(Math.PI/4,6)
 expect(sampling.sourceCursor).toMatchObject({x:3,y:3});expect(sampling.geometry?.previous?.sourceAngle).toBe(out.at(-1)!.sourceAngle)
})
it('preserves split/codec/fork continuation and does not advance cursor on suppressed root segments',()=>{
 const root=pair(),child=root.behavior!.dual!.brush,inputs=[first,{...first,x:3,t:1},{...first,x:3,y:3,t:2}]
 const run=(n:number)=>{let state:SecondarySamplingState={remaining:0};const out:Dab[]=[];for(let i=0;i<inputs.length;i+=n){state=structuredClone(state);out.push(...secondaryBrushDabs(root,child,unpackDabs(packDabs(inputs.slice(i,i+n))),state))}return{state,out}}
 expect(run(1)).toEqual(run(3));const endpointState:SecondarySamplingState={remaining:0};const endpointOut=secondaryBrushDabs(root,child,inputs.slice(0,2),endpointState);endpointOut.push(...secondaryBrushDabs(root,child,[],endpointState,true,{...inputs[2],baseSize:4}));expect(endpointOut).toEqual(run(3).out);const s:SecondarySamplingState={remaining:0};secondaryBrushDabs(root,child,[first],s);const cursor=structuredClone(s.sourceCursor);expect(secondaryBrushDabs(root,child,[{...first,x:1,sourceAngle:Math.PI}],s)).toEqual([]);expect(s.sourceCursor).toEqual(cursor)
 const last=secondaryBrushDabs(root,child,[{...first,x:1,y:1,sourceAngle:Math.PI}],s);expect(last[0].sourceAngle).toBeCloseTo(Math.PI/4,6)
 // Root angles across a wrap are never interpolated into the child direction.
 const wrap=secondaryBrushDabs(root,child,[{...first,sourceAngle:350*Math.PI/180},{...first,x:4,sourceAngle:10*Math.PI/180}],{remaining:0});expect(wrap.slice(1).every(d=>d.sourceAngle===0)).toBe(true)
})
it('rejects parent proof and missing captured channel before any sampler/geometry mutation',()=>{
 for(const edit of[(b:BrushDescriptor)=>{b.version=119},(b:BrushDescriptor)=>{delete b.behavior!.strokeInput},(b:BrushDescriptor)=>{Reflect.set(b.behavior!.dual!,'sampling','inline')}]){const root=pair();edit(root);const s:SecondarySamplingState={remaining:0},before=structuredClone(s);expect(()=>secondaryBrushDabs(root,root.behavior!.dual!.brush,[first],s)).toThrow('matching120');expect(s).toEqual(before)}
 const root=pair(),s:SecondarySamplingState={remaining:0};expect(()=>secondaryBrushDabs(root,root.behavior!.dual!.brush,[{...first,sourceAngle:undefined}],s)).toThrow();expect(s).toEqual({remaining:0})
 const legacy=pair();delete legacy.behavior!.strokeInput;delete legacy.behavior!.dual!.brush.behavior!.strokeInput;legacy.version=34;const state:SecondarySamplingState={remaining:0};secondaryBrushDabs(legacy,legacy.behavior!.dual!.brush,[first,{...first,x:4}],state);expect(state.sourceCursor).toBeUndefined()
})
