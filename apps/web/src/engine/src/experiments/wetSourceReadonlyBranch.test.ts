import{it,expect}from'vitest'
/** Diagnostic branch concept only: no production integration or new solver. */
const fit=(v:number[])=>{const peak=Math.max(255,...v);return v.map(x=>Math.round(255*x/peak))}
const land=(base:number[],film:number[])=>fit(base.map((x,i)=>x+film[i]))
const preview=(records:number[][])=>{const copy=records.map(v=>[...v]);for(let c=0;c<copy[0].length;c++){const moved=Math.min(Math.floor(copy[0][c]/4),255-copy[1][c]);copy[0][c]-=moved;copy[1][c]+=moved}return copy}
it('auxiliary preview transports recorded channels without mutating canonical source/base/film/settled roles',()=>{
 const state={P:[[100,50,60,100],[0,0,0,0]],C:[[40,80,20,100],[0,0,0,0]],inkBase:[[20,10,20,20],[0,0,0,0]],colorBase:[[10,10,10,20],[0,0,0,0]],strokeInk:[[80,40,40,80],[0,0,0,0]],strokeColor:[[30,70,10,80],[0,0,0,0]],inkSettled:null,colorSettled:null}
 const before=JSON.stringify(state),vector=preview(state.P.map((p,i)=>[p[2],...state.C[i]])),p=state.P.map((r,i)=>[r[0],r[1],vector[i][0],r[3]]),c=vector.map(v=>v.slice(1))
 expect(JSON.stringify(state)).toBe(before);expect(p).not.toEqual(state.P);expect(c).not.toEqual(state.C)
 for(let i=0;i<4;i++){expect(p[0][i]+p[1][i]).toBe(state.P[0][i]+state.P[1][i]);expect(c[0][i]+c[1][i]).toBe(state.C[0][i]+state.C[1][i])}
 expect(state.inkSettled).toBeNull();expect(state.colorSettled).toBeNull()
})
it('without persistent carrier a readonly branch cannot promise brush transport memory across contacts',()=>{
 const base=[200,0,0,200],film1=[100,0,0,100],film2=[100,200,0,200]
 const canonical1=land(base,film1),view1=preview([canonical1,[0,0,0,0]])
 const canonical2=land(base,film2),view2=preview([canonical2,[0,0,0,0]])
 expect(view1[1][0]).toBe(63);expect(view2[1][0]).toBe(47) // rederived from current source, not cumulative110
 expect(canonical2).toEqual([191,128,0,255]);expect(base).toEqual([200,0,0,200])
})
it('signed increments between fitted source states cannot be injected blindly into transported nonnegative carrier',()=>{
 const base=[200,0,0,200],s1=land(base,[100,0,0,100]),s2=land(base,[100,200,0,200])
 const delta=s2.map((v,i)=>v-s1[i]);expect(delta[0]).toBe(-64)
 const transported=[0,0,0,255],naive=transported.map((v,i)=>v+delta[i]);expect(naive[0]).toBeLessThan(0)
 // Clamp would add64 units relative to signed increment; no exact conservative
 // repair can be inferred from these independently fitted source records.
 expect(Math.max(0,naive[0])-naive[0]).toBe(64)
})
