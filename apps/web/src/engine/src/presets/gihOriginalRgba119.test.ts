import{it,expect}from'vitest'
import{isOriginalRgbaGih119,packDabs,unpackDabs,type BrushDescriptor}from'@grafetto/shared'
import{brush119,dab119,ids119,rgb119,rows119,assets119}from'../../../../../../packages/shared/src/gihOriginalRgba119.testFixture'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
import{prepareVariableGih,variableGihStamp}from'./gihFramePreparation'
import{installBrushPixels}from'./importedBrushes'
import{pixelOriginalRgbaFrames,capturePixelOriginalRgbaView}from'./pixelOriginalRgba'
import{brushPreparationResources,brushPreparationBytes,brushTextureResourceKey,BRUSH_PREPARATION_BYTES}from'../dabs/BrushPreparation'
function install(){for(const a of assets119)installBrushPixels(a.id,new Uint8Array(a.size*a.size))}
it('selects paired RGB/alpha and original geometry once, including SAMEalpha differentRGB and negative-world/rotation',()=>{
 install();const b=brush119(),frames=prepareVariableGih(b)
 const select=(tiltX:number)=>behaviorStampsForDab(b,{...dab119,tiltX},beginBrushBehavior(dab119),[.2,.4,.6])[0]
 const a=select(-1.25),c=select(1),other=select(-2);expect(a.frameIndex).toBe(0);expect(c.frameIndex).toBe(2);expect(a.mask).toBe(c.mask);expect(a.colorPlanes).toEqual(rgb119[0]);expect(c.colorPlanes).toEqual(rgb119[2]);expect(other.frameIndex).toBe(1)
 expect(variableGihStamp(b,frames,{...other,radius:other.size/2})).toMatchObject({x:8,y:19,width:8,height:6})
 expect(variableGihStamp(b,frames,{...other,radius:other.size/2,angle:Math.PI/2})).toMatchObject({x:9,y:18,width:6,height:8})
 expect(variableGihStamp(b,frames,{...other,radius:other.size/2,x:-2.25,y:-3.5})).toMatchObject({x:-5,y:-5,width:9,height:7})
 const resources=brushPreparationResources(b).filter(r=>r.colorPlanes);expect(resources).toHaveLength(3);expect(new Set(resources.map(brushTextureResourceKey)).size).toBe(3);expect(brushPreparationBytes(resources,id=>Math.sqrt(new Uint8Array(assets119.find(a=>a.id===id)!.size**2).length))).toBe((16+64+16)*4);expect(brushPreparationBytes(resources,id=>assets119.find(a=>a.id===id)!.size)).toBeLessThan(BRUSH_PREPARATION_BYTES)
 expect(pixelOriginalRgbaFrames(b).map(v=>v.planes)).toEqual(rgb119)
})
it('whole/split and stationary tilt retain source fields/RGB/frame footprints without selecting perphysicaltile',()=>{
 const b=brush119('dimensions'),inputs=[dab119,{...dab119,tiltX:0,t:1},{...dab119,x:-2.25,y:-3.5,tiltX:1,t:2}],run=(chunk:number)=>{const state=beginBrushBehavior(dab119),out=[];for(let i=0;i<inputs.length;i+=chunk)for(const d of unpackDabs(packDabs(inputs.slice(i,i+chunk))))out.push(...behaviorStampsForDab(b,d,state,[1,0,0]));return{state,out}}
 expect(run(1)).toEqual(run(3));expect(run(1).out).toHaveLength(3)
})
it('scope-only logical-dab policy rejects downgrade/gradient/child/effects before source counters, old118alpha preserved',()=>{
 for(const edit of[(b:BrushDescriptor)=>{b.version=118},(b:BrushDescriptor)=>{b.tip.color={gradient:{gray:ids119[0]}}},(b:BrushDescriptor)=>{b.behavior!.dual={brush:brush119(),blendMode:'normal'}},(b:BrushDescriptor)=>{Reflect.set(b,'texture',{})}]){const b=brush119();edit(b);expect(isOriginalRgbaGih119(b)).toBe(false);const state=beginBrushBehavior(dab119),before=structuredClone(state);expect(()=>behaviorStampsForDab(b,dab119,state,[1,0,0])).toThrow();expect(state).toEqual(before)}
 const old=brush119();old.version=118;delete old.tip.color;expect(behaviorStampsForDab(old,dab119,beginBrushBehavior(dab119),[1,0,0])[0].frameIndex).toBe(1)
})
it('actual prepared metadata views delegate ownership and preserve independent perframecrop/retirement',()=>{
 const texture={}as WebGLTexture;let alive=true,checks=0;const owner={texture,width:8,height:8,crop:{x:2,y:2,width:4,height:4},assertCurrent(){checks++;if(!alive)throw Error('Retired119')}};const view=capturePixelOriginalRgbaView(owner);expect(view.bounds).toEqual([.25,.25,.5,.5]);owner.crop.x=0;expect(view.bounds[0]).toBe(.25);view.assertCurrent();alive=false;expect(()=>view.assertCurrent()).toThrow('Retired119');expect(checks).toBe(4)
})

it('full preparation rejects equal geometry and malformed RGB inventory before logical-dab state exists',()=>{
 install();for(const edit of[(b:BrushDescriptor)=>{b.tip.animation!.geometry!.frames[1]=structuredClone(rows119[0])},(b:BrushDescriptor)=>{if(b.tip.color&&'planes'in b.tip.color)b.tip.color.frames!.pop()}]){const b=brush119();edit(b);expect(isOriginalRgbaGih119(b)).toBe(false);expect(()=>prepareVariableGih(b)).toThrow('Original RGBA sensor geometry requires unequal119 scope')}
})
