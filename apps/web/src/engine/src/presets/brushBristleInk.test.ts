import {expect,it} from 'vitest'
import {advanceBristleInkLine as advance,beginBristleInkLine as begin,createBristleInkProfile as profile,createBristleInkState as state,type BristleInkSettings} from './brushBristleInk'
const settings:BristleInkSettings={depletion:[0,.25,.5,1],useOpacity:true,useSaturation:false,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50}
it('consumes at each dominant-axis sample and omits only the AA terminal cap',()=>{
 const p=profile(settings),s=state(1),line=begin(s,0,[0,0],[3,1],.5,1,[1,0,0],true)
 const out=advance(p,s,line,2048)
 expect(out.done).toBe(true);expect(out.samples.map(x=>x.opacity)).toEqual([0,.5,.375,.25]);expect(out.samples.map(x=>[x.x,x.y])).toEqual([[0,0],[1,1/3],[2,2/3],[3,1]])
 expect(s.hairs[0]).toEqual({counter:4,inkAmount:0})
 const b=state(1);expect(advance(p,b,begin(b,0,[0,0],[3,1],1,1,[1,0,0],false),2048).samples).toHaveLength(5)
})
it('cloneable chunk continuations preserve per-sample color, counters and invisible consumption',()=>{
 const p=profile({...settings,useSaturation:true}),s=state(2),line=begin(s,0,[-2.5,-3.25],[17.25,5.5],.7,1.4,[1,.2,.1],true)
 const first=advance(p,s,line,3),copy=structuredClone({s,line}),tail=[]
 while(line.index<line.samples)tail.push(...advance(p,s,line,2).samples)
 const other=advance(p,copy.s,copy.line,2048)
 expect(other.samples).toEqual(tail);expect(copy.s).toEqual(s);expect(first.samples[0].opacity).toBe(0);expect(s.hairs[0].counter).toBe(line.samples);expect(s.hairs[1]).toEqual({counter:0,inkAmount:0})
})
it('long trajectories consume independently of chunk sizes and clamp the curve tail',()=>{
 const p=profile({...settings,depletion:[0,.5]}),a=state(1),b=state(1),la=begin(a,0,[0,0],[10000,2000],1,1,[1,0,0],true),lb=structuredClone(la),all=[]
 while(la.index<la.samples)all.push(...advance(p,a,la,2048).samples)
 const small=[];while(lb.index<lb.samples)small.push(...advance(p,b,lb,17).samples)
 expect(small).toEqual(all);expect(a).toEqual(b);expect(a.hairs[0]).toEqual({counter:10001,inkAmount:.5})
})
it('preserves native raw depletion weight rather than normalizing it a second time',()=>{
 const p=profile({...settings,useWeights:true}),s=state(1),line=begin(s,0,[0,0],[1,0],.2,.1,[1,0,0],true)
 expect(advance(p,s,line,1).samples[0].opacity).toBe(1)
 const zero=profile({...settings,useWeights:true,pressureWeight:0,bristleLengthWeight:0,bristleInkAmountWeight:0,inkDepletionWeight:0}),z=state(1)
 expect(advance(zero,z,begin(z,0,[0,0],[1,0],1,2,[1,0,0],true),1).samples[0].opacity).toBe(0)
})
it('saturation is repeated within a line and resets from captured hair color for a new line',()=>{
 const p=profile({...settings,depletion:[.5],useOpacity:false,useSaturation:true}),s=state(1);s.hairs[0].inkAmount=.5
 const a=advance(p,s,begin(s,0,[0,0],[2,0],1,1,[1,0,0],true),2048).samples
 expect(a[0].color).toEqual([159/255,96/255,96/255]);expect(a[1].color[0]).toBeLessThan(a[0].color[0]);expect(a.every(v=>v.opacity===1)).toBe(true)
 const b=advance(p,s,begin(s,0,[2,0],[3,0],1,1,[1,0,0],true),1).samples[0]
 expect(b.color).toEqual(a[0].color)
})
it('refuses invalid chunks and exhausted counters before mutating continuation',()=>{
 const p=profile(settings),s=state(1),line=begin(s,0,[0,0],[2,0],1,1,[1,0,0],true),copy=structuredClone({s,line})
 expect(()=>advance(p,s,line,0)).toThrow();expect({s,line}).toEqual(copy)
 s.hairs[0].counter=Number.MAX_SAFE_INTEGER;expect(()=>advance(p,s,line,2)).toThrow('exhausted');expect(line.index).toBe(0)
 expect(()=>profile({...settings,inkDepletionWeight:101})).toThrow();expect(()=>profile({...settings,depletion:[NaN]})).toThrow()
})

it('keeps original mask alpha when opacity depletion is disabled',()=>{const p=profile({...settings,useOpacity:false}),s=state(1);expect(advance(p,s,begin(s,0,[0,0],[1,0],.25,1,[1,0,0],true),2).samples.map(x=>x.opacity)).toEqual([.25,.25])})
