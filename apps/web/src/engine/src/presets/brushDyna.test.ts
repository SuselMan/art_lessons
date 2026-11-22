import{expect,it}from'vitest'
import{dynaStamps,type DynaState}from'./brushDyna'
import type{BrushDyna,Dab}from'@grafetto/shared'
const options:BrushDyna={version:1,mass:0,drag:.65,diameter:3}
const dab=(x:number):Dab=>({x,y:20,size:3,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0})
const state=():DynaState=>({x:0,y:0,vx:0,vy:0,initialized:false})
it('preserves filtered movement and polygon geometry across chunk boundaries',()=>{
 const inputs=[dab(0),dab(10),dab(20),dab(35)],a=state();const full=inputs.flatMap(d=>dynaStamps(options,d,a,[.8,.1,.2]))
 let b=state();const first=inputs.slice(0,2).flatMap(d=>dynaStamps(options,d,b,[.8,.1,.2]));b=structuredClone(b);const chunks=[...first,...inputs.slice(2).flatMap(d=>dynaStamps(options,d,b,[.8,.1,.2]))]
 expect(chunks).toEqual(full);expect(b).toEqual(a);expect(full.length).toBe(3);expect(full[0].x).toBe(0);expect(full[0].polygon.points.length).toBe(4);expect(full[0].polygon.points[0].x).toBe(2)
})
