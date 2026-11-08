import{it,expect}from'vitest'
import{sprayWashRegions}from'./sprayWash133'
import{stageSpraySourceRequest}from'./sprayRequestStage'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
import{advanceWashOpacity,creamyWash}from'./brushWash'
import{spray133,dab133}from'../../../../../../packages/shared/src/sprayWash133.testFixture'
it('request OVER precedes ONE Wash; captured opacity is applied once, unlike per-request OVER',()=>{
 // Independent exact rational witness: two half-alpha particles OVER give3/4.
 // Three such opaque-pigment requests into Wash asymptote; opaque cloud stays1.
 // For opaque request crossing, Wash ceiling1 then captured1/2 remains1/2.
 const rationalRequest=Number(1n*4n-(2n-1n)*(2n-1n))/4
 expect(rationalRequest).toBe(.75)
 const history={average:0,maximum:0},a=advanceWashOpacity(history,1),first=creamyWash([0,0,0,0],[1,0,0],1,1,1,a.average),b=advanceWashOpacity(history,1),cross=creamyWash(first,[1,0,0],1,1,1,b.average)
 expect(cross[3]*.5).toBe(.5);expect(1-(1-.5)**2).toBe(.75)
 // Independent premultiplied request: red1/2 then blue1/2 ->(1/4,0,1/2,3/4).
 // ONE Wash atO1/2 yields(1/8,0,1/4,3/8); per-particle Wash has different RGB.
 const grouped=creamyWash([0,0,0,0],[1/3,0,2/3],.75,.5,1,.5)
 const wrong=creamyWash(creamyWash([0,0,0,0],[1,0,0],.5,.5,1,.5),[0,0,1],.5,.5,1,.5)
 expect(grouped).toEqual([.125,0,.25,.375]);expect(wrong).toEqual([.28125,0,.09375,.375])

})
it('bounded regions preserve negative-world large clouds with no gaps/overlap or common-POT inflation',()=>{const tile={originX:-1000,originY:-700,buffer:{width:1300,height:900}},bounds={minX:-997,minY:-698,maxX:299,maxY:199},regions=[...sprayWashRegions(bounds,tile,512,512)];expect(regions).toHaveLength(6);expect(regions.every(r=>r.width<=512&&r.height<=512)).toBe(true);expect(regions.reduce((n,r)=>n+r.width*r.height,0)).toBe(1296*897);expect(regions[0]).toEqual({x:3,y:2,width:512,height:512,originX:-997,originY:-698});expect(()=>[...sprayWashRegions(bounds,tile,513,1)]).toThrow('exceeds512')})
it('staging keeps execution identity, RNG/frame/HSV/carry invariant across tiles and chunks and failures',()=>{const b=spray133(true);b.spray!.color={perParticle:true,hue:.7,saturation:.4,value:.3,randomOpacity:true};const input=[dab133(-2,0),dab133(3,50),dab133(-7,100)],execution={brushRandom:{version:1 as const,strokeSeed:123,sequentialSeed:456}},whole=beginBrushBehavior(input[0],execution),split=beginBrushBehavior(input[0],execution),expand=(state:typeof whole,d:typeof input[number])=>{const r:{spray?:{geometry:{x:number;y:number;radius:number};opacityScale:number;foreground:readonly[number,number,number]}}={};const stamps=behaviorStampsForDab(b,d,state,[.8,.2,.1],{sprayRequest:r});return{...r.spray!,stamps}};const expected=input.map(d=>{const tx=stageSpraySourceRequest(b,whole,s=>expand(s,d));tx.commit();return tx.prepared});const actual=[];for(const chunk of[input.slice(0,1),input.slice(1)])for(const d of chunk){const before=structuredClone(split),failed=stageSpraySourceRequest(b,split,s=>expand(s,d));expect(failed.working.execution).toBe(split.execution);failed.cancel();expect(split).toEqual(before);const tx=stageSpraySourceRequest(b,split,s=>expand(s,d));actual.push(tx.prepared);tx.commit()}expect(actual).toEqual(expected);expect(split).toEqual(whole);expect(actual.every(r=>r.stamps.length===2)).toBe(true);expect(actual.flatMap(r=>r.stamps).every(s=>s.mask&&s.color.length===3)).toBe(true)})
