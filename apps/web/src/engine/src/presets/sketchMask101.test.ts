import{it,expect,vi}from'vitest'
import{isBrushLibrary,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
import{installBrushPixels}from'./importedBrushes'
import{prepareSketchMask}from'./sketchMask'
import{sketchStamps,type SketchState}from'./brushSketch'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
const id=`asset:${'e101'.padEnd(64,'0')}`as const
const dab:Dab={x:10,y:10,size:4,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0}
function brush(w=4,h=4):BrushDescriptor{const b=structuredClone(digitalBrushFromPreset('hard-round'));b.version=101;b.id='imported-'+('1'.repeat(24));b.model='stamp';b.paperInteraction=0;b.tip={kind:'bitmap',mask:id,maskBounds:{x:0,y:0,width:1,height:1},hardness:1,aspect:1,angle:0,rotation:'fixed'};b.behavior={version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'normal'}};b.sketch={version:1,mode:'mask',maskSize:[w,h],width:1,offset:.3,probability:1,connect:false,magnetify:true,randomRGB:false,randomOpacity:false,distanceDensity:false,distanceOpacity:false,antialias:false};return b}
function state():SketchState{return{points:[{x:8.5,y:8.5,ordinal:0},{x:10,y:10,ordinal:1}],cells:new Map([['0,0',new Set([0,1])]]),ordinal:2,color:[1,0,0],alpha:1}}
it('selects nonzero alpha as a gate including mask corners outside the old circle and excludes its central hole',()=>{
 installBrushPixels(id,new Uint8Array([255,255,255,255,255,0,0,255,255,0,0,255,255,255,255,255]));const b=brush(),view=prepareSketchMask(b)!
 expect(view.forDab(dab).contains(10,10)).toBe(false);expect(view.forDab(dab).contains(8.5,8.5)).toBe(true);expect(view.forDab(dab).contains(7,10)).toBe(false)
 const out=sketchStamps(b,dab,state(),[1,0,0],42,{width:1,offset:1,probability:1},1,view)
 expect(out).toHaveLength(1);expect(out[0].segmentLength).toBeGreaterThan(0)
 const old=structuredClone(b);old.version=44;old.sketch!.mode='simple';delete old.sketch!.maskSize;old.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'}
 expect(sketchStamps(old,dab,state(),[1,0,0],42,{width:1,offset:1,probability:1},1).every(s=>s.segmentLength===0)).toBe(true)
})
it('validates nonsquare extents padding rotation and missing resources before state changes',()=>{
 const b=brush(4,2),nonSquareId=`asset:${'e102'.padEnd(64,'0')}`as const;b.tip.mask=nonSquareId;installBrushPixels(nonSquareId,new Uint8Array([0,0,0,0,255,255,255,255,255,255,255,255,0,0,0,0]));const v=prepareSketchMask(b)!
 expect(v.forDab(dab)).toMatchObject({width:4,height:2,radius:2});expect(v.forDab(dab).contains(10,7)).toBe(false)
 const rotated={...dab,angle:Math.PI/2};expect(v.forDab(rotated).height).toBe(4);expect(v.forDab(rotated).contains(10,8.5)).toBe(true);expect(v.forDab(rotated).contains(8,10)).toBe(false)
 const badId=`asset:${'e103'.padEnd(64,'0')}`as const;installBrushPixels(badId,new Uint8Array(16).fill(255));b.tip.mask=badId;const s=state(),before=structuredClone(s);expect(()=>sketchStamps(b,dab,s,[1,0,0],42,{width:1,offset:1,probability:1},1)).toThrow('padding');expect(s).toEqual(before)
 const whole=beginBrushBehavior(dab),saved=structuredClone(whole);expect(()=>behaviorStampsForDab(b,dab,whole,[1,0,0])).toThrow('padding');expect(whole).toEqual(saved)
 b.tip.mask=`asset:${'e104'.padEnd(64,'0')}`;expect(()=>behaviorStampsForDab(b,dab,whole,[1,0,0])).toThrow();expect(whole).toEqual(saved)
})
it('admits only root101 static captured alpha geometry and keeps old44 simple control',()=>{
 const b=brush(),lib=()=>({schemaVersion:1,assets:[{id,size:4,file:id.slice(6)+'.bin'}],brushes:[{name:'Captured bitmap Sketch',source:'qa.kpp',warnings:[],descriptor:b}],skipped:[]})
 expect(isBrushLibrary(lib())).toBe(true);b.version=100;expect(isBrushLibrary(lib())).toBe(false);b.version=101
 b.sketch!.distanceOpacity=true;expect(isBrushLibrary(lib())).toBe(false);b.sketch!.distanceOpacity=false
 b.sketch!.maskSize=[3,4];expect(isBrushLibrary(lib())).toBe(false);b.sketch!.maskSize=[4,4]
 const parent=structuredClone(digitalBrushFromPreset('hard-round'));parent.id='imported-'+('2'.repeat(24));parent.version=101;parent.behavior={version:2,dual:{brush:b,blendMode:'multiply'}};expect(isBrushLibrary({...lib(),brushes:[{name:'parent',source:'qa',warnings:[],descriptor:parent}]})).toBe(false)
 b.version=44;b.sketch!.mode='simple';delete b.sketch!.maskSize;b.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'};expect(isBrushLibrary(lib())).toBe(true)
})

it('evaluates one bounded sampler per logical dab and never calls trig inside candidate selection',()=>{
 const b=brush(),sid=`asset:${'e105'.padEnd(64,'0')}`as const;b.tip.mask=sid;installBrushPixels(sid,new Uint8Array(16).fill(255));const view=prepareSketchMask(b)!,forDab=vi.spyOn(view,'forDab');
 sketchStamps(b,dab,state(),[1,0,0],42,{width:1,offset:1,probability:1},1,view);expect(forDab).toHaveBeenCalledTimes(1)
 const request=view.forDab(dab),sin=vi.spyOn(Math,'sin'),cos=vi.spyOn(Math,'cos');try{for(let i=0;i<4096;i++)request.contains(8+(i%8)/2,8+(Math.floor(i/8)%8)/2);expect(sin).not.toHaveBeenCalled();expect(cos).not.toHaveBeenCalled()}finally{sin.mockRestore();cos.mockRestore();forDab.mockRestore()}
})
