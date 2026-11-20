import {expect,it}from'vitest'
import {buildBristleInitialization140}from'./bristleInitialization140'
import {bristleGeometryStamps,type BristleState}from'./brushBristle'
import {bristleSoakPoints139}from'./bristleSoak139'
import {brush,dab,soak}from'./bristleSoak139TestFixture'
const mask=(side:number,hairs:[number,number,number][])=>{const d=structuredClone(brush);d.version=140;if(d.bristle?.version!==2)throw Error('fixture');d.bristle.hairs=hairs;d.bristle.soak={sourcePolicy:'canonical-begin-v1',initialSide:side,resizePolicy:'mask-population-v1'};return d}
it('resizes full alpha at pixel centres with literal U8 bilinear values and bounded dense population',()=>{
 const b=mask(2,[[-.5,-.5,1]]),init=buildBristleInitialization140(b,4)
 expect(init.hairs).toEqual([[-.5,-.5,1],[-.25,-.5,191/255],[0,-.5,64/255],[-.5,-.25,191/255],[-.25,-.25,143/255],[0,-.25,48/255],[-.5,0,64/255],[-.25,0,48/255],[0,0,16/255]])
 expect(buildBristleInitialization140(b,1).hairs).toEqual([[0,0,64/255]])
 const full=mask(1,[[0,0,1]])
 for(const size of[4,16,48,64]){const resized=buildBristleInitialization140(full,size);expect(resized.hairs).toHaveLength(size*size);expect(resized.hairs.every(h=>h[2]===1)).toBe(true)}
})
it('preserves source-side hair order/alpha and permits genuinely empty downsample without inventing hairs',()=>{
 const hairs:[number,number,number][]=[[.25,.25,128/255],[-.5,-.5,1]],b=mask(4,hairs),init=buildBristleInitialization140(b,4)
 expect(init.hairs).toEqual(hairs);expect(init.hairs).not.toBe(hairs);init.hairs[0][2]=0;expect(b.bristle!.hairs).toEqual(hairs)
 expect(buildBristleInitialization140(mask(4,[[-.5,-.5,1]]),1).hairs).toEqual([])
 for(const size of[0,1.5,65,NaN,Infinity])expect(()=>buildBristleInitialization140(b,size)).toThrow()
 expect(()=>buildBristleInitialization140(brush,4)).toThrow()
})
it('uses resized raw offsets for source lookup before pressure/rotation/scale and keeps captured population across clone',()=>{
 const b=mask(1,[[0,0,1]]),initialization=buildBristleInitialization140(b,4),first={...dab,sourceSize:4,sourceScale:1,size:4},state:BristleState={ordinal:0,oldPressure:1,ends:[],initialization,soak:{...soak(),rgba:new Uint8Array(16*4).fill(255)}}
 const points=bristleSoakPoints139(b,first,initialization);expect(points).toHaveLength(16);expect(points[0]).toEqual({x:-2,y:-3});expect(points[15]).toEqual({x:1,y:0})
 expect(bristleSoakPoints139(b,{...first,size:1,sourceScale:.25,angle:1,pressure:.2},initialization)).toEqual(points)
 expect(bristleGeometryStamps(b,first,state,[0,1,0],1)).toEqual([])
 const second=bristleGeometryStamps(b,{...first,x:4},state,[0,1,0],1);expect(second).toHaveLength(16);expect(state.ends).toHaveLength(16)
 const clone=structuredClone(state),next={...first,x:8,size:2,sourceScale:.5,pressure:.25};expect(bristleGeometryStamps(b,next,state,[1,0,0],1)).toEqual(bristleGeometryStamps(b,next,clone,[0,0,1],1));expect(state.initialization).toEqual(initialization);expect(clone.initialization!.hairs).not.toBe(initialization.hairs)
 const before=structuredClone(state);expect(()=>bristleGeometryStamps(b,{...next,sourceSize:8},state,[1,1,1],1)).toThrow('size changed');expect(state).toEqual(before)
})

const ordinary=(side:number,hairs:[number,number,number][])=>{
 const d=structuredClone(brush);d.version=141;if(d.bristle?.version!==2)throw Error('fixture')
 const{ink:_ink,soak:_soak,saturationLookup:_lookup,...geometry}=d.bristle
 d.bristle={...geometry,version:1,hairs,initialization:{sourceSide:side,resizePolicy:'mask-population-v1'}};return d
}
it('ordinary141 reconstructs a complete 6686-hair mask once at captured GUI size before a zero-pressure anchor',()=>{
 const source:[number,number,number][]=Array.from({length:6686},(_,i)=>[(i%82-41)/82,(Math.floor(i/82)-41)/82,1]),b=ordinary(82,source),state:BristleState={ordinal:0,oldPressure:1,ends:[]},anchor={...dab,size:0,pressure:0,sourceSize:26,sourceScale:0}
 expect(bristleGeometryStamps(b,anchor,state,[1,0,0],1)).toEqual([])
 const init=state.initialization!;expect(init.side).toBe(26);expect(init.hairs).toHaveLength(676);expect(b.bristle!.hairs).toHaveLength(6686);expect(state.ordinal).toBe(0)
 const line={...anchor,x:8,size:26,pressure:.65,sourceScale:1},stamps=bristleGeometryStamps(b,line,state,[1,0,0],1);expect(stamps).toHaveLength(676);expect(state.initialization).toBe(init)
 const clone=structuredClone(state),next={...line,x:12,y:-4,size:13,angle:-.7,pressure:.3,sourceScale:.5}
 expect(bristleGeometryStamps(b,next,state,[0,0,1],1)).toEqual(bristleGeometryStamps(b,next,clone,[0,0,1],1));expect(state.initialization).toBe(init);expect(clone.initialization!.hairs).not.toBe(init.hairs)
 const before=structuredClone(state);expect(()=>bristleGeometryStamps(b,{...next,sourceSize:27},state,[1,1,1],1)).toThrow('size changed');expect(state).toEqual(before)
})
it('ordinary141 invalid capture is rejected before anchor state; legacy45 ignores a stale initializer',()=>{
 const b=ordinary(1,[[0,0,1]])
 for(const sourceSize of[undefined,0,1.5,65,NaN]){const state:BristleState={ordinal:0,oldPressure:1,ends:[]},before=structuredClone(state);expect(()=>bristleGeometryStamps(b,{...dab,sourceSize,sourceScale:1},state,[1,0,0],1)).toThrow();expect(state).toEqual(before)}
 const old=structuredClone(b);old.version=45;if(old.bristle?.version!==1)throw Error('fixture');delete old.bristle.initialization
 const plain:BristleState={ordinal:0,oldPressure:1,ends:[]},stale:BristleState={...structuredClone(plain),initialization:{side:64,hairs:[]}}
 expect(bristleGeometryStamps(old,dab,plain,[1,0,0],1)).toEqual(bristleGeometryStamps(old,dab,stale,[1,0,0],1))
 const a=bristleGeometryStamps(old,{...dab,x:4},plain,[1,0,0],1),c=bristleGeometryStamps(old,{...dab,x:4},stale,[1,0,0],1);expect(a).toHaveLength(1);expect(c).toEqual(a)
})
it('142 preserves initialized geometry and adds exact original endpoints only to its opt-in AA trajectory',()=>{
 const old=ordinary(1,[[0,0,1]]);old.bristle!.antialias=true;old.bristle!.compositing=true;const next=structuredClone(old);next.version=142
 const a:BristleState={ordinal:0,oldPressure:1,ends:[]},b=structuredClone(a),first={...dab,x:-.2,y:.25,sourceSize:1,sourceScale:1},last={...first,x:2.8}
 bristleGeometryStamps(old,first,a,[1,0,0],1);bristleGeometryStamps(next,first,b,[1,0,0],1)
 const legacy=bristleGeometryStamps(old,last,a,[1,0,0],1),native=bristleGeometryStamps(next,last,b,[1,0,0],1)
 expect(legacy[0].bristleTrajectory142).toBeUndefined();expect(native[0].bristleTrajectory142).toEqual({start:[-.2,.25],end:[2.8,.25]})
 expect(native.map(({bristleTrajectory142:_line,...geometry})=>geometry)).toEqual(legacy)
})
