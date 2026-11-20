import{it,expect}from'vitest'
import{type BrushDescriptor,type Dab,packDabs,unpackDabs}from'@grafetto/shared'
import{beginBrushBehavior,behaviorStampsForDab,brushAnimationIndex}from'./brushBehavior'
import{variableGihStamp}from'./gihFramePreparation'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
const ids=['a','b','c'].map(c=>`asset:${c.repeat(64)}`as const),rows=[{sourceWidth:4,sourceHeight:2,maskBounds:{x:.25,y:.25,width:.5,height:.5}},{sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:2,sourceHeight:4,maskBounds:{x:.25,y:.25,width:.5,height:.5}}]
function brush():BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),version:118,scatter:undefined,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],tip:{kind:'bitmap',mask:ids[0],maskBounds:rows[0].maskBounds,hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'dimensions',dimensions:[{mode:'pressure',rank:2},{mode:'xtilt',rank:3}],frames:ids,roundingPolicy:'qt5-half-up-v1',geometry:{version:1,frames:rows}}},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
const d:Dab={x:10,y:20,size:4,pressure:1,tiltX:-2,tiltY:0,sourceAngle:0,normalizedSpeed:.5,angle:0,aspectRatio:1,opacity:1,t:0}
it('feeds actual selected118 metadata to existing86 transform without resizing or double rotation',()=>{
 const b=brush(),s=behaviorStampsForDab(b,d,beginBrushBehavior(d),[0,0,0])[0];expect(s.frameIndex).toBe(1);expect(s.mask).toBe(ids[1]);const placed={...s,radius:s.size/2}
 expect(variableGihStamp(b,rows,placed)).toMatchObject({x:8,y:19,width:8,height:6,spacing:[4,2]})
 expect(variableGihStamp(b,rows,{...placed,angle:Math.PI/2})).toMatchObject({x:9,y:18,width:6,height:8})
 expect(variableGihStamp(b,rows,{...placed,flipX:-1})).toMatchObject({x:4,y:19,width:8,height:6})
 expect(variableGihStamp(b,rows,{...placed,x:-2.25,y:-3.5})).not.toEqual(variableGihStamp(b,rows,{...placed,frameIndex:0,x:-2.25,y:-3.5}))
 const flat=structuredClone(b);flat.tip.animation={mode:'xtilt',rank:5,frames:ids,roundingPolicy:'qt5-half-up-v1',geometry:{version:1,frames:rows}};expect(behaviorStampsForDab(flat,d,beginBrushBehavior(d),[0,0,0])[0].frameIndex).toBe(1)
 const alias=structuredClone(b);alias.tip.animation!.frames=[ids[0],ids[0],ids[0]];expect(brushAnimationIndex(alias.tip,1,0,0,1,.5,0,-2,0)).toBe(1);expect(variableGihStamp(alias,rows,placed).width).toBe(8)
})
it('preserves whole/split codec state and rejects forbidden new combinations before counters',()=>{
 const b=brush(),inputs=[d,{...d,x:11,tiltX:0,t:1},{...d,x:12,tiltX:1,t:2}],run=(count:number)=>{let state=beginBrushBehavior(d);const out=[];for(let i=0;i<inputs.length;i+=count){state=structuredClone(state);for(const input of unpackDabs(packDabs(inputs.slice(i,i+count))))out.push(...behaviorStampsForDab(b,input,state,[0,0,0]))}return{state,out}}
 expect(run(1)).toEqual(run(3))
 for(const edit of[(c:BrushDescriptor)=>{c.version=117},(c:BrushDescriptor)=>{c.scatter={count:1,radius:.1,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0}},(c:BrushDescriptor)=>{c.tip.color={planes:[ids[0],ids[0],ids[0]]}}]){const c=structuredClone(b);edit(c);const state=beginBrushBehavior(d),before=structuredClone(state);expect(()=>behaviorStampsForDab(c,d,state,[0,0,0])).toThrow();expect(state).toEqual(before)}
 const angular=brush();angular.tip.animation!.dimensions=[{mode:'angular',rank:2},{mode:'xtilt',rank:3}];angular.tip.animation!.cursorPolicy='first-request-v1';angular.behavior!.strokeInput={version:1,initialDirection:'cursorHistory'};const state=beginBrushBehavior(d);behaviorStampsForDab(angular,d,state,[0,0,0]);expect(behaviorStampsForDab(angular,{...d,x:10.25},state,[0,0,0])).toHaveLength(0);expect(state.dabOrdinal).toBe(2)
})
