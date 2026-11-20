import {describe,it,expect} from 'vitest';
import {planGihFrameGeometry as plan,gihFrameMaskBounds as bounds,gihFrameSampleTransform,captureGihFrameMetadata as capture,type GihGeometryInput} from './gihFrameGeometry';
const input:GihGeometryInput={reference:{width:4,height:2},selected:{width:8,height:6},cursor:[10,20],scale:1,ratio:1,rotation:0,brushAngle:0,horizontalMirror:false,verticalMirror:false,coordinateSystemFlipped:false,subpixel:true};
describe('original unequal GIH geometry',()=>{
 it('keeps first-frame hotspot and spacing while selected artwork remains unscaled',()=>{expect(plan(input)).toMatchObject({x:8,y:19,width:8,height:6,hotspot:[2,1],spacing:[4,2]});expect(plan({...input,selected:{width:2,height:1}})).toMatchObject({x:8,y:19,width:2,height:1,spacing:[4,2]});});
 it.each([[true,false,4,19],[false,true,8,15],[true,true,4,15]] as const)('reanchors mirrored selected rectangles %s/%s',(horizontalMirror,verticalMirror,x,y)=>{expect(plan({...input,horizontalMirror,verticalMirror})).toMatchObject({x,y,width:8,height:6});});
 it('rotates reference and selected extents independently without changing spacing',()=>{const p=plan({...input,rotation:Math.PI/2});expect(p).toMatchObject({x:9,y:18,width:6,height:8,spacing:[4,2]});expect(p.hotspot[0]).toBeCloseTo(1);expect(p.hotspot[1]).toBeCloseTo(2);});
 // Native hotspot clamps each characteristic axis to >=1 before halving.
 it('scales source axes before explicit native transform multiplication by rotation',()=>{const p=plan({...input,ratio:.5,rotation:Math.PI/2});expect(p.referenceSpan[0]).toBeCloseTo(1);expect(p.referenceSpan[1]).toBeCloseTo(4);expect(p.selectedSpan[0]).toBeCloseTo(3);expect(p.selectedSpan[1]).toBeCloseTo(8);});
 it('retains fractional ratio, subpixel scale and negative-world fractions',()=>{expect(plan({...input,scale:.25,ratio:.5,cursor:[-2.25,-3.5]})).toMatchObject({x:-3,y:-4,width:3,height:1,subX:.25,subY:0,spacing:[1,.5]});});
 it('native mirror recomputes subpixel even when ordinary subpixel precision is disabled',()=>{expect(plan({...input,cursor:[-2.25,-3.5],horizontalMirror:true,subpixel:false})).toMatchObject({x:-9,width:9,subX:.25,subY:0});});
 it('preserves transparent original margins and per-frame texture sizes',()=>{expect(bounds({width:8,height:6},8)).toEqual({x:0,y:0,width:1,height:1});expect(bounds({width:4,height:2},8)).toEqual({x:.25,y:.25,width:.5,height:.5});expect(bounds({width:8,height:6},16)).toEqual({x:.25,y:.25,width:.5,height:.5});});
 it('rejects insufficient padding instead of clipping an odd source margin',()=>{expect(()=>bounds({width:8,height:5},8)).toThrow('additional padding');expect(bounds({width:8,height:5},16)).toEqual({x:.25,y:.21875,width:.5,height:.5});});
 it('rejects malformed dimensions and unsafe coordinates rather than rescaling',()=>{expect(()=>plan({...input,selected:{width:2049,height:1}})).toThrow();expect(()=>plan({...input,cursor:[Infinity,0]})).toThrow();expect(()=>plan({...input,ratio:0})).toThrow();});
});

it('captures exact frame metadata independently of resource identity and caller mutation',()=>{
 const a={sourceWidth:4,sourceHeight:2,maskBounds:{x:.25,y:.25,width:.5,height:.5}},b={sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}};
 const result=capture([a,b],[8,8]);a.sourceWidth=1;a.maskBounds.x=0;
 expect(result[0]).toEqual({sourceWidth:4,sourceHeight:2,maskBounds:{x:.25,y:.25,width:.5,height:.5}});
 expect(Object.isFrozen(result[0].maskBounds)).toBe(true);
 expect(()=>capture([result[0],b],[4,8])).toThrow('padding');
 expect(()=>capture([result[0],{...b,maskBounds:{...b.maskBounds,width:.5}}],[8,8])).toThrow('padding');
});

it('inverse sample uses selected source coordinates, raster mirrors and transparent margins',()=>{
 const sample=(i:GihGeometryInput,x:number,y:number)=>{const p=gihFrameSampleTransform(i);return[p.sampleX[0]*x+p.sampleX[1]*y+p.sampleX[2],p.sampleY[0]*x+p.sampleY[1]*y+p.sampleY[2]]};
 expect(sample(input,-1,-1)).toEqual([0,0]);expect(sample(input,1,1)).toEqual([8,6]);
 expect(sample({...input,horizontalMirror:true},-1,-1)).toEqual([8,0]);expect(sample({...input,verticalMirror:true},1,1)).toEqual([8,0]);
 const p=gihFrameSampleTransform({...input,ratio:.5,rotation:Math.PI/2});
 expect(sample({...input,ratio:.5,rotation:Math.PI/2},0,0)[0]).toBeCloseTo(4);
 expect(p.width).toBe(4); // Half-pixel first hotspot adds an output column; no source resizing.
 expect(p.height).toBe(8);
});

it('negative-angle native sampler inversely maps a known rotated source point without squaring ratio',()=>{
 const i={...input,ratio:.5,rotation:Math.PI/2},p=gihFrameSampleTransform(i)
 // source(2,4) -> scaled(2,2) -> rotate(-90)=(2,-2), normalized=(2,6), subpixel=(.5,0).
 const local=[.25,.5]
 expect(p.sampleX[0]*local[0]+p.sampleX[1]*local[1]+p.sampleX[2]).toBeCloseTo(2)
 expect(p.sampleY[0]*local[0]+p.sampleY[1]*local[1]+p.sampleY[2]).toBeCloseTo(4)
})
