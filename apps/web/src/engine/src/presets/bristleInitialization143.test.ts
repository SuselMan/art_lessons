import{expect,it}from'vitest'
import{bristle141,dab141}from'../../../../../../packages/shared/src/bristleInitialization141.testFixture'
import{buildBristleInitialization140,assertBristleSource143Ready}from'./bristleInitialization140'
import{bristleGeometryStamps,type BristleState}from'./brushBristle'
import{installBrushPixels,importedAssetPixels}from'./importedBrushes'
const asset=(n:number)=>`asset:${n.toString(16).padStart(64,'0')}`as const
function fixture(n:number,side:number,width=side,height=side,rotation:[number,number]=[65536,0]){
 const b=bristle141();b.version=143;if(b.bristle?.version!==1)throw Error('fixture')
 b.bristle.initialization={resizePolicy:'source-area143-v1',sourceSide:side,sourceMask:asset(n),sourceBounds:{x:0,y:0,width,height},rotation};return b
}
it('area-reduces original alpha with half-up arithmetic and exact aspect/quarter-turn permutations',()=>{
 const b=fixture(14301,4,4,1,[0,65536]),raw=Uint8Array.from([0,255,0,255,...Array(12).fill(0)]);installBrushPixels(asset(14301),raw)
 expect(buildBristleInitialization140(b,2)).toEqual({side:2,hairs:[[0,-.5,128/255],[0,0,128/255]]})
 expect(importedAssetPixels(asset(14301))).toEqual(raw)
 const c=fixture(14302,2,2,1,[0,-65536]);installBrushPixels(asset(14302),Uint8Array.from([255,64,0,0]));expect(buildBristleInitialization140(c,2).hairs).toEqual([[0,-.5,64/255],[0,0,1]])
})
it('target64 reads the source directly and is independent of the saved-default hair population without alpha boost',()=>{
 const a=fixture(14303,64),b=structuredClone(a),raw=Uint8Array.from({length:4096},(_,i)=>i%2?255:0);installBrushPixels(asset(14303),raw)
 if(b.bristle?.version!==1)throw Error('fixture');b.bristle.hairs=[[0,0,128/255]]
 const before=raw.slice(),first=buildBristleInitialization140(a,64),second=buildBristleInitialization140(b,64)
 expect(first).toEqual(second);expect(first.hairs).toHaveLength(2048);expect(first.hairs.every(h=>h[2]===1)).toBe(true);expect(importedAssetPixels(asset(14303))).toEqual(before)
})
it('arbitrary Q16 rotation is deterministic, transparent outside and bounded before publishing',()=>{
 const b=fixture(14304,4,4,4,[46341,46341]);installBrushPixels(asset(14304),new Uint8Array(16).fill(255));const a=buildBristleInitialization140(b,4)
 expect(a).toEqual(buildBristleInitialization140(structuredClone(b),4));expect(a.hairs.length).toBeGreaterThan(0);expect(a.hairs.length).toBeLessThan(36);expect(a.hairs.some(h=>h[2]===1)).toBe(true);expect(a.hairs.every(h=>h[2]>0&&h[2]<=1&&Number.isInteger(h[2]*255))).toBe(true)
})
it('missing CAS and malformed dimensions are atomic; zero-pressure anchor owns a detached initialization across chunks/clone',()=>{
 const b=fixture(14305,4),state:BristleState={ordinal:0,oldPressure:1,ends:[]},dab={...dab141(),size:0,pressure:0,sourceSize:4,sourceScale:0},before=structuredClone(state)
 expect(()=>bristleGeometryStamps(b,dab,state,[1,0,0],1)).toThrow('Brush asset unavailable');expect(state).toEqual(before)
 const bad=fixture(14306,8);installBrushPixels(asset(14306),new Uint8Array(16));expect(()=>assertBristleSource143Ready(bad)).toThrow('CAS dimensions');expect(state).toEqual(before)
 installBrushPixels(asset(14305),new Uint8Array(16).fill(255));expect(bristleGeometryStamps(b,dab,state,[1,0,0],1)).toEqual([]);expect(state.initialization!.hairs).toHaveLength(16)
 const init=state.initialization!,clone=structuredClone(state),line={...dab,x:3,size:4,pressure:.8,sourceScale:1}
 const stamps=bristleGeometryStamps(b,line,state,[1,0,0],1);expect(stamps).toEqual(bristleGeometryStamps(b,line,clone,[1,0,0],1));expect(stamps.every(s=>s.bristleTrajectory142===undefined)).toBe(true);expect(state.initialization).toBe(init)
 const prior=structuredClone(state);expect(()=>bristleGeometryStamps(b,{...line,sourceSize:8},state,[1,0,0],1)).toThrow('size changed');expect(state).toEqual(prior)
 expect(()=>assertBristleSource143Ready(bristle141())).not.toThrow()
})
